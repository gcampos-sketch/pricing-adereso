import { expect, test } from 'bun:test';
import { dealOwnerOptions, filterDealsByOwner } from '../src/lib/deal-owner-filter';
test('owner review filters exact native IDs even when display names coincide', () => {
  const rows = [{ id: 'a', ownerId: 'one', owner: 'Same name' }, { id: 'b', ownerId: 'two', owner: 'Same name' }, { id: 'c', ownerId: 'one', owner: 'Same name' }];
  expect(dealOwnerOptions(rows)).toEqual([{ value: 'owner:one', label: 'Same name (2)' }, { value: 'owner:two', label: 'Same name (1)' }]);
  expect(filterDealsByOwner(rows, 'owner:one').map(row => row.id)).toEqual(['a', 'c']);
  expect(filterDealsByOwner(rows, null)).toBe(rows);
  expect(filterDealsByOwner(rows, 'owner:unknown')).toEqual([]);
});
test('missing owner remains selectable and narrowing never introduces records outside the warning cohort', () => {
  const rows = [{ id: 'missing', ownerId: '', owner: '' }, { id: 'known', ownerId: 'one', owner: 'Owner' }];
  expect(dealOwnerOptions(rows)).toContainEqual({ value: 'owner:', label: 'Sin comercial (1)' });
  expect(filterDealsByOwner(rows, 'owner:').map(row => row.id)).toEqual(['missing']);
  expect(filterDealsByOwner(rows.slice(0, 1), 'owner:one')).toEqual([]);
});
