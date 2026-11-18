import { expect, test } from 'bun:test';
import { formatTrendValue, trendPoints } from '../src/lib/chart-trend';
test('trend points preserve ordering, zeros and missing gaps without fabricating a value', () => {
  expect(trendPoints([120, null, 0, NaN, Infinity], ['oct 26', 'nov 26', 'dic 26'])).toEqual([
    { label: 'oct 26', value: 120 }, { label: 'nov 26', value: null }, { label: 'dic 26', value: 0 },
    { label: 'Período 4', value: null }, { label: 'Período 5', value: null },
  ]);
});
test('tooltips retain explicit units rather than treating counts and percentages as dollars', () => {
  expect(formatTrendValue(15, 'percent')).toBe('15%');
  expect(formatTrendValue(32, 'number')).toBe('32');
  expect(formatTrendValue(14, 'days')).toBe('14 días');
  expect(formatTrendValue(796, 'money')).toBe('$796');
  expect(formatTrendValue(null, 'money')).toBe('Sin dato');
  expect(formatTrendValue(NaN, 'number')).toBe('Sin dato');
});
