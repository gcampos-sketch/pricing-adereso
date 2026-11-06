import { test, expect } from 'bun:test';
import { packReport, unpackReport } from '../src/lib/report-wire';
import { createReportSingleflight } from '../src/lib/report-singleflight';

const deal = { id: '1', ownerId: 'o', stageId: 'e', amountValue: 25, adobo: { properties: { score: '0.5' } } };
test('transport preserves all metrics and exact deal variants, with one copy per identical DTO', () => {
  const input = { total: 75, generatedAt: '2026-10-19', lists: [[deal, { ...deal }], [{ ...deal, amountValue: 0 }]], missing: null };
  const packed = packReport(input);
  expect(packed.deals).toHaveLength(2);
  expect(unpackReport(JSON.parse(JSON.stringify(packed)))).toEqual(input);
  expect(unpackReport(input)).toEqual(input);
});
test('repeated deal payload is materially smaller without losing fields', () => {
  const input = { lists: Array.from({ length: 50 }, () => [{ ...deal, name: 'x'.repeat(1000) }]) };
  expect(JSON.stringify(packReport(input)).length).toBeLessThan(JSON.stringify(input).length / 10);
});
test('invalid reference fails closed', () => {
  expect(() => unpackReport({ version: 'report-wire/v1', deals: [], payload: { $deal: 0 } })).toThrow();
});
test('snapshot miss and live request share one build; settled values are not retained', async () => {
  const singleflight = createReportSingleflight();
  let builds = 0;
  const load = async () => { builds++; return { value: 25 }; };
  const values = await Promise.all([singleflight('pulse', load), singleflight('pulse', load)]);
  expect(builds).toBe(1);
  expect(values[0]).toEqual({ value: 25 });
  await singleflight('pulse', load);
  expect(builds).toBe(2);
});
test('roles remain isolated and failed builds can retry', async () => {
  const singleflight = createReportSingleflight();
  expect(await Promise.all([singleflight('ae', async () => 1), singleflight('kam', async () => 2)])).toEqual([1, 2]);
  await expect(singleflight('pulse', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
  expect(await singleflight('pulse', async () => 25)).toBe(25);
});