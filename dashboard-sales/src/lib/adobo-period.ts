import type { DealDTO } from './pulse-types';
import { dealIntelligence } from './adobo-intelligence';

/** Use the same expected/actual close-date scope as the pipeline quarter filter. */
export function adoboPeriodDeals(deals: DealDTO[], periods: readonly string[]): DealDTO[] {
  const selected = new Set(periods);
  const unique = new Map<string, DealDTO>();
  for (const deal of deals) {
    const at = new Date(deal.closeDateValue);
    if (!Number.isFinite(at.getTime())) continue;
    const period = `${at.getUTCFullYear()}-Q${Math.floor(at.getUTCMonth() / 3) + 1}`;
    if (selected.has(period)) unique.set(deal.id, deal);
  }
  return [...unique.values()];
}

/** Sort keys for Adobo lists; the default order is score, highest first. */
export type AdoboSortKey = 'score' | 'mrr' | 'closeDate';

/** Comparator over deals: score desc (default), MRR desc, close date desc; deals without the key go last. */
export function adoboSortCompare(key: AdoboSortKey, now: number): (a: DealDTO, b: DealDTO) => number {
  if (key === 'mrr') return (a, b) => b.amountValue - a.amountValue;
  if (key === 'closeDate') return (a, b) => (Date.parse(b.closeDateValue) || -Infinity) - (Date.parse(a.closeDateValue) || -Infinity);
  return (a, b) => (dealIntelligence(b, now).score ?? -Infinity) - (dealIntelligence(a, now).score ?? -Infinity);
}