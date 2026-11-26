import { searchAll } from './customer-directory.server';
import { acquisitionOf, segmentOf } from './deal-segment';
import { COMMERCIAL_PIPELINE, gateway, getCached, getPropertyOptionLabels, type RawDeal } from './hubspot.server';
import { roleOfOwner, type RoleFilter } from './owner-roles';
import {
  SDR_PIPELINE, STAGES, contactRole, creationPeriod, nativeTime, trackedMetaAd, type PipelineDeal, type PipelineReport, type StageId,
} from './pipeline-analysis';

const stageIds = Object.keys(STAGES) as StageId[];
const dealProperties = ['dealname', 'pipeline', 'dealstage', 'createdate', 'hubspot_owner_id', 'dealtype',
  'fuente_de_creacion', 'negocio_inbound', 'industria_deal', 'hs_analytics_source', 'hs_analytics_source_data_1',
  'hs_analytics_source_data_2', ...stageIds.map(id => `hs_v2_date_entered_${id}`)];
const contactProperties = ['key_contact', 'hs_analytics_first_url', 'hs_analytics_first_visit_timestamp', 'hs_analytics_first_timestamp'];

type ContactLink = { toObjectId: string | number; associationTypes: { label: string | null }[] };
type LinkPage = { results: ContactLink[]; paging?: { next?: { after: string } } };
type LinkBatch = {
  results: { from: { id: string }; to: ContactLink[]; paging?: LinkPage['paging'] }[];
  errors?: { subCategory: string; context?: { fromObjectId?: string[] } }[];
};

async function mapBatches<T>(items: T[], batchSize: number, read: (batch: T[]) => Promise<void>) {
  for (let offset = 0; offset < items.length; offset += batchSize * 3) {
    await Promise.all([0, 1, 2].map(slot => items.slice(offset + slot * batchSize, offset + (slot + 1) * batchSize))
      .filter(batch => batch.length).map(read));
  }
}

async function readContactEvidence(ids: string[]) {
  const links = new Map<string, ContactLink[]>();
  await mapBatches(ids, 75, async batch => {
    const expected = new Set(batch);
    try {
      const page = await gateway<LinkBatch>('/crm/v4/associations/deals/contacts/batch/read', {
        method: 'POST', body: JSON.stringify({ inputs: batch.map(id => ({ id })) }),
      });
      for (const error of page.errors ?? []) {
        if (error.subCategory === 'crm.associations.NO_ASSOCIATIONS_FOUND') {
          for (const id of error.context?.fromObjectId ?? []) if (expected.has(id)) links.set(id, []);
        }
      }
      for (const row of page.results ?? []) {
        if (!expected.has(row.from.id)) continue;
        const all = [...row.to];
        let after = row.paging?.next?.after;
        const seen = new Set<string>();
        try {
          while (after) {
            if (seen.has(after)) throw Error('Paginación repetida.');
            seen.add(after);
            const next = await gateway<LinkPage>(`/crm/v4/objects/deals/${row.from.id}/associations/contacts?limit=500&after=${encodeURIComponent(after)}`);
            all.push(...next.results);
            after = next.paging?.next?.after;
          }
          links.set(row.from.id, all);
        } catch {
          links.delete(row.from.id);
        }
      }
    } catch {
      // A missing batch remains unknown for its deals. Milestones still come from the completed deal read.
    }
  });

  const contactIds = [...new Set([...links.values()].flatMap(group => group.map(link => String(link.toObjectId))))];
  const contacts = new Map<string, RawDeal>();
  await mapBatches(contactIds, 100, async batch => {
    const expected = new Set(batch);
    try {
      const response = await gateway<{ results: RawDeal[] }>('/crm/v3/objects/contacts/batch/read', {
        method: 'POST', body: JSON.stringify({ inputs: batch.map(id => ({ id })), properties: contactProperties }),
      });
      for (const row of response.results ?? []) if (expected.has(row.id)) contacts.set(row.id, row);
    } catch {
      // No credit is assigned from a subset of a deal's contacts.
    }
  });
  return { links, contacts };
}

type Scope = { periods: string[]; role: RoleFilter; owner: string };
async function loadPipelineAnalysis({ periods, role, owner }: Scope): Promise<PipelineReport> {
  const readAt = new Date();
  const now = readAt.getTime();
  const [records, sourceLabels, industryLabels, typeLabels] = await Promise.all([
    searchAll('deals', [SDR_PIPELINE, COMMERCIAL_PIPELINE].map(value => ({
      filters: [{ propertyName: 'pipeline', operator: 'EQ', value }],
    })), dealProperties),
    getPropertyOptionLabels('fuente_de_creacion'), getPropertyOptionLabels('industria_deal'), getPropertyOptionLabels('dealtype'),
  ]);
  const scoped = [...new Map(records.map(row => [row.id, row])).values()].filter(({ properties: p }) =>
    (p['pipeline'] === SDR_PIPELINE || p['pipeline'] === COMMERCIAL_PIPELINE) &&
    (owner === 'team' || owner === p['hubspot_owner_id']) &&
    (role === 'all' || roleOfOwner(p['hubspot_owner_id'] ?? '') === role));
  const cohort = scoped.filter(row => periods.includes(creationPeriod(row.properties['createdate'], now) ?? ''));
  const { links, contacts } = await readContactEvidence(cohort.map(row => row.id));
  const deals = cohort.map(({ id, properties: p }): PipelineDeal => {
    const associated = links.get(id);
    const contactRead = Boolean(associated?.every(link => contacts.has(String(link.toObjectId))));
    const linked = contactRead ? (associated ?? []).map(link => {
      const contact = contacts.get(String(link.toObjectId))!;
      return { ...contact, labels: link.associationTypes.flatMap(type => type.label ? [type.label] : []) };
    }) : [];
    const motion = acquisitionOf(p);
    const ad = motion === 'Inbound' ? trackedMetaAd(linked, p['createdate']) : null;
    const entries: PipelineDeal['entries'] = {};
    for (const stage of stageIds) {
      const date = p[`hs_v2_date_entered_${stage}`];
      if (date && nativeTime(date) <= now) entries[stage] = date;
    }
    const source = p['fuente_de_creacion']?.trim() ?? '';
    const industry = p['industria_deal']?.trim() ?? '';
    const type = p['dealtype']?.trim() ?? '';
    const traffic = p['hs_analytics_source'];
    const analyticsCampaign = traffic === 'PAID_SOCIAL' ? p['hs_analytics_source_data_2'] : traffic === 'PAID_SEARCH' ? p['hs_analytics_source_data_1'] : null;
    return {
      id, name: p['dealname']?.trim() || `Deal ${id}`, stage: p['dealstage'] ?? '', commercial: p['pipeline'] === COMMERCIAL_PIPELINE,
      createdAt: p['createdate'] ?? '', entries, motion, segment: segmentOf(p),
      source, sourceLabel: sourceLabels.get(source) || source || 'Sin fuente',
      industry: industryLabels.get(industry) || industry || 'Sin industria',
      dealType: typeLabels.get(type) || type || 'Sin tipo',
      role: contactRead ? contactRole(linked) : 'Lectura pendiente',
      adId: ad?.id ?? null,
      campaign: ad?.campaign || (analyticsCampaign ? `${analyticsCampaign} (fuente original)` : 'Sin campaña rastreada'),
      contactRead,
    };
  });
  return { readAt: readAt.toISOString(), undated: scoped.filter(row => creationPeriod(row.properties['createdate'], now) === null).length, deals };
}

export function readPipelineAnalysis(scope: Scope) {
  return getCached(`pipeline-analysis/v1:${scope.role}:${scope.owner}:${scope.periods.join(',')}`, 90_000, () => loadPipelineAnalysis(scope));
}
