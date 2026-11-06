import { test, expect } from 'bun:test';
import { buildExecutiveStrip } from '../src/lib/executive-strip';
import { packReport, unpackReport } from '../src/lib/report-wire';
import type { DealDTO, StageJourney } from '../src/lib/pulse-types';

const now = Date.parse('2026-10-19T19:01:00Z');
const journey = (id: string, stageId: string, createdAt: string, overrides: Partial<DealDTO> = {}, entered?: Record<string, string>): StageJourney => ({
  deal: { id, stageId, ownerId: 'other', amountValue: 25, segment: 'Inbound', contractStatus: null, ...overrides } as DealDTO,
  createdAt, entered: entered ?? { E0: createdAt, E1: createdAt }, days: {},
});
const journeys = [journey('1', '171385864', '2026-10-10'), journey('2', '173990327', '2020-01-01'), journey('3', '174677684', '2021-01-01', { ownerId: 'different', segment: 'Upsell' }), journey('4', '174677684', '2022-01-01', { amountValue: 0 }), journey('5', '173990327', '2021-01-01', { contractStatus: 'Firmado' })];

test('generation uses the fixed current quarter, not a selected historical year or quarter', () => {
  const result = buildExecutiveStrip(journeys, { yes: [], no: [] }, now);
  expect(result.period).toBe('2026-Q4');
  expect(result.generation.created.map(d => d.id)).toEqual(['1']);
  expect(result.generation.activationPct).toBe(100);
});
test('won to service includes historical wins from all owners and types, excludes zero amount', () => {
  const result = buildExecutiveStrip(journeys, { yes: [], no: [] }, now).wonJourney;
  expect(result.total).toBe(3);
  expect(result.service.map(d => d.id)).toEqual(['2', '5']);
  expect(result.pending.map(d => d.id)).toEqual(['3']);
  expect(result.stages.flatMap(st => st.deals).map(d => d.id).sort()).toEqual(['2', '3', '5']);
});
test('contracts use the same global historical wins and exclude signed contracts', () => {
  const result = buildExecutiveStrip(journeys, { yes: [], no: [] }, now).wonJourney;
  expect(result.contracts.map(d => d.id)).toEqual(['2', '3']);
  expect(result.historicTotal).toBe(3);
});
test('report transport retains the unfiltered source for commercial scoping', () => {
  const yes = journeys[0]?.deal;
  const no = journeys[2]?.deal;
  if (!yes || !no) throw new Error('missing test deals');
  const executiveStrip = buildExecutiveStrip(journeys, { yes: [yes], no: [no] }, now);
  for (const filters of [{ role: 'AE', owner: 'different', type: 'Upsell', stage: 'E6' }, { role: 'KAM', owner: 'other', type: 'Inbound', stage: 'E2' }]) {
    const report = unpackReport<{ executiveStrip: typeof executiveStrip }>(packReport({ executiveStrip, filters }));
    expect(report.executiveStrip.onTrack.yes.map(d => d.id)).toEqual(['1']);
    expect(report.executiveStrip.onTrack.no.map(d => d.id)).toEqual(['3']);
    expect(report.executiveStrip.wonJourney.total).toBe(3);
  }
});

test('won E8 service lists open with the most recent close date first', () => {
  const recent = [
    journey('10', '173990327', '2020-01-01', { closeDateValue: '2026-09-30' }),
    journey('11', '173990327', '2020-01-01', { closeDateValue: '2026-10-15' }),
    journey('12', '173990327', '2020-01-01', { closeDateValue: '2026-08-02' }),
    journey('13', '173990327', '2020-01-01', { closeDateValue: '' }),
  ];
  const result = buildExecutiveStrip(recent, { yes: [], no: [] }, now).wonJourney;
  expect(result.service.map(d => d.id)).toEqual(['11', '10', '12', '13']);
  expect(result.segments[0]?.deals.map(d => d.id)).toEqual(['11', '10', '12', '13']);
});
test('E8 bar shows only the ten most recent entries into stage 8, newest first', () => {
  const entries = Array.from({ length: 12 }, (_, i) =>
    journey(`e8-${i}`, '173990327', '2020-01-01', { closeDateValue: '2026-01-01' }, { E8: `2026-09-${String(i + 1).padStart(2, '0')}` }));
  const undated = journey('e8-x', '173990327', '2020-01-01', { closeDateValue: '2026-01-01' }, { E0: '2020-01-01' });
  const result = buildExecutiveStrip([...entries, undated], { yes: [], no: [] }, now).wonJourney;
  expect(result.service.length).toBe(13);
  expect(result.stages.find(st => st.key === 'e8')?.deals.map(d => d.id)).toEqual([
    'e8-11', 'e8-10', 'e8-9', 'e8-8', 'e8-7', 'e8-6', 'e8-5', 'e8-4', 'e8-3', 'e8-2',
  ]);
});
const commercialJourneys = [
  journey('gio-win', '173990327', '2020-01-01', { ownerId: '373167468' }),
  journey('gio-signed', '173990327', '2021-01-01', { ownerId: '373167468', contractStatus: 'Firmado' }),
  journey('gio-upsell', '174677684', '2022-01-01', { ownerId: '373167468', segment: 'Upsell' }),
  journey('kam-win', '174677684', '2020-01-01', { ownerId: '91603512' }),
  journey('gio-open', '171385864', '2026-10-10', { ownerId: '373167468' }),
  journey('kam-open', '171385864', '2026-10-10', { ownerId: '91603512' }),
  journey('gio-lost', '171385869', '2020-01-01', { ownerId: '373167468' }),
];
const tracked = { yes: commercialJourneys.filter(j => j.deal.id.endsWith('open')).map(j => j.deal), no: [] };
const ids = (deals: DealDTO[]) => deals.map(d => d.id);

test('Giordano scopes all four cards and chips, retaining historical wins only', () => {
  const r = buildExecutiveStrip(commercialJourneys, tracked, now, { owner: '373167468', role: 'all', matchesType: () => true });
  expect(ids(r.wonJourney.contracts)).toEqual(['gio-win', 'gio-upsell']);
  expect(r.wonJourney.historicTotal).toBe(3);
  expect(ids(r.wonJourney.service)).toEqual(['gio-win', 'gio-signed']);
  expect(ids(r.wonJourney.pending)).toEqual(['gio-upsell']);
  expect(ids(r.generation.created)).toEqual(['gio-open']);
  expect(ids(r.openPipe.stages.flatMap(s => s.deals))).toEqual(['gio-open']);
  expect(ids(r.onTrack.yes)).toEqual(['gio-open']);
  expect(ids(r.wonJourney.cBlank)).toEqual(['gio-win', 'gio-upsell']);
});
test('KAM role excludes AE deals in all card lists', () => {
  const r = buildExecutiveStrip(commercialJourneys, tracked, now, { owner: 'team', role: 'KAM', matchesType: () => true });
  expect(ids(r.wonJourney.contracts)).toEqual(['kam-win']);
  expect(ids(r.wonJourney.pending)).toEqual(['kam-win']);
  expect(ids(r.generation.created)).toEqual(['kam-open']);
  expect(ids(r.onTrack.yes)).toEqual(['kam-open']);
});
test('Upsell type scopes historical contracts and won service consistently', () => {
  const r = buildExecutiveStrip(commercialJourneys, tracked, now, { owner: 'team', role: 'all', matchesType: d => d.segment === 'Upsell' });
  expect(ids(r.wonJourney.contracts)).toEqual(['gio-upsell']);
  expect(ids(r.wonJourney.pending)).toEqual(['gio-upsell']);
  expect(r.wonJourney.service).toEqual([]);
  expect(r.generation.created).toEqual([]);
  expect(r.onTrack.yes).toEqual([]);
});
test('owner role and type intersect rather than leaking another selection', () => {
  const r = buildExecutiveStrip(commercialJourneys, tracked, now, { owner: '373167468', role: 'KAM', matchesType: d => d.segment === 'Inbound' });
  expect(r.wonJourney.contracts).toEqual([]);
  expect(r.wonJourney.total).toBe(0);
  expect(r.onTrack.yes).toEqual([]);
});
