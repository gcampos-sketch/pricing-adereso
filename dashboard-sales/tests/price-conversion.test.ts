import { expect, test } from 'bun:test';
import { analyzePrices, priceDistribution, median, priceBands, priceCohorts, priceInWindow, priceNumber, type PriceFilters, type PriceObservation, type PriceRecord } from '../src/lib/price-conversion';
import { readPriceRecords } from '../src/lib/price-conversion.server';
import type { DealDTO } from '../src/lib/pulse-types';

const readAt = '2026-11-18T01:00:00Z';
const filters: PriceFilters = { currency: 'USD', product: 'all', plan: 'all', pricingModel: 'all', volume: 'all', cohort: 'all', period: 'rolling', periods: ['2026-Q4'] };
const observation = (id: string, monthly = 558, extra: Partial<PriceObservation> = {}): PriceObservation => ({
  deal: { id, closeDateValue: '2026-10-10T00:00:00Z', ownerId: 'a' } as DealDTO,
  monthly, setup: 990, currency: 'USD', quotationCurrency: 'USD', product: 'Desk;Studio', plan: 'Plan 2', pricingModel: 'Tráfico', volume: 2000,
  proposalAt: '2026-09-01T00:00:00Z', won: false, cohort: 'acquisition', ...extra,
});
test('empty/invalid monetary values remain unknown; free setup and median of zero stay real', () => {
  for (const value of [null, undefined, '', ' ', 'NaN', '-2', 'Infinity']) expect(priceNumber(value)).toBeNull();
  expect(priceNumber('0.00')).toBe(0);
  expect(median([0, 990])).toBe(495);
  expect(median([])).toBeNull();
});
test('exact half-open USD bands conserve deduplicated membership and successes, including threshold 558', () => {
  const rows = [observation('a', 198), observation('b', 199), observation('c', 398), observation('d', 399), observation('e', 557.99), observation('f', 558, { won: true }), observation('g', 1000), observation('h', 2000)];
  const result = analyzePrices([...rows, rows[5]!], readAt, filters);
  expect(result.bands.map(band => band.rows.map(row => row.deal.id))).toEqual([['a'], ['b', 'c'], ['d', 'e'], ['f'], ['g'], ['h']]);
  expect(result.eligible).toHaveLength(8);
  expect(result.bands.reduce((sum, band) => sum + band.wonRows.length, 0)).toBe(1);
  expect(result.bands[3]?.rate).toBe(100);
  expect(priceBands([], 'USD').every(band => band.rate === null && band.setupMedian === null)).toBe(true);
});
test('currency, valid proposal chronology and positive MRR have exclusive visible exclusions; missing setup remains in denominator', () => {
  const rows = [observation('valid', 558, { won: true, setup: 0 }), observation('missing-setup', 558, { setup: null }),
    observation('UF', 20, { currency: 'UF' }), observation('unknown-currency', 558, { currency: '' }),
    observation('no-proposal', 558, { proposalAt: '' }), observation('after-close', 558, { proposalAt: '2026-10-11' }),
    observation('no-mrr', 0), observation('blank-mrr', 558, { monthly: null })];
  const result = analyzePrices(rows, readAt, filters);
  expect(result.eligible.map(row => row.deal.id)).toEqual(['valid', 'missing-setup']);
  expect(result.bands[3]).toMatchObject({ rate: 50, setupMedian: 0, setupKnown: 1 });
  expect(Object.values(result.excluded).flat()).toHaveLength(6);
  expect(result.scoped.length).toBe(result.eligible.length + Object.values(result.excluded).flat().length);
  const uf = analyzePrices(rows, readAt, { ...filters, currency: 'UF' });
  expect(uf.eligible.map(row => row.deal.id)).toEqual(['UF']);
  expect(uf.bands.flatMap(band => band.rows)).toHaveLength(1);
});
test('package/plan/volume/model/cohort and local date windows all narrow the same population', () => {
  const rows = [observation('a'), observation('b', 558, { volume: 3000 }), observation('c', 558, { product: '' }), observation('d', 558, { cohort: 'unknown' })];
  expect(analyzePrices(rows, readAt, { ...filters, volume: '2000', cohort: 'acquisition', product: 'Desk;Studio', plan: 'Plan 2', pricingModel: 'Tráfico' }).eligible.map(row => row.deal.id)).toEqual(['a']);
  expect(analyzePrices(rows, readAt, { ...filters, product: 'unknown' }).eligible.map(row => row.deal.id)).toEqual(['c']);
  expect(priceInWindow('2025-11-18T01:00:00Z', readAt, filters)).toBe(true);
  expect(priceInWindow('2025-11-18T00:59:59Z', readAt, filters)).toBe(false);
  expect(priceInWindow('2026-12-01', readAt, { ...filters, period: 'master' })).toBe(false);
  expect(priceInWindow('2026-08-01', readAt, { ...filters, period: 'master' })).toBe(false);
  expect(priceInWindow('2026-10-01', readAt, { ...filters, period: 'master' })).toBe(true);
  expect(priceInWindow('2023-03-01', '2024-02-29T12:00:00Z', filters)).toBe(true);
});
const record = (id: string, properties: Record<string, string | null> = {}): PriceRecord => ({ id, properties: { dealstage: '171385869', dealtype: 'newbusiness', hs_v2_date_entered_171385867: '2026-09-01', ...properties } });
test('Oportunidad at an exact company with a prior recorded win is expansion; newbusiness alone never establishes acquisition', () => {
  const records = [record('won', { dealstage: '173990327', hs_v2_date_entered_174677684: '2026-01-01' }), record('later'), record('first'), record('ambiguous'), record('unlinked')];
  const links = { won: [{ id: 'company', primary: true }], later: [{ id: 'company', primary: true }, { id: 'irrelevant', primary: false }], first: [{ id: 'other', primary: true }], ambiguous: [{ id: 'x', primary: false }, { id: 'y', primary: false }] };
  const cohorts = priceCohorts(records, links, true);
  expect(cohorts.get('later')).toBe('expansion');
  expect(cohorts.get('first')).toBe('acquisition');
  expect(cohorts.get('ambiguous')).toBe('unknown');
  expect(cohorts.get('unlinked')).toBe('unknown');
  expect(priceCohorts(records, links, false).get('first')).toBe('unknown');
  expect(priceCohorts(records, links, false).get('later')).toBe('expansion');
});
test('future wins do not imply prior customers and undated wins/explicit expansion block acquisition', () => {
  const links = { win: [{ id: 'c', primary: true }], target: [{ id: 'c', primary: true }] };
  const target = record('target');
  expect(priceCohorts([record('win', { dealstage: '173990327', hs_v2_date_entered_174677684: '2026-10-01' }), target], links, true).get('target')).toBe('acquisition');
  expect(priceCohorts([record('win', { dealstage: '173990327' }), target], links, true).get('target')).toBe('unknown');
  expect(priceCohorts([record('target', { dealtype: 'Upsell (mas de los mismo)' })], links, true).get('target')).toBe('unknown');
  expect(priceCohorts([record('target', { dealtype: 'Renovación' })], links, true).get('target')).toBe('unknown');
  expect(priceCohorts([record('target', { dealtype: null })], links, true).get('target')).toBe('unknown');
});
test('source reads page through to exact total and fail closed on truncation/duplicates/changing totals', async () => {
  let calls = 0;
  const request = (async (_path: string, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body));
    expect(input.properties).toContain('hs_mrr');
    expect(input.properties).toContain('deal_currency_code');
    calls++;
    return input.after ? { total: 2, results: [record('b')] } : { total: 2, results: [record('a')], paging: { next: { after: '1' } } };
  }) as Parameters<typeof readPriceRecords>[0];
  expect((await readPriceRecords(request)).map(row => row.id)).toEqual(['a', 'b']);
  expect(calls).toBe(2);
  await expect(readPriceRecords((async () => ({ total: 2, results: [record('a')] })) as typeof request)).rejects.toThrow('Faltan negocios');
  await expect(readPriceRecords((async () => ({ total: 2, results: [record('a'), record('a')] })) as typeof request)).rejects.toThrow('Faltan negocios');
  await expect(readPriceRecords((async (_path: string, init?: RequestInit) => JSON.parse(String(init?.body)).after
    ? { total: 3, results: [record('b')] }
    : { total: 2, results: [record('a')], paging: { next: { after: '1' } } }) as typeof request)).rejects.toThrow('cambió');
  await expect(readPriceRecords((async () => ({ total: 3, results: [record('a')], paging: { next: { after: '1' } } })) as typeof request)).rejects.toThrow('incompleta');
});

test('setup analysis includes real zero without MRR, excludes missing setup, and conserves exact band membership', () => {
  const rows = [observation('free', 0, { setup: 0, won: true }), observation('missing', 558, { setup: null }),
    observation('500', 0, { setup: 500 }), observation('1000', 0, { setup: 1000 }), observation('10000', 0, { setup: 10000 })];
  const result = analyzePrices(rows, readAt, { ...filters, metric: 'setup' });
  expect(result.eligible.map(row => row.deal.id)).toEqual(['free', '500', '1000', '10000']);
  expect(result.bands.map(band => band.rows.map(row => row.deal.id))).toEqual([['free'], ['500'], ['1000'], [], [], ['10000']]);
  expect(result.bands[0]).toMatchObject({ rate: 100, setupMedian: 0 });
  expect(result.excluded['Sin setup/OTF registrado']?.map(row => row.deal.id)).toEqual(['missing']);
  const uf = analyzePrices(rows.map(row => ({ ...row, currency: 'UF' })), readAt, { ...filters, metric: 'setup', currency: 'UF' });
  expect(uf.bands.flatMap(band => band.rows)).toHaveLength(4);
});

test('native deal types combine with OR, preserve unknowns, and empty selection means no deals', () => {
  const rows = [observation('new', 558, { deal: { id: 'new', closeDateValue: '2026-10-10', dealType: 'newbusiness' } as DealDTO }),
    observation('up', 558, { deal: { id: 'up', closeDateValue: '2026-10-10', dealType: 'Upsell (mas de los mismo)' } as DealDTO }), observation('unknown')];
  expect(analyzePrices(rows, readAt, { ...filters, dealTypes: ['newbusiness', 'Upsell (mas de los mismo)'] }).eligible.map(row => row.deal.id)).toEqual(['new', 'up']);
  expect(analyzePrices(rows, readAt, { ...filters, dealTypes: ['newbusiness'] }).eligible.map(row => row.deal.id)).toEqual(['new']);
  expect(analyzePrices(rows, readAt, { ...filters, dealTypes: ['unknown'] }).eligible.map(row => row.deal.id)).toEqual(['unknown']);
  expect(analyzePrices(rows, readAt, { ...filters, dealTypes: [] }).eligible).toHaveLength(0);
});

test('industry and company-size distributions conserve deduplicated selected population including unknown values', () => {
  const rows = [observation('a', 558, { industry: 'Retail', companySize: '2 - 50' }), observation('b', 558, { industry: 'Retail' }), observation('c')];
  const industry = priceDistribution([...rows, rows[0]!], 'industry');
  expect(industry.map(group => [group.label, group.count])).toEqual([['Retail', 2], ['Sin dato registrado', 1]]);
  expect(industry.reduce((sum, group) => sum + group.share, 0)).toBeCloseTo(100);
  expect(industry[0]?.rows.map(row => row.deal.id)).toEqual(['a', 'b']);
  expect(priceDistribution(rows, 'companySize').map(group => group.count)).toEqual([2, 1]);
  expect(priceDistribution([], 'industry')).toEqual([]);
});
