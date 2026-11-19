import { closeMonthKey } from './deal-month-summary';
import type { InsightDeal } from './insights-types';

export type LossMonth = { month: string; label: string; amount: number | null; count: number | null; ticket: number | null; partial: boolean; deals: InsightDeal[] };

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
    const rows = unique.filter(deal => closeMonthKey(deal.closeDateValue) === month);
    const amount = rows.reduce((total, deal) => total + deal.amountValue, 0);
    return { month, label: date.toLocaleDateString('es-CL', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      amount: covered ? amount : null, count: covered ? rows.length : null,
      ticket: covered && rows.length ? amount / rows.length : null, partial: end - 5 + index === readMonth, deals: covered ? rows : [] };
  });
}

/** Valued means a recorded finite MRR > 0; the denominator keeps every scoped lost deal. */
export function lossValuation(deals: InsightDeal[]) {
  const valuedCount = deals.filter(deal => Number.isFinite(deal.amountValue) && deal.amountValue > 0).length;
  return { valuedCount, valuedPercent: deals.length ? valuedCount / deals.length * 100 : null };
}

/** Team averages include $0 deals, and compare averages rather than total MRR or owner averages. */
export function lossTicketComparison(selected: InsightDeal[], team: InsightDeal[]) {
  const average = (deals: InsightDeal[]) => deals.length ? deals.reduce((total, deal) => total + deal.amountValue, 0) / deals.length : null;
  const selectedTicket = average(selected);
  const teamTicket = average(team);
  const differencePercent = selectedTicket !== null && Number.isFinite(selectedTicket) && teamTicket !== null && Number.isFinite(teamTicket) && teamTicket > 0
    ? (selectedTicket / teamTicket - 1) * 100 : null;
  return { teamTicket, differencePercent };
}

type LossAmount = { id: string; ownerId: string; owner: string; amountValue: number };

export function summarizeLossByOwner(input: readonly LossAmount[]) {
  const deals = new Map(input.map(deal => [deal.id, deal]));
  const owners = new Map<string, { id: string; name: string; count: number; mrr: number }>();
  let mrr = 0;
  for (const deal of deals.values()) {
    const id = deal.ownerId || '';
    const owner = owners.get(id) ?? { id, name: deal.owner || 'Sin comercial', count: 0, mrr: 0 };
    const amount = Number.isFinite(deal.amountValue) ? deal.amountValue : 0;
    owner.count++;
    owner.mrr += amount;
    owners.set(id, owner);
    mrr += amount;
  }
  return {
    count: deals.size,
    mrr,
    owners: [...owners.values()]
      .sort((a, b) => b.count - a.count || b.mrr - a.mrr || a.name.localeCompare(b.name, 'es')),
  };
}
