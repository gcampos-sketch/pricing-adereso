import type { DealDTO } from './pulse-types';

type CloseDeal = Pick<DealDTO, 'id' | 'name' | 'closeDateValue' | 'probabilityValue'>;
/** Dates are CRM calendar days; undated deals go last in either direction. */
export function compareDealClosePriority(a: CloseDeal, b: CloseDeal, direction: 'asc' | 'desc' = 'asc'): number {
  const date = (value: string) => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
  };
  const left = date(a.closeDateValue), right = date(b.closeDateValue);
  if (left !== right) {
    if (left === null) return 1;
    if (right === null) return -1;
    return left.localeCompare(right) * (direction === 'asc' ? 1 : -1);
  }
  const probability = (value: number) => Number.isFinite(value) ? value : -1;
  return probability(b.probabilityValue) - probability(a.probabilityValue)
    || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}
