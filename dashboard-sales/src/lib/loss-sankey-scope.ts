import type { InsightDeal } from './insights-types';
import { wonAcquisitionSource } from './won-distribution';
import { flowQuarter } from './stage-date-scope';

export type LossDateBasis = 'entry' | 'close';
export type LossOrigin = 'all' | 'inbound';
export const LOSS_ENTRY_DATES_VERSION = 'native-loss-entry/v1' as const;

/** Exact native creation-source options, never deal segment/type or an arbitrary 'inbound' substring. */
export function isLossInbound(deal: Pick<InsightDeal, 'source' | 'sourceLabel'>): boolean {
  const source = deal.source ?? deal.sourceLabel;
  return wonAcquisitionSource({ source }) === 'inbound' || source.trim().toLowerCase() === 'form de contacto inbound cassper';
}
export function lossEntryDate(properties: Record<string, string | null | undefined>, stageId: string, lostStageIds: ReadonlySet<string>): string | null {
  if (!lostStageIds.has(stageId)) return null;
  const raw = properties[`hs_v2_date_entered_${stageId}`];
  return raw && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(raw) && Number.isFinite(Date.parse(raw)) ? raw : null;
}
export function lossSankeyMonths(periods: readonly string[]) {
  const months = new Set<string>();
  for (const period of periods) {
    const match = /^(\d{4})-Q([1-4])$/.exec(period);
    if (!match) continue;
    const first = (Number(match[2]) - 1) * 3 + 1;
    for (let month = first; month < first + 3; month++) {
      months.add(`${match[1]}-${String(month).padStart(2, '0')}`);
    }
  }
  return [...months].sort();
}

export function scopeLossSankey(input: InsightDeal[], options: { periods: string[]; origin: LossOrigin; basis: LossDateBasis; readAt: string; month?: string }) {
  const periods = new Set(options.periods);
  const candidates = [...new Map(input.filter(deal => deal.status === 'lost' && (options.origin === 'all' || isLossInbound(deal))).map(deal => [deal.id, deal])).values()];
  const dateOf = (deal: InsightDeal) => options.basis === 'entry' ? deal.lostEnteredAt : deal.closeDateValue;
  const valid = (date: string | null | undefined) => Boolean(date && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(date) && Number.isFinite(Date.parse(date)) &&
    (options.basis === 'close' || Date.parse(date) <= Date.parse(options.readAt)));
  const periodDeals = candidates.filter(deal => valid(dateOf(deal)) && periods.has(flowQuarter(dateOf(deal) ?? undefined)));
  return {
    periodDeals,
    deals: options.month ? periodDeals.filter(deal => new Date(dateOf(deal)!).toISOString().slice(0, 7) === options.month) : periodDeals,
    missingDates: candidates.filter(deal => !valid(dateOf(deal))),
    candidates,
  };
}
