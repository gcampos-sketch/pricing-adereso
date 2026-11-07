import { expect, test } from 'bun:test';
import { compareDealClosePriority } from '../src/lib/deal-close-priority';

const deal = (id: string, closeDateValue: string, probabilityValue: number) => ({ id, name: id, closeDateValue, probabilityValue });
test('prioritizes earliest close day, then highest probability, with missing dates last', () => {
  const rows = [deal('late', '2026-12-01', 100), deal('low', '2026-11-10', 20), deal('unknown', '', 100), deal('high', '2026-11-10T12:00:00Z', 80), deal('invalid', 'bad', 10)];
  expect([...rows].sort(compareDealClosePriority).map(d => d.id)).toEqual(['high', 'low', 'late', 'unknown', 'invalid']);
  expect([...rows].sort((a,b)=>compareDealClosePriority(a,b,'desc')).map(d=>d.id)).toEqual(['late', 'high', 'low', 'unknown', 'invalid']);
});
test('ties remain deterministic and a zero probability remains valid', () => {
  const a = deal('a','2026-11-10',0), b = deal('b','2026-11-10',NaN);
  expect(compareDealClosePriority(a,b)).toBeLessThan(0);
  expect(compareDealClosePriority(a,{...a,id:'z'})).toBeLessThan(0);
});
