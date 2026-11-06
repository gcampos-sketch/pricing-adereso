import { describe, expect, test } from 'bun:test';
import {
  classifyQuotaDeal,
  quotaStats,
  proposeStage6Attribution,
  pendingFromPreviousQuarters,
  periodOfDate,
} from '../src/lib/quota-eligibility';
import type { DealDTO, StageJourney } from '../src/lib/pulse-types';

const deal = (over: Partial<DealDTO> & { id: string }): DealDTO =>
  ({
    id: over.id,
    name: over.id,
    amountValue: 100,
    otfValue: 0,
    stageId: '174677684',
    ownerId: '1',
    segment: 'Inbound',
    closeDateValue: '2026-10-01',
    ...over,
  }) as unknown as DealDTO;

describe('SALES-86 · classifyQuotaDeal', () => {
  test('renovación por dealtype queda fuera del cumplimiento', () => {
    const c = classifyQuotaDeal(deal({ id: 'a', dealType: 'Renovación', productToHire: 'SMS' }));
    expect(c.counts).toBe(false);
    expect(c.kind).toBe('renewal');
  });

  test('renovación solo por segmento (snapshot sin dealtype) también queda fuera', () => {
    const c = classifyQuotaDeal(deal({ id: 'a', segment: 'Renovación' }) as never);
    expect(c.counts).toBe(false);
    expect(c.kind).toBe('renewal');
  });

  test('contracción queda fuera del cumplimiento', () => {
    const c = classifyQuotaDeal(deal({ id: 'a', dealType: 'Contracción', productToHire: 'SMS' }));
    expect(c.counts).toBe(false);
    expect(c.kind).toBe('contraction');
  });

  test('producto 100% billetera queda fuera del cumplimiento', () => {
    const c = classifyQuotaDeal(deal({ id: 'a', dealType: 'Nuevo', productToHire: 'Billetera Engage' }));
    expect(c.counts).toBe(false);
    expect(c.kind).toBe('wallet');
  });

  test('billetera mezclada con otro producto cuenta pero queda marcada para revisión', () => {
    const c = classifyQuotaDeal(deal({ id: 'a', dealType: 'Nuevo', productToHire: 'Billetera Engage;SMS' }));
    expect(c.counts).toBe(true);
    expect(c.kind).toBe('mixed');
    expect(c.review).toBe(true);
  });

  test('MRR = 0 nunca decide por sí solo: deal elegible con monto 0 sigue contando', () => {
    const c = classifyQuotaDeal(deal({ id: 'a', amountValue: 0, dealType: 'Nuevo', productToHire: 'SMS' }));
    expect(c.counts).toBe(true);
    expect(c.kind).toBe('eligible');
  });

  test('upsell no implica billetera', () => {
    const c = classifyQuotaDeal(deal({ id: 'a', segment: 'Upsell', dealType: 'Nuevo', productToHire: 'SMS' }));
    expect(c.counts).toBe(true);
    expect(c.kind).toBe('eligible');
  });

  test('sin dato de producto (snapshot antiguo) cuenta pero queda para revisión', () => {
    const c = classifyQuotaDeal(deal({ id: 'a', dealType: 'Nuevo' }) as never);
    expect(c.counts).toBe(true);
    expect(c.kind).toBe('unknown');
    expect(c.review).toBe(true);
  });

  test('sin dato del tipo (snapshot antiguo) cuenta pero queda para revisión', () => {
    const c = classifyQuotaDeal(deal({ id: 'a', productToHire: 'SMS' }) as never);
    expect(c.counts).toBe(true);
    expect(c.kind).toBe('unknown');
    expect(c.review).toBe(true);
  });
});

describe('SALES-86 · quotaStats', () => {
  test('totales salen de la misma lista, sin duplicados por id', () => {
    const d = deal({ id: 'a', amountValue: 100, dealType: 'Nuevo', productToHire: 'SMS' });
    const s = quotaStats([d, d]);
    expect(s.won).toBe(1);
    expect(s.wonAmount).toBe(100);
  });

  test('excluidos no suman monto ni conteo', () => {
    const s = quotaStats([
      deal({ id: 'a', amountValue: 100, dealType: 'Nuevo', productToHire: 'SMS' }),
      deal({ id: 'b', amountValue: 500, dealType: 'Renovación', productToHire: 'SMS' }),
      deal({ id: 'c', amountValue: 900, dealType: 'Nuevo', productToHire: 'Billetera Engage' }),
    ]);
    expect(s.won).toBe(1);
    expect(s.wonAmount).toBe(100);
    expect(s.excluded.map((d) => d.id).sort()).toEqual(['b', 'c']);
  });

  test('revisión reúne mixtos y desconocidos sin sacarlos del conteo', () => {
    const s = quotaStats([
      deal({ id: 'a', amountValue: 10, dealType: 'Nuevo', productToHire: 'Billetera Engage;SMS' }),
      deal({ id: 'b', amountValue: 20, dealType: 'Nuevo' }) as never,
    ]);
    expect(s.won).toBe(2);
    expect(s.wonAmount).toBe(30);
    expect(s.review.map((d) => d.id).sort()).toEqual(['a', 'b']);
  });
});

describe('SALES-85 · proposeStage6Attribution (propuesta, no aplicada)', () => {
  const journey = (over: { id: string; stageId: string; entered: Record<string, string> }): StageJourney =>
    ({ deal: deal({ id: over.id, stageId: over.stageId }), createdAt: '2026-01-01', entered: over.entered }) as unknown as StageJourney;

  test('deal que llegó a 6.2 se atribuye al Q de entrada real a E6', () => {
    const p = proposeStage6Attribution(
      journey({ id: 'a', stageId: '1086544542', entered: { E6: '2026-08-10T00:00:00Z', 'E6.2': '2026-08-20T00:00:00Z' } }),
    );
    expect(p?.status).toBe('reached-6.2');
    expect(p?.attributionPeriod).toBe('2026-Q3');
  });

  test('pendiente en E6/E6.1 conserva el Q de entrada a E6', () => {
    const p = proposeStage6Attribution(
      journey({ id: 'a', stageId: '174677684', entered: { E6: '2026-10-05T00:00:00Z' } }),
    );
    expect(p?.status).toBe('pending');
    expect(p?.attributionPeriod).toBe('2026-Q4');
  });

  test('perdido después de E6 queda marcado, sin decidir tratamiento', () => {
    const p = proposeStage6Attribution(
      journey({ id: 'a', stageId: '171385869', entered: { E6: '2026-10-05T00:00:00Z' } }),
    );
    expect(p?.status).toBe('lost-after-6');
    expect(p?.reviewReason).toContain('JC');
  });

  test('E6.2 anterior a E6 (reingreso/retroceso) queda en revisión', () => {
    const p = proposeStage6Attribution(
      journey({ id: 'a', stageId: '1086544542', entered: { E6: '2026-08-20T00:00:00Z', 'E6.2': '2026-08-10T00:00:00Z' } }),
    );
    expect(p?.status).toBe('review');
  });

  test('volvió a E6 tras llegar a E6.2 queda en revisión', () => {
    const p = proposeStage6Attribution(
      journey({ id: 'a', stageId: '174677684', entered: { E6: '2026-08-10T00:00:00Z', 'E6.2': '2026-08-20T00:00:00Z' } }),
    );
    expect(p?.status).toBe('review');
  });

  test('sin fecha confiable de entrada a E6 queda en revisión', () => {
    const p = proposeStage6Attribution(
      journey({ id: 'a', stageId: '1086544542', entered: { E6: 'no-es-fecha' } }),
    );
    expect(p?.status).toBe('review');
    expect(p?.attributionPeriod).toBeNull();
  });

  test('deal sin relación con E6 no produce propuesta', () => {
    const p = proposeStage6Attribution(journey({ id: 'a', stageId: '171385864', entered: {} }));
    expect(p).toBeNull();
  });
});

describe('SALES-85 · pendingFromPreviousQuarters', () => {
  const journey = (id: string, stageId: string, e6: string): StageJourney =>
    ({ deal: deal({ id, stageId }), createdAt: '2026-01-01', entered: { E6: e6 } }) as unknown as StageJourney;

  test('pendiente de un Q anterior aparece una sola vez; pendiente del Q actual no', () => {
    const r = pendingFromPreviousQuarters(
      [journey('a', '174677684', '2026-08-10T00:00:00Z'), journey('b', '174677684', '2026-10-10T00:00:00Z')],
      '2026-Q4',
    );
    expect(r.pending.map((p) => p.deal.id)).toEqual(['a']);
  });

  test('periodOfDate usa el trimestre UTC de la fecha', () => {
    expect(periodOfDate('2026-01-01T00:00:00Z')).toBe('2026-Q1');
    expect(periodOfDate('2026-12-31T23:59:59Z')).toBe('2026-Q4');
  });
});
