import type { DealDTO } from './pulse-types';

/** Caller supplies the exact open-deal population shown for the quarter, and the displayed quota gap. */
export function pipelineCoverage(deals: Pick<DealDTO, 'id' | 'amountValue' | 'probabilityValue' | 'probability'>[], quota: number, gap: number) {
  let weighted = 0;
  for (const deal of new Map(deals.map(d => [d.id, d])).values()) {
    const amount = deal.amountValue;
    if (!Number.isFinite(amount) || amount < 0) return { weighted: null, coverage: null };
    if (amount === 0) continue;
    const probability = deal.probabilityValue;
    if (deal.probability === 's/n' || !Number.isFinite(probability) || probability < 0 || probability > 1) return { weighted: null, coverage: null };
    weighted += amount * probability;
  }
  return { weighted, coverage: quota > 0 && gap > 0 && Number.isFinite(gap) ? weighted / gap : null };
}
