import { expect, test } from 'bun:test';
import { lossMonthlyHistory, lossValuation, lossTicketComparison } from '../src/lib/loss-summary';
import type { InsightDeal } from '../src/lib/insights-types';
const deal = (id: string, close: string, amount: number, status = 'lost') => ({ id, closeDateValue: close, amountValue: amount, status } as InsightDeal);
const periods = ['2026-Q2', '2026-Q3', '2026-Q4'];
test('monthly ticket uses its own exact close population including zero amounts, without counting duplicate ids or wins', () => {
  const a = deal('a', '2026-10-05', 900);
  const result = lossMonthlyHistory([a, a, deal('b', '2026-10-10', 0), deal('won', '2026-10-10', 9000, 'won'), deal('nov', '2026-11-01', 100)], periods, '2026', '4', '2026-11-18T12:00:00Z');
  expect(result.map(row => row.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  expect(result[4]).toMatchObject({ amount: 900, count: 2, ticket: 450, partial: false });
  expect(result[5]).toMatchObject({ amount: 100, count: 1, ticket: 100, partial: true });
});
test('missing history remains unknown and an empty covered month has no average', () => {
  const result = lossMonthlyHistory([], ['2026-Q4'], '2026', '4', '2026-11-18T12:00:00Z');
  expect(result[0]).toMatchObject({ amount: null, count: null, ticket: null });
  expect(result[4]).toMatchObject({ amount: 0, count: 0, ticket: null });
});
test('past-period trends end at the selected quarter and cross years chronologically', () => {
  const result = lossMonthlyHistory([], ['2025-Q4', '2026-Q1'], '2026', '1', '2026-11-18T12:00:00Z');
  expect(result.map(row => row.month)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
  expect(result.some(row => row.partial)).toBe(false);
});

test('valuation coverage counts only positive finite MRR and keeps zero/unknown deals in its denominator', () => {
  const rows = [deal('a', '', 200), deal('b', '', 0), deal('c', '', NaN), deal('d', '', -1)];
  expect(lossValuation(rows)).toEqual({ valuedCount: 1, valuedPercent: 25 });
  expect(lossValuation([])).toEqual({ valuedCount: 0, valuedPercent: null });
});
test('ticket difference uses the team deal-weighted average including zero deals and the selected owner', () => {
  const mine = [deal('a', '', 600)];
  const team = [...mine, deal('b', '', 0), deal('c', '', 300)];
  expect(lossTicketComparison(mine, team)).toEqual({ teamTicket: 300, differencePercent: 100 });
  expect(lossTicketComparison([team[1]], team)).toEqual({ teamTicket: 300, differencePercent: -100 });
  expect(lossTicketComparison(team, team)).toEqual({ teamTicket: 300, differencePercent: 0 });
});
test('ticket difference stays unknown when either population is missing or the team base is zero', () => {
  expect(lossTicketComparison([], [deal('a', '', 100)]).differencePercent).toBeNull();
  expect(lossTicketComparison([deal('a', '', 100)], []).differencePercent).toBeNull();
  expect(lossTicketComparison([deal('a', '', 0)], [deal('b', '', 0)]).differencePercent).toBeNull();
});
