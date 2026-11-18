import { gateway, COMMERCIAL_PIPELINE } from './hubspot.server';
import { LOST_STAGES } from './pulse.server';
import { lossPriorScore, type LossHistoryVersion, type LossPriorScore } from './loss-prior-score';
export async function readLossPriorScores(ids: string[]): Promise<Record<string, LossPriorScore>> {
  const response = await gateway<{ status?: string; numErrors?: number; errors?: unknown[]; results?: { id: string; properties: Record<string,string|null>; propertiesWithHistory?: Record<string,LossHistoryVersion[]> }[] }>(
    '/crm/v3/objects/deals/batch/read', { method: 'POST', body: JSON.stringify({ inputs: ids.map(id => ({id})),
      properties: ['pipeline','dealstage', ...[...LOST_STAGES].map(id => `hs_v2_date_entered_${id}`)],
      propertiesWithHistory: ['dealstage','adobo_closing_score','hs_deal_stage_probability'] }) });
  const rows = response.results ?? [];
  if ((response.status && response.status !== 'COMPLETE') || response.numErrors || response.errors?.length || rows.length !== ids.length || new Set(rows.map(r=>r.id)).size !== ids.length || rows.some(r=>!ids.includes(r.id))) throw Error('No se pudo verificar todo el historial de este grupo. Vuelve a intentar.');
  const readAt = new Date().toISOString();
  return Object.fromEntries(rows.map(row => [row.id, lossPriorScore(row.id, row.properties, row.propertiesWithHistory ?? {}, LOST_STAGES, COMMERCIAL_PIPELINE, readAt)]));
}
