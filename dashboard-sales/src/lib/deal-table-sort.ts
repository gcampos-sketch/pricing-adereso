import type { DealDTO } from './pulse-types';
import { dealAgeDays } from './deal-age';

export type SortKey = 'financeAlert' | 'ssppAlert' | 'name' | 'owner' | 'closeDate' | 'amount' | 'probability' | 'score' | 'adobo' | 'nextActivity' | 'activities' | 'setup' | 'age' | 'stage' | 'reason' | 'source' | 'country' | 'sequence' | 'contact' | 'signal';
export type DealSort = { key: SortKey; dir: 'asc' | 'desc' };
export type DealKind = 'opportunity' | 'upsell' | 'crossSell';
type ContactSortData = { contactName: string | null; contactEmail: string | null; contactCount: number; sequenceActive: boolean | null; sequenceEver: boolean | null };

export function dealKind(deal: Pick<DealDTO, 'segment'>): DealKind {
  const segment = (deal.segment ?? '').toLowerCase().replace(/[_\s-]+/g, '');
  if (segment.includes('cross')) return 'crossSell';
  return segment.includes('upsell') ? 'upsell' : 'opportunity';
}

/** The order of the array is the priority; changing direction keeps that priority. */
export function toggleDealSort(current: DealSort[], key: SortKey): DealSort[] {
  const active = current.find(sort => sort.key === key);
  if (!active) return [...current, { key, dir: 'desc' }];
  if (active.dir === 'asc') return current.filter(sort => sort.key !== key);
  return current.map(sort => sort.key === key ? { ...sort, dir: 'asc' } : sort);
}

export function initialDealSort(requested?: DealSort): DealSort[] {
  if (!requested) return [{ key: 'probability', dir: 'desc' }, { key: 'closeDate', dir: 'desc' }];
  return requested.key === 'closeDate'
    ? [requested, { key: 'probability', dir: 'desc' }]
    : requested.key === 'probability'
      ? [requested, { key: 'closeDate', dir: 'desc' }]
      : [requested];
}

const calendarDay = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
};

function value(deal: DealDTO, key: SortKey, contacts: Record<string, ContactSortData>, now: number): string | number | null {
  const contact = contacts[deal.id];
  switch (key) {
    case 'amount': return deal.amountValue;
    case 'closeDate': return calendarDay(deal.closeDateValue);
    case 'probability': return deal.probabilityValue;
    case 'score': return deal.scoreValue;
    case 'adobo': return deal.adoboScoreValue;
    case 'nextActivity': return calendarDay(deal.nextActivityValue);
    case 'activities': return deal.activities ?? null;
    case 'setup': return deal.otfValue;
    case 'age': return dealAgeDays(deal.createdAt, now);
    case 'financeAlert': return deal.financeAlert ?? null;
    case 'ssppAlert': return deal.ssppAlert ?? null;
    case 'reason': return deal.lostReason ?? null;
    case 'source': return deal.source ?? 'HubSpot';
    case 'country': return deal.country ?? null;
    case 'contact': return contact?.contactName || contact?.contactEmail || null;
    case 'sequence': return !contact ? null : contact.sequenceActive === true ? 3 : contact.sequenceEver === true ? 2 : contact.contactCount ? 1 : 0;
    default: return String(deal[key as 'name' | 'owner' | 'stage'] ?? '');
  }
}

/** Compare each selected column only; a primary column must never consume secondary ties. */
export function compareDealSort(a: DealDTO, b: DealDTO, sorts: DealSort[], contacts: Record<string, ContactSortData> = {}, now = Date.now()): number {
  for (const sort of sorts) {
    const left = value(a, sort.key, contacts, now), right = value(b, sort.key, contacts, now);
    const missing = (item: string | number | null) => item === null || item === '' || (typeof item === 'number' && !Number.isFinite(item));
    if (missing(left) || missing(right)) {
      if (missing(left) !== missing(right)) return missing(left) ? 1 : -1;
      continue;
    }
    const difference = typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'es', { sensitivity: 'base', numeric: true });
    if (difference) return difference * (sort.dir === 'asc' ? 1 : -1);
  }
  return 0;
}
