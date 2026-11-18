import { gateway, getCached, getOwners, invalidateCache, COMMERCIAL_PIPELINE, getPropertyOptionLabels, type RawDeal } from './hubspot.server';
import { readCustomerCompanyLinks } from './customer-directory.server';
import { toDTO } from './pulse.server';
import {
  PRICE_WON_STAGES, PRICE_WIN_DATES, PRICE_LOST_STAGE, firstPriceDate, priceCohorts,
  priceNumber, proposalDate, type PriceLinks, type PriceReport,
} from './price-conversion';
import { roleOwnerIds, type RoleFilter } from './owner-roles';

const PROPERTIES = [
  'pipeline', 'dealname', 'dealstage', 'createdate', 'closedate', 'hubspot_owner_id', 'dealtype',
  'amount', 'hs_mrr', 'otf', 'deal_currency_code', 'moneda_cotizacion', 'productos_a_contratar',
  'modelo_pricing_deal', 'plan_de_bot', 'cantidad_de_tickets', 'fuente_de_creacion', 'negocio_inbound',
  'industria_deal', 'tamano_de_empresa_deal', 'tamano_empresa_empleados', 'pais',
  'closed_lost_reason', 'hs_v2_date_entered_171385867', 'hs_v2_date_entered_1245768029', ...PRICE_WIN_DATES,
];

/** No capped/sampled search may masquerade as a complete demand population. */
export async function readPriceRecords(request = gateway): Promise<RawDeal[]> {
  const rows: RawDeal[] = [];
  let after: string | undefined, total: number | undefined;
  const seen = new Set<string>();
  do {
    const page = await request<{ total: number; results: RawDeal[]; paging?: { next?: { after: string } } }>(
      '/crm/v3/objects/deals/search', {
        method: 'POST', body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: COMMERCIAL_PIPELINE }] }],
          properties: PROPERTIES, limit: 200, sorts: ['hs_object_id'], ...(after ? { after } : {}),
        }),
      });
    if (!Number.isInteger(page.total) || (total !== undefined && total !== page.total))
      throw Error('La población comercial cambió durante la lectura. Vuelve a cargar el análisis.');
    total = page.total;
    rows.push(...page.results);
    after = page.paging?.next?.after;
    if (after && (seen.has(after) || Number(after) >= 10000)) throw Error('Lectura de precios incompleta.');
    if (after) seen.add(after);
  } while (after);
  if (rows.length !== total || new Set(rows.map(row => row.id)).size !== total)
    throw Error('Faltan negocios para completar el análisis de precios.');
  return rows;
}

async function priceCompanyLinks(records: RawDeal[]) {
  const links: PriceLinks = {};
  let complete = true;
  const relevant = records.filter(row => PRICE_WON_STAGES.has(row.properties['dealstage'] ?? '') ||
    PRICE_WIN_DATES.some(key => row.properties[key]) || row.properties['dealstage'] === PRICE_LOST_STAGE);
  const batches = Array.from({ length: Math.ceil(relevant.length / 25) }, (_, index) => relevant.slice(index * 25, index * 25 + 25));
  for (let offset = 0; offset < batches.length; offset += 2) {
    await Promise.all(batches.slice(offset, offset + 2).map(async batch => {
      try {
        const page = await readCustomerCompanyLinks(batch.map(row => row.id));
        for (const error of page.errors ?? []) {
          if (error.subCategory !== 'crm.associations.NO_ASSOCIATIONS_FOUND') complete = false;
          else for (const id of error.context?.fromObjectId ?? []) links[id] = [];
        }
        for (const row of page.results) {
          const all = [...row.to];
          let after = row.paging?.next?.after;
          const seen = new Set<string>();
          while (after) {
            if (seen.has(after)) throw Error('Asociaciones incompletas.');
            seen.add(after);
            const next = await gateway<{ results: typeof all; paging?: { next?: { after: string } } }>(
              `/crm/v4/objects/deals/${row.from.id}/associations/companies?limit=500&after=${encodeURIComponent(after)}`);
            all.push(...next.results);
            after = next.paging?.next?.after;
          }
          links[row.from.id] = all.map(link => ({ id: String(link.toObjectId), primary: link.associationTypes.some(type => type.typeId === 5 && type.category === 'HUBSPOT_DEFINED') }));
        }
        if (batch.some(row => !(row.id in links))) complete = false;
      } catch {
        // Keep valid price observations, but never infer acquisition from incomplete company evidence.
        complete = false;
      }
    }));
  }
  return { links, complete };
}

/** Lazy, read-only, same corporate MFA gateway as Pulse. No CRM changes or persisted customer snapshots. */
export async function readPriceReport(role: RoleFilter, fresh = false): Promise<PriceReport> {
  if (fresh) invalidateCache('price-conversion/detail-v2');
  const base = await getCached('price-conversion/detail-v2', 90_000, async (): Promise<PriceReport> => {
    const [records, owners, industries, sizes, employeeSizes, types] = await Promise.all([readPriceRecords(), getOwners(),
      getPropertyOptionLabels('industria_deal'), getPropertyOptionLabels('tamano_de_empresa_deal'),
      getPropertyOptionLabels('tamano_empresa_empleados'), getPropertyOptionLabels('dealtype')]);
    const label = (map: Map<string, string>, value: string | null | undefined) => value?.trim() ? map.get(value.trim()) || value.trim() : '';
    const companies = await priceCompanyLinks(records);
    const cohorts = priceCohorts(records, companies.links, companies.complete);
    const names = new Map(owners.map(owner => [owner.id, `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || 'Sin nombre']));
    const now = Date.now();
    const rows = records.filter(row => PRICE_WON_STAGES.has(row.properties['dealstage'] ?? '') || row.properties['dealstage'] === PRICE_LOST_STAGE)
      .map(record => {
        const p = record.properties;
        return {
          deal: toDTO(record, names, now, now),
          industry: label(industries, p['industria_deal']),
          companySize: label(sizes, p['tamano_de_empresa_deal']) || label(employeeSizes, p['tamano_empresa_empleados']),
          dealTypeLabel: label(types, p['dealtype']),
          monthly: priceNumber(p['hs_mrr']), setup: priceNumber(p['otf']),
          // Amount currency is authoritative; quotation currency does not redenominate hs_mrr or otf.
          currency: p['deal_currency_code']?.trim().toUpperCase() || '',
          quotationCurrency: p['moneda_cotizacion']?.trim() || '',
          product: p['productos_a_contratar']?.trim() || '', plan: p['plan_de_bot']?.trim() || '',
          pricingModel: p['modelo_pricing_deal']?.trim() || '', volume: priceNumber(p['cantidad_de_tickets']),
          proposalAt: proposalDate(record), won: PRICE_WON_STAGES.has(p['dealstage'] ?? ''),
          cohort: cohorts.get(record.id) ?? 'unknown' as const,
        };
      });
    return { version: 'price-conversion/v1', readAt: new Date(now).toISOString(), complete: true,
      totalCommercial: records.length, companyCoverageComplete: companies.complete, rows };
  });
  const ids = roleOwnerIds(role);
  return { ...base, rows: ids ? base.rows.filter(row => ids.has(row.deal.ownerId)) : base.rows };
}
