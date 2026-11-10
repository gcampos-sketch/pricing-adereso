import { expect, test } from 'bun:test';
import { compareDiagnosticEditions, diagnosticDimensionDetail, diagnosticEditionSchema, diagnosticPatterns, diagnosticSummary, type DiagnosticEdition, type DiagnosticRow } from '../src/lib/commercial-diagnostic';
import { readFileSync } from 'node:fs';

function row(id = '1'): DiagnosticRow {
  return { id, name: `Empresa ${id}`, ownerId: '7', stage: '171385867', active: true, caseUse: '', objection: '', spiced: { situation: { text: '', score: null }, pain: { text: '', score: 0 }, impact: { text: '', score: 2 }, critical_event: { text: '', score: null }, decision: { text: '', score: null } } };
}
function edition(rows: DiagnosticRow[]): DiagnosticEdition {
  return { schema: 'commercial-diagnostic/v1', date: '2026-11-10', capturedAt: '2026-11-10T15:00:00Z', label: 'Edición de prueba', scope: { pipeline: '93085851', owners: { '7': 'Comercial de prueba' }, total: rows.length, complete: true }, rows };
}
test('null is missing evidence; a real zero counts, closed rows never enter active means', () => {
  const closed = { ...row('2'), active: false };
  const result = diagnosticSummary([row(), closed]);
  expect(result.active).toHaveLength(1);
  expect(result.dimensions.find(item => item.key === 'pain')).toMatchObject({ covered: 1, mean: 0 });
  expect(result.dimensions.find(item => item.key === 'critical_event')).toMatchObject({ covered: 0, mean: null });
});
test('partial, duplicate and out-of-scope snapshots are rejected before publication', () => {
  const value = edition([row()]);
  expect(diagnosticEditionSchema.safeParse({ ...value, scope: { ...value.scope, complete: false } }).success).toBe(false);
  expect(diagnosticEditionSchema.safeParse(edition([row(), row()])).success).toBe(false);
  expect(diagnosticEditionSchema.safeParse({ ...value, scope: { ...value.scope, total: 2 } }).success).toBe(false);
  expect(diagnosticEditionSchema.safeParse(edition([{ ...row(), ownerId: '8' }])).success).toBe(false);
});
test('source URLs cannot embed script schemes or arbitrary external domains', () => {
  const value = row();
  value.preparedCase = { text: 'Centralizar atención', source: { noteId: '11', date: '2026-11-09T15:00:00Z', url: 'https://adereso.diio.com/meetings/example' } };
  expect(diagnosticEditionSchema.safeParse(edition([value])).success).toBe(true);
  value.preparedCase.source.url = 'javascript:alert(1)';
  expect(diagnosticEditionSchema.safeParse(edition([value])).success).toBe(false);
});
test('comparison separates entries/exits, reassignment and new documentation without inventing a purchase', () => {
  const old = edition([row(), row('2')]);
  const changed = { ...row(), caseUse: 'Atención por WhatsApp', ownerId: '8' };
  const next = { ...edition([changed, row('3')]), scope: { ...old.scope, owners: { '7': 'A', '8': 'B' } } };
  old.scope.owners['8'] = 'B';
  const diff = compareDiagnosticEditions(next, old)!;
  expect(diff.entered.map(item => item.id)).toEqual(['3']);
  expect(diff.exited.map(item => item.id)).toEqual(['2']);
  expect(diff.changed[0]?.fields).toEqual(['Comercial', 'Caso de uso']);
  expect(compareDiagnosticEditions(next, null)).toBeNull();
  expect(compareDiagnosticEditions(next, { ...old, scope: { ...old.scope, owners: { '9': 'Otro alcance' } } })).toBeNull();
});
test('theme denominators cover only evidenced active deals; patterns may overlap', () => {
  const one = { ...row(), caseUse: 'Centralizar consultas y pedidos con integración ERP' };
  const result = diagnosticPatterns([one, row('2'), { ...row('3'), active: false, caseUse: 'Pedidos' }], 'cases');
  expect(result.every(item => item.total === 1)).toBe(true);
  expect(result.filter(item => item.rows.length).length).toBeGreaterThan(1);
});
test('dimension drilldown uses the exact mean population with real zeroes and missing scores separate', () => {
  const zero = row('1'); zero.spiced.impact.score = 0;
  const missing = row('2'); missing.spiced.impact.score = null;
  const high = row('3'); high.spiced.impact.score = 4;
  const closed = { ...row('4'), active: false };
  const rows = [high, missing, closed, zero];
  const detail = diagnosticDimensionDetail(rows, 'impact');
  expect(detail.evaluated.map(item => item.id)).toEqual(['1', '3']);
  expect(detail.missing.map(item => item.id)).toEqual(['2']);
  expect(detail.mean).toBe(2);
  expect(detail.mean).toBe(diagnosticSummary(rows).dimensions.find(item => item.key === 'impact')!.mean);
  expect(diagnosticDimensionDetail([missing], 'impact').mean).toBeNull();
});
test('the archive is MFA protected and local source material is never a browser import', () => {
  const fn = readFileSync(new URL('../src/lib/commercial-diagnostic.functions.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../src/lib/commercial-diagnostic.server.ts', import.meta.url), 'utf8');
  const publisher = readFileSync(new URL('../scripts/publish-commercial-diagnostic.ts', import.meta.url), 'utf8');
  expect(fn).toContain('.middleware([requireMfa])');
  expect(server).toContain('if (!import.meta.env.DEV) return null');
  expect(publisher).not.toContain('.upsert(');
  expect(publisher).toContain('.insert(');
});
