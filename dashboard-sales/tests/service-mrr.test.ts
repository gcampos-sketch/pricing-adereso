import { expect, test } from 'bun:test';
import { serviceMrrDeals } from '../src/lib/service-mrr';
import { quotaStats } from '../src/lib/quota-eligibility';
import type { DealDTO } from '../src/lib/pulse-types';

const raw = (id: string, dealtype: string | null, amount: number, stage = 'service') => ({
  id, properties: { dealtype, amount: String(amount), dealstage: stage },
});

test('service total, count and entry population exclude renewals', () => {
  const live = serviceMrrDeals([
    raw('renewal', 'Renovación', 5000), raw('normalized', ' RENOVACION ', 4000),
    raw('english', 'renewal', 3000), raw('new', 'newbusiness', 100),
    raw('upsell', 'Upsell', 200), raw('cross', 'Cross sell', 300),
    raw('unknown', null, 50), raw('development', 'newbusiness', 1000, 'dev'),
  ], 'service');
  expect(live.map(d => d.id)).toEqual(['new', 'upsell', 'cross', 'unknown']);
  expect(live.reduce((sum, d) => sum + Number(d.properties.amount), 0)).toBe(650);
});

test('service MRR preserves other types independently of quota exclusions', () => {
  expect(serviceMrrDeals([raw('contraction', 'Contracción', 100)], 'service')).toHaveLength(1);
});

test('renewals contribute neither MRR nor OTF to individual or team attainment', () => {
  const rows = [
    { id: 'new', ownerId: 'a', dealType: 'newbusiness', amountValue: 100, otfValue: 120, productToHire: 'SMS' },
    { id: 'renew-a', ownerId: 'a', dealType: 'Renovación', amountValue: 5000, otfValue: 12000 },
    { id: 'renew-b', ownerId: 'b', dealType: ' RENOVACION ', amountValue: 4000, otfValue: 24000 },
    { id: 'renew-c', ownerId: 'b', dealType: 'renewal', amountValue: 3000, otfValue: 36000 },
  ] as DealDTO[];
  const team = quotaStats(rows);
  const individual = quotaStats(rows.filter(d => d.ownerId === 'a'));
  expect([team.wonAmount, team.wonOtf, team.won]).toEqual([100, 120, 1]);
  expect([individual.wonAmount, individual.wonOtf, individual.won]).toEqual([100, 120, 1]);
  expect(team.excluded).toHaveLength(3);
});

test('explicit dealtype takes precedence over a legacy renewal segment', () => {
  const rows = [{ id: 'upsell', dealType: 'Upsell', segment: 'Renovación', amountValue: 100, productToHire: 'SMS' }] as DealDTO[];
  expect(quotaStats(rows).wonAmount).toBe(100);
});

test('unverified account deals never enter service total, count or entry population', () => {
  const deals = [raw('verified', 'newbusiness', 100), raw('pending-review', 'Upsell', 300), raw('unresolved', null, 500), raw('renewal', 'Renovación', 200)];
  const selected = serviceMrrDeals(deals, 'service', new Set(['verified', 'renewal']));
  expect(selected.map(deal => deal.id)).toEqual(['verified']);
  expect(selected.reduce((sum, deal) => sum + Number(deal.properties.amount), 0)).toBe(100);
  expect(serviceMrrDeals(deals, 'service', new Set())).toHaveLength(0);
});
