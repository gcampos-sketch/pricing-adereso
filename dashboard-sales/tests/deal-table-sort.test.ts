import { expect, test } from 'bun:test';
import type { DealDTO } from '../src/lib/pulse-types';
import { compareDealSort, dealKind, initialDealSort, toggleDealSort, type DealSort } from '../src/lib/deal-table-sort';

const row = (id: string, extra: Partial<DealDTO> = {}) => ({ id, name: id, probabilityValue: 70, closeDateValue: '2026-11-10', amountValue: 100, ...extra }) as DealDTO;
const sorted = (rows: DealDTO[], sorts: DealSort[]) => [...rows].sort((a, b) => compareDealSort(a, b, sorts)).map(deal => deal.id);

test('columns cycle descending, ascending, off without changing other priorities', () => {
  let sorts: DealSort[] = [];
  sorts = toggleDealSort(sorts, 'probability');
  sorts = toggleDealSort(sorts, 'amount');
  expect(sorts).toEqual([{ key: 'probability', dir: 'desc' }, { key: 'amount', dir: 'desc' }]);
  sorts = toggleDealSort(sorts, 'probability');
  expect(sorts[0]).toEqual({ key: 'probability', dir: 'asc' });
  sorts = toggleDealSort(sorts, 'probability');
  expect(sorts).toEqual([{ key: 'amount', dir: 'desc' }]);
  expect(toggleDealSort(toggleDealSort(sorts, 'amount'), 'amount')).toEqual([]);
});

test('the second selected column wins ties before any implicit date or name ordering', () => {
  const rows = [row('newer', { closeDateValue: '2026-12-01', amountValue: 50 }), row('larger', { amountValue: 200 }), row('highest', { probabilityValue: 90 })];
  expect(sorted(rows, [{ key: 'probability', dir: 'desc' }, { key: 'amount', dir: 'desc' }])).toEqual(['highest', 'larger', 'newer']);
  expect(sorted(rows, [{ key: 'probability', dir: 'desc' }, { key: 'amount', dir: 'asc' }])).toEqual(['highest', 'newer', 'larger']);
  expect(sorted(rows, [])).toEqual(['newer', 'larger', 'highest']);
});

test('three criteria apply in activation order and complete ties preserve source order', () => {
  const rows = [row('b', { amountValue: 50 }), row('c', { amountValue: 200 }), row('a', { amountValue: 200 })];
  expect(sorted(rows, [{ key: 'probability', dir: 'desc' }, { key: 'amount', dir: 'desc' }, { key: 'name', dir: 'asc' }])).toEqual(['a', 'c', 'b']);
  expect(sorted(rows, [{ key: 'probability', dir: 'desc' }])).toEqual(['b', 'c', 'a']);
});

test('missing dates stay last in both directions, and calendar days ignore time of day', () => {
  const rows = [row('missing', { closeDateValue: '' }), row('bad', { closeDateValue: 'invalid' }), row('later', { closeDateValue: '2026-12-01' }), row('early'), row('same', { closeDateValue: '2026-11-10T23:00:00Z' })];
  expect(sorted(rows, [{ key: 'closeDate', dir: 'asc' }])).toEqual(['early', 'same', 'later', 'missing', 'bad']);
  expect(sorted(rows, [{ key: 'closeDate', dir: 'desc' }])).toEqual(['later', 'early', 'same', 'missing', 'bad']);
});

test('defaults and explicit drilldown directions are represented by visible criteria', () => {
  expect(sorted([row('early'), row('late', { closeDateValue: '2026-12-01' }), row('high', { probabilityValue: 90 })], initialDealSort())).toEqual(['high', 'late', 'early']);
  expect(initialDealSort({ key: 'closeDate', dir: 'asc' })).toEqual([{ key: 'closeDate', dir: 'asc' }, { key: 'probability', dir: 'desc' }]);
  expect(initialDealSort({ key: 'amount', dir: 'asc' })).toEqual([{ key: 'amount', dir: 'asc' }]);
});

test('Upsell and Cross sell are separate filters, with common spelling variants', () => {
  for (const segment of ['Cross sell', 'cross_sell', 'cross-sell', 'crosssell']) expect(dealKind(row('a', { segment }))).toBe('crossSell');
  for (const segment of ['Upsell', 'up sell', 'up_sell']) expect(dealKind(row('a', { segment }))).toBe('upsell');
  for (const segment of ['Inbound', 'Outbound', 'Oportunidad', '']) expect(dealKind(row('a', { segment }))).toBe('opportunity');
});

test('contact and sequence columns use their displayed contact data', () => {
  const contacts = { a: { contactName: 'Zoe', contactEmail: null, contactCount: 1, sequenceActive: true, sequenceEver: true }, b: { contactName: 'Ana', contactEmail: null, contactCount: 1, sequenceActive: false, sequenceEver: true } };
  expect(compareDealSort(row('a'), row('b'), [{ key: 'contact', dir: 'asc' }], contacts)).toBeGreaterThan(0);
  expect(compareDealSort(row('a'), row('b'), [{ key: 'sequence', dir: 'desc' }], contacts)).toBeLessThan(0);
});
