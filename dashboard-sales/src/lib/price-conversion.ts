import type { DealDTO } from './pulse-types';

export const PRICE_WON_STAGES = new Set(['174677684', '1278792585', '1086544542', '213244763', '171385868', '173990327']);
export const PRICE_LOST_STAGE = '171385869';
export const PRICE_WIN_DATES = [...PRICE_WON_STAGES].map(id => `hs_v2_date_entered_${id}`);
export type PriceCohort = 'acquisition' | 'expansion' | 'unknown';
export type PriceRecord = { id: string; properties: Record<string, string | null> };
export type PriceLinks = Record<string, { id: string; primary: boolean }[]>;
export type PriceObservation = {
  deal: DealDTO;
  monthly: number | null;
  setup: number | null;
  currency: string;
  quotationCurrency: string;
  product: string;
  plan: string;
  pricingModel: string;
  volume: number | null;
  proposalAt: string;
  won: boolean;
  cohort: PriceCohort;
};
export type PriceReport = {
  version: 'price-conversion/v1';
  readAt: string;
  complete: true;
  companyCoverageComplete: boolean;
  totalCommercial: number;
  rows: PriceObservation[];
};

/** Empty is unknown. In particular, a missing setup must never become a free setup. */
export function priceNumber(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function firstPriceDate(values: (string | null | undefined)[]): string {
  return values.filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? '';
}
export function proposalDate(record: PriceRecord): string {
  return firstPriceDate(['171385867', '1245768029'].map(id => record.properties[`hs_v2_date_entered_${id}`]));
}
function companyId(links: PriceLinks[string] | undefined): string | null {
  if (!links) return null;
  const primary = links.filter(link => link.primary);
  const ids = [...new Set((primary.length ? primary : links).map(link => link.id))];
  return ids.length === 1 ? ids[0]! : null;
}

/** Exact company association and recorded win chronology; dealtype never proves acquisition. */
export function priceCohorts(records: PriceRecord[], links: PriceLinks, complete: boolean): Map<string, PriceCohort> {
  const wins = new Map<string, { id: string; at: number | null }[]>();
  const ambiguous = new Set<string>();
  for (const record of records) {
    const wonAt = firstPriceDate(PRICE_WIN_DATES.map(key => record.properties[key]));
    if (!wonAt && !PRICE_WON_STAGES.has(record.properties['dealstage'] ?? '')) continue;
    const company = companyId(links[record.id]);
    if (!company) {
      for (const link of links[record.id] ?? []) ambiguous.add(link.id);
      continue;
    }
    wins.set(company, [...(wins.get(company) ?? []), { id: record.id, at: wonAt ? Date.parse(wonAt) : null }]);
  }
  return new Map(records.map(record => {
    const company = companyId(links[record.id]);
    const proposed = Date.parse(proposalDate(record));
    if (!company || !Number.isFinite(proposed)) return [record.id, 'unknown'];
    const prior = (wins.get(company) ?? []).filter(win => win.id !== record.id);
    if (prior.some(win => win.at !== null && win.at < proposed)) return [record.id, 'expansion'];
    // A current won deal without a recorded win date, or an ambiguous link, blocks absence claims.
    const opportunityType = record.properties['dealtype'] === 'newbusiness';
    return [record.id, complete && !ambiguous.has(company) && !prior.some(win => win.at === null) && opportunityType ? 'acquisition' : 'unknown'];
  }));
}

export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2 : null;
}
export type PriceFilters = {
  currency: string; product: string; plan: string; pricingModel: string; volume: string;
  cohort: 'all' | PriceCohort;
  period: 'rolling' | 'master'; periods: string[];
};
export function pricePeriod(date: string): string {
  const d = new Date(date);
  return Number.isFinite(d.getTime()) ? `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}` : '';
}
export function priceInWindow(date: string, readAt: string, filters: Pick<PriceFilters, 'period' | 'periods'>): boolean {
  const time = Date.parse(date), end = Date.parse(readAt);
  if (!Number.isFinite(time) || !Number.isFinite(end) || time > end) return false;
  if (filters.period === 'master') return filters.periods.includes(pricePeriod(date));
  const start = new Date(end);
  // Calendar twelve months; clamp leap-day rather than rolling into March.
  const month = start.getUTCMonth();
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  if (start.getUTCMonth() !== month) start.setUTCDate(0);
  return time >= start.getTime();
}
export type PriceBand = {
  key: string; lower: number; upper: number;
  rows: PriceObservation[]; wonRows: PriceObservation[];
  rate: number | null; setupMedian: number | null; setupKnown: number;
  monthlyMedian: number | null;
};
export function priceBands(rows: PriceObservation[], currency: string): PriceBand[] {
  // USD anchors include the recorded base price of 558; other native currencies get their own scale.
  const max = Math.max(0, ...rows.map(row => row.monthly ?? 0));
  const power = max > 0 ? 10 ** Math.floor(Math.log10(max / 5 || 1)) : 1;
  const step = Math.max(power, Math.ceil(max / 5 / power) * power);
  const bounds = currency === 'USD' ? [0, 199, 399, 558, 1000, 2000, Infinity] : [0, step, step * 2, step * 3, step * 4, Infinity];
  return bounds.slice(0, -1).map((lower, index) => {
    const upper = bounds[index + 1]!;
    const selected = rows.filter(row => row.monthly !== null && row.monthly > 0 && row.monthly >= lower && row.monthly < upper);
    const wonRows = selected.filter(row => row.won);
    const setups = selected.flatMap(row => row.setup === null ? [] : [row.setup]);
    return { key: String(index), lower, upper, rows: selected, wonRows,
      rate: selected.length ? 100 * wonRows.length / selected.length : null,
      setupMedian: median(setups), setupKnown: setups.length,
      monthlyMedian: median(selected.flatMap(row => row.monthly === null ? [] : [row.monthly])) };
  });
}

/** One exclusion per row, exact denominator and no imputation of proposal dates or native currency. */
export function analyzePrices(rows: PriceObservation[], readAt: string, filters: PriceFilters) {
  const unique = [...new Map(rows.map(row => [row.deal.id, row])).values()];
  const dated = unique.filter(row => priceInWindow(row.deal.closeDateValue, readAt, filters));
  const scoped = dated.filter(row =>
    (filters.product === 'all' || (filters.product === 'unknown' ? !row.product : row.product === filters.product)) &&
    (filters.plan === 'all' || (filters.plan === 'unknown' ? !row.plan : row.plan === filters.plan)) &&
    (filters.pricingModel === 'all' || (filters.pricingModel === 'unknown' ? !row.pricingModel : row.pricingModel === filters.pricingModel)) &&
    (filters.volume === 'all' || (filters.volume === 'unknown' ? row.volume === null : row.volume === Number(filters.volume))) &&
    (filters.cohort === 'all' || row.cohort === filters.cohort));
  const excluded: Record<string, PriceObservation[]> = {};
  const eligible: PriceObservation[] = [];
  for (const row of scoped) {
    const proposed = Date.parse(row.proposalAt), closed = Date.parse(row.deal.closeDateValue);
    const reason = !Number.isFinite(proposed) || proposed > closed ? 'Sin paso válido por propuesta' :
      !row.currency ? 'Sin moneda del importe' : row.currency !== filters.currency ? 'Otra moneda' :
      row.monthly === null || row.monthly <= 0 ? 'Sin MRR positivo' : null;
    if (reason) (excluded[reason] ??= []).push(row);
    else eligible.push(row);
  }
  return { eligible, excluded, scoped, undated: unique.filter(row => !pricePeriod(row.deal.closeDateValue)),
    bands: priceBands(eligible, filters.currency) };
}
