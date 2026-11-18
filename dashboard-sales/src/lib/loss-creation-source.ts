import type { InsightDeal } from './insights-types';

/** Native fuente_de_creacion only; never infer source from deal type or segment. */
export const lossCreationSource = (deal: Pick<InsightDeal, 'source' | 'sourceLabel'>): string =>
  (deal.source ?? deal.sourceLabel ?? '').trim() || 'Sin fuente';

export function scopeLossCreationSource<T extends Pick<InsightDeal, 'source' | 'sourceLabel'>>(deals: T[], source: string): T[] {
  return source === '' ? deals : deals.filter(deal => lossCreationSource(deal) === source);
}

export function lossCreationSources(deals: InsightDeal[]): string[] {
  return [...new Set(deals.filter(deal => deal.status === 'lost').map(lossCreationSource))].sort((a, b) => a.localeCompare(b, 'es'));
}
