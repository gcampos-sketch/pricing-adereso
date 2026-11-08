import { expect, test } from 'bun:test';
import { wonStageBreakdown } from '../src/lib/won-stage-breakdown';
import { quotaStats } from '../src/lib/quota-eligibility';
import type { DealDTO } from '../src/lib/pulse-types';
const deal = (id: string, stageId: string, amountValue: number, extra: Partial<DealDTO> = {}) => ({ id, stageId, amountValue, otfValue: 0, dealType: 'newbusiness', productToHire: 'Desk', segment: 'Inbound', ...extra }) as DealDTO;

test('partitions the eligible period amount by current stage, preserving MRR basis and OTF separately', () => {
  const population = quotaStats([
    deal('development', '1086544542', 100, { otfValue: 1200 }),
    deal('pilot', '213244763', 50),
    deal('service', '173990327', 150),
    deal('pending', '174677684', 400),
    deal('warning', '1278792585', 200),
    deal('wallet', '1086544542', 9000, { productToHire: 'Billetera Engage' }),
    deal('renewal', '174677684', 8000, { dealType: 'Renovación' }),
  ]);
  const result = wonStageBreakdown(population.eligible, 1000);
  expect(result.map(g => g.mrr)).toEqual([300, 400, 200]);
  expect(result.map(g => g.percentage)).toEqual([30, 40, 20]);
  expect(result[0]!.otfMonthly).toBe(100);
  expect(result.flatMap(g => g.deals.map(d => d.id)).sort()).toEqual(population.eligible.map(d => d.id).sort());
  expect(result.reduce((sum, g) => sum + g.mrr, 0)).toBe(population.wonAmount);
});

test('deduplicates IDs and has no invented percentage without a quota', () => {
  const d = deal('one', '1278792585', 3180);
  expect(wonStageBreakdown([d, d], 33808)[2]!.percentage).toBeCloseTo(9.406);
  const result = wonStageBreakdown([d, d], 0);
  expect(result[2]!.deals).toHaveLength(1);
  expect(result[2]!.mrr).toBe(3180);
  expect(result.every(g => g.percentage === null)).toBe(true);
  expect(result[0]!.mrr).toBe(0);
});
