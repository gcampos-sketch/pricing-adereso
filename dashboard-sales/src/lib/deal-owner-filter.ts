import type { DealDTO } from './pulse-types';
type OwnedDeal = Pick<DealDTO, 'ownerId' | 'owner'>;
const ownerKey = (deal: Pick<OwnedDeal, 'ownerId'>) => `owner:${deal.ownerId ?? ''}`;
/** Native owner identity, never a display-name match that could merge distinct owners. */
export function filterDealsByOwner<T extends Pick<OwnedDeal, 'ownerId'>>(deals: T[], selected: string | null): T[] {
  return selected === null ? deals : deals.filter(deal => ownerKey(deal) === selected);
}
export function dealOwnerOptions(deals: OwnedDeal[]) {
  const owners = new Map<string, { value: string; name: string; count: number }>();
  for (const deal of deals) {
    const value = ownerKey(deal);
    const owner = owners.get(value) ?? { value, name: deal.owner || 'Sin comercial', count: 0 };
    owner.count++; owners.set(value, owner);
  }
  return [...owners.values()].sort((a, b) => a.name.localeCompare(b.name, 'es') || a.value.localeCompare(b.value))
    .map(owner => ({ value: owner.value, label: `${owner.name} (${owner.count})` }));
}
