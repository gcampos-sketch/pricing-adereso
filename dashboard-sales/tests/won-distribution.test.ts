import { expect, test } from 'bun:test';
import { wonAcquisitionSource, wonBusinessType, wonDistribution, wonOwnerBreakdown } from '../src/lib/won-distribution';
import type { DealDTO } from '../src/lib/pulse-types';

const deal = (id: string, overrides: Partial<DealDTO> = {}) => ({
  id, name: id, segment: 'Outbound', dealType: 'newbusiness', productToHire: 'Desk',
  source: 'Prospección SDR Adereso', amountValue: 100, otfValue: 0, closeDateValue: '2026-10-21', ...overrides,
}) as DealDTO;

test('business type and source are independent axes; missing types are not invented from inbound/outbound', () => {
  expect(wonBusinessType(deal('a'))).toBe('opportunity');
  expect(wonBusinessType(deal('a', { dealType: 'Upsell', source: 'Form de Contacto Inbound Adereso' }))).toBe('upsell');
  expect(wonBusinessType(deal('a', { dealType: 'Cross sell' }))).toBe('cross');
  expect(wonBusinessType(deal('a', { dealType: null, segment: 'Inbound' }))).toBe('unknown');
  expect(wonBusinessType(deal('a', { dealType: 'unexpected-value' }))).toBe('unknown');
});

test('channel uses exact creation-source values, never the old segment or a substring', () => {
  expect(wonAcquisitionSource(deal('a', { segment: 'Inbound' }))).toBe('outbound');
  for (const source of ['Form de Contacto Inbound Adereso', 'Form de Contacto Inbound', 'Form de Contacto Inbound [Adereso]']) expect(wonAcquisitionSource({ source })).toBe('inbound');
  for (const source of ['Prospección SDR', 'Prospeccion SDR Adereso', 'Prospección SDR [Adereso]']) expect(wonAcquisitionSource({ source })).toBe('outbound');
  expect(wonAcquisitionSource({ source: 'Prospección SDR Partner' })).toBe('other');
  expect(wonAcquisitionSource({ source: null })).toBe('unknown');
});

test('mixes reconcile to the same unique eligible won population inside selected periods', () => {
  const a = deal('a', { amountValue: 300 });
  const result = wonDistribution([
    a, a, deal('b', { dealType: 'Upsell', amountValue: 100, source: 'Form de Contacto Inbound' }),
    deal('old', { closeDateValue: '2026-09-30' }), deal('future', { closeDateValue: '2027-01-01' }),
    deal('wallet', { productToHire: 'Billetera Engage' }), deal('renewal', { dealType: 'Renovación' }),
    deal('bad-date', { closeDateValue: '' }),
  ], ['2026-Q4']);
  expect(result.count).toBe(2);
  expect(result.totalMrr).toBe(400);
  expect(result.types.find(row => row.key === 'opportunity')).toMatchObject({ mrr: 300, count: 1, mrrShare: 75, countShare: 50 });
  expect(result.types.find(row => row.key === 'upsell')).toMatchObject({ mrr: 100, count: 1, mrrShare: 25, countShare: 50 });
  expect(result.sources.find(row => row.key === 'outbound')?.mrrShare).toBe(75);
  expect(result.types.reduce((sum, row) => sum + row.mrr, 0)).toBe(result.totalMrr);
  expect(result.sources.reduce((sum, row) => sum + row.count, 0)).toBe(result.count);
  expect(result.types.filter(row => row.mrr > 0).map(row => row.key)).toEqual(['opportunity', 'upsell']);
  expect(result.types.find(row => row.key === 'opportunity')?.deals.map(row => row.id)).toEqual(['a']);
  expect(result.sources.find(row => row.key === 'inbound')?.deals.map(row => row.id)).toEqual(['b']);
  for (const row of [...result.types, ...result.sources]) expect(row.deals.length).toBe(row.count);
});

test('other and unknown sources remain explicit; zero-MRR wins still appear in deal-count mode', () => {
  const result = wonDistribution([
    deal('a', { amountValue: 0, source: null, dealType: 'Cross sell' }),
    deal('b', { amountValue: 0, source: 'Account Exec', dealType: null }),
  ], ['2026-Q4']);
  expect(result.types.every(row => row.mrrShare === null)).toBe(true);
  expect(result.types.filter(row => row.count > 0).map(row => row.key)).toEqual(['cross', 'unknown']);
  expect(result.sources.find(row => row.key === 'other')?.countShare).toBe(50);
  expect(result.sources.find(row => row.key === 'unknown')?.countShare).toBe(50);
});

test('CS and KAM sources have separate shares without changing the business type or total', () => {
  const result = wonDistribution([
    deal('cs', { source: 'Customer Success', dealType: 'Upsell', amountValue: 200 }),
    deal('kam', { source: 'KAM Adereso', amountValue: 100 }),
    deal('kam-recovery', { source: 'KAM Adereso - Recuperación', amountValue: 100 }),
    deal('other', { source: 'Account Exec', amountValue: 100 }),
  ], ['2026-Q4']);
  expect(result.sources.find(row => row.key === 'cs')).toMatchObject({ label: 'Oportunidad desde CS', count: 1, mrrShare: 40 });
  expect(result.sources.find(row => row.key === 'kam')).toMatchObject({ label: 'Oportunidad desde KAM', count: 2, mrrShare: 40 });
  expect(result.sources.find(row => row.key === 'cs')?.deals.map(row => row.id)).toEqual(['cs']);
  expect(result.sources.find(row => row.key === 'kam')?.deals.map(row => row.id).sort()).toEqual(['kam', 'kam-recovery']);
  expect(result.sources.find(row => row.key === 'other')?.mrrShare).toBe(20);
  expect(result.types.find(row => row.key === 'upsell')?.mrr).toBe(200);
  expect(result.sources.reduce((sum, row) => sum + row.mrr, 0)).toBe(result.totalMrr);
  expect(wonAcquisitionSource({ source: 'Customer Success Partner' })).toBe('other');
});

test('owner widget preserves MRR, deal count and each period quota over the scoped unique wins', () => {
  const a = deal('a', { owner: 'Sol', amountValue: 1000 });
  const mix = wonDistribution([a, a, deal('b', { owner: 'Luna', amountValue: 500 }), deal('c', { owner: 'Luna', amountValue: 0 }), deal('old', { owner: 'Sol', closeDateValue: '2026-09-01' }), deal('d', { owner: 'Sin meta', amountValue: 50 })], ['2026-Q4']);
  const rows = wonOwnerBreakdown(mix.deals, { Sol: 500, Luna: 1000 });
  expect(rows.map(row => row.owner)).toEqual(['Sol', 'Luna', 'Sin meta']);
  expect(rows[0]).toMatchObject({ mrr: 1000, count: 1, quota: 500, attainment: 200 });
  expect(rows[1]).toMatchObject({ mrr: 500, count: 2, quota: 1000, attainment: 50 });
  expect(rows[2]?.attainment).toBeNull();
  expect(rows.reduce((sum, row) => sum + row.mrr, 0)).toBe(mix.totalMrr);
  expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(mix.count);
});
