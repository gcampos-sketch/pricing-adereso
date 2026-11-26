import { LOST_STAGES } from './commercial-outcomes';
import { readDealActivityChannel } from './deal-activity-analysis.server';
import { activityChannels } from './deal-activity-analysis';
import { COMMERCIAL_PIPELINE, gateway, getAdoboPropertyHistory, type RawDeal } from './hubspot.server';
import { corroboratedLossTransition } from './loss-prior-score';
import type { LossActivityEvidence } from './loss-sankey-activity';
import { STAGE_FULL_LABELS, STAGE_KEY } from './pulse.server';

export async function readLossSankeyActivity(ids: string[]): Promise<Record<string, LossActivityEvidence>> {
  const response = await gateway<{ status?: string; results: RawDeal[]; numErrors?: number; errors?: unknown[] }>(
    '/crm/v3/objects/deals/batch/read', {
      method: 'POST',
      body: JSON.stringify({
        inputs: ids.map(id => ({ id })),
        properties: ['pipeline', 'dealstage', 'createdate', ...[...LOST_STAGES].map(stage => `hs_v2_date_entered_${stage}`)],
      }),
    },
  );
  if ((response.status && response.status !== 'COMPLETE') || response.numErrors || response.errors?.length ||
      response.results.length !== ids.length || new Set(response.results.map(deal => deal.id)).size !== ids.length ||
      response.results.some(deal => !ids.includes(deal.id))) throw new Error('Lectura incompleta de deals');

  const eligible = response.results.filter(({ properties }) =>
    properties['pipeline'] === COMMERCIAL_PIPELINE && LOST_STAGES.has(properties['dealstage'] ?? ''));
  if (!eligible.length) return {};

  const history = await getAdoboPropertyHistory(eligible.map(deal => deal.id), ['dealstage']);
  if (!history?.complete) throw new Error('Historial de etapas incompleto');
  const rows = eligible.flatMap(({ id, properties }) => {
    const stage = properties['dealstage']!;
    const transition = corroboratedLossTransition(stage, properties[`hs_v2_date_entered_${stage}`],
      history.byDeal.get(id)?.['dealstage'], Date.parse(history.fetchedAt));
    if (!transition) return [];
    const previous = transition.previousStageId;
    return [{
      id,
      enteredAt: transition.cutoff,
      previousStage: previous && !LOST_STAGES.has(previous) ? STAGE_FULL_LABELS[previous] ?? STAGE_KEY.get(previous) ?? null : null,
      createdAt: Date.parse(properties['createdate'] ?? ''),
    }];
  });
  const dated = rows.filter(row => Number.isFinite(row.createdAt) && row.createdAt <= row.enteredAt);
  const evidence: Record<string, LossActivityEvidence> = Object.fromEntries(rows.map(row => [
    row.id, { enteredAt: row.enteredAt, previousStage: row.previousStage, counts: {
      emails: null, communications: null, calls: null, meetings: null,
    } },
  ]));

  if (!dated.length) return evidence;
  await Promise.all(activityChannels.map(async channel => {
    const { events, unavailable, undated } = await readDealActivityChannel(channel, dated, new Map());
    const incomplete = new Set([...unavailable, ...undated]);
    for (const { id, createdAt, enteredAt } of dated) {
      if (incomplete.has(id)) continue;
      evidence[id]!.counts[channel] = (events[id] ?? []).filter(event =>
        event.counted && event.at >= createdAt && event.at < enteredAt).length;
    }
  }));
  return evidence;
}
