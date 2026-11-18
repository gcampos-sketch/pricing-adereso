import type { InsightDeal } from './insights-types';

export type LossMonth = { month: string; label: string; amount: number | null; count: number | null; ticket: number | null; partial: boolean };

/** Monthly close-date history, independent of the selected quarter's aggregate. */
export function lossMonthlyHistory(deals: InsightDeal[], coveredPeriods: string[], year: string, quarter: string, generatedAt: string): LossMonth[] {
  const readAt = new Date(generatedAt);
  const readMonth = Number.isFinite(readAt.getTime()) ? readAt.getUTCFullYear() * 12 + readAt.getUTCMonth() : -1;
  const selectedEnd = Number(year) * 12 + (quarter === 'all' ? 11 : Number(quarter) * 3 - 1);
  const end = Math.min(selectedEnd, readMonth);
  if (!Number.isFinite(end) || end < 0) return [];
  const unique = [...new Map(deals.filter(deal => deal.status === 'lost').map(deal => [deal.id, deal])).values()];
  return Array.from({ length: 6 }, (_, index) => {
    const monthIndex = end - 5 + index;
    const date = new Date(Date.UTC(Math.floor(monthIndex / 12), monthIndex % 12, 1));
    const month = date.toISOString().slice(0, 7);
    const period = `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    const covered = coveredPeriods.includes(period);
    const rows = unique.filter(deal => deal.closeDateValue?.slice(0, 7) === month);
    const amount = rows.reduce((total, deal) => total + deal.amountValue, 0);
    return { month, label: date.toLocaleDateString('es-CL', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      amount: covered ? amount : null, count: covered ? rows.length : null,
      ticket: covered && rows.length ? amount / rows.length : null, partial: end - 5 + index === readMonth };
  });
}
