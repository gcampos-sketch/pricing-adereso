import { expect, test } from 'bun:test';
import { isLossInbound, lossEntryDate, scopeLossSankey } from '../src/lib/loss-sankey-scope';
import { buildLossSankey } from '../src/lib/loss-sankey';
import type { InsightDeal } from '../src/lib/insights-types';
const row = (id: string, entry: string | null, close: string, source = 'Form de Contacto Inbound') => ({ id, status: 'lost', lostEnteredAt: entry, closeDateValue: close, source, sourceLabel: source, ownerId: 'a', owner: 'Gonza', lostStage: 'E5', lostReason: 'Ghosting', amountValue: 100 } as InsightDeal);
const base = { periods: ['2026-Q4'], origin: 'inbound' as const, readAt: '2026-11-17T23:00:00Z' };
test('entry and close select independent cohorts, without a prior close-date prefilter or creation/close fallback', () => {
  const input = [row('entry-q4', '2026-10-10T12:00:00Z', '2027-01-15'), row('close-q4', '2026-09-30T12:00:00Z', '2026-10-15'), row('missing', null, '2026-10-15'), row('invalid', 'invalid', '2026-10-15'), row('future-entry', '2026-12-01T12:00:00Z', '2026-10-15')];
  const entered = scopeLossSankey(input, { ...base, basis: 'entry' });
  expect(entered.deals.map(deal => deal.id)).toEqual(['entry-q4']);
  expect(entered.missingDates.map(deal => deal.id)).toEqual(['missing', 'invalid', 'future-entry']);
  expect(scopeLossSankey(input, { ...base, basis: 'close' }).deals.map(deal => deal.id)).toEqual(['close-q4', 'missing', 'invalid', 'future-entry']);
  expect(input[0]!.closeDateValue).toBe('2027-01-15');
});
test('inbound uses exact creation sources and never segment, dealtype, loose substring, or current role', () => {
  for (const source of ['Form de Contacto Inbound', 'Form de Contacto Inbound [Adereso]', 'Form de Contacto Inbound Cassper']) expect(isLossInbound(row('a', null, '', source))).toBe(true);
  for (const source of ['Prospección SDR', 'KAM', 'Otra campaña inbound', '']) expect(isLossInbound({ ...row('a', null, '', source), segment: 'Inbound', dealType: 'newbusiness' })).toBe(false);
  const inbound = row('in', '2026-10-01', '2026-10-01');
  const outbound = row('out', '2026-10-01', '2026-10-01', 'Prospección SDR');
  expect(scopeLossSankey([inbound, outbound, inbound], { ...base, basis: 'entry' }).deals.map(deal => deal.id)).toEqual(['in']);
  expect(scopeLossSankey([inbound, outbound], { ...base, basis: 'entry', origin: 'all' }).deals).toHaveLength(2);
});
test('native entry reader binds to the exact lost stage, never another loss stage or closedate', () => {
  const lost = new Set(['lost', 'lost-development']);
  const properties = { hs_v2_date_entered_lost: '2026-10-01T12:00:00Z', closedate: '2026-11-01' };
  expect(lossEntryDate(properties, 'lost', lost)).toBe('2026-10-01T12:00:00Z');
  expect(lossEntryDate(properties, 'lost-development', lost)).toBeNull();
  expect(lossEntryDate(properties, 'won', lost)).toBeNull();
  expect(lossEntryDate({ closedate: '2026-11-01' }, 'lost', lost)).toBeNull();
});
test('filtered graph preserves exact node/edge membership and excludes invalid-close dates without using legacy period', () => {
  const valid = row('a', '2026-10-01', '2026-10-02');
  const missingClose = { ...row('b', '2026-10-01', ''), period: '2026-Q4' };
  const scope = scopeLossSankey([valid, missingClose], { ...base, basis: 'close' });
  expect(scope.deals.map(deal => deal.id)).toEqual(['a']);
  expect(scope.missingDates.map(deal => deal.id)).toEqual(['b']);
  const graph = buildLossSankey(scope.deals);
  for (const link of graph.links) expect(link.deals.map(deal => deal.id)).toEqual(['a']);
});
