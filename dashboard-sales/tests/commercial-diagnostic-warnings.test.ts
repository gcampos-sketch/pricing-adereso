import { expect, test } from 'bun:test';
import { diagnosticWarnings, warningComparison, warningCoverage } from '../src/lib/commercial-diagnostic-warnings';
import type { DiagnosticEdition, DiagnosticRow } from '../src/lib/commercial-diagnostic';

function row(id = '1'): DiagnosticRow {
  const field = () => ({ text: '', score: null });
  return { id, name: 'Cliente de prueba', ownerId: '7', stage: '171385867', active: true, caseUse: '', objection: '', spiced: { situation: field(), pain: field(), impact: field(), critical_event: field(), decision: field() } };
}
const edition = (rows: DiagnosticRow[]): DiagnosticEdition => ({ schema: 'commercial-diagnostic/v1', date: '2026-11-10', capturedAt: '2026-11-10T15:00:00Z', label: 'Prueba', scope: { pipeline: '93085851', owners: { '7': 'AE' }, total: rows.length, complete: true }, rows });

test('empty evidence and low scores alone create coverage gaps, never asserted sales omissions', () => {
  const one = row(); one.spiced.impact.score = 1;
  expect(diagnosticWarnings([one])).toEqual([]);
  expect(warningCoverage([row()]).spiced).toHaveLength(1);
  expect(warningCoverage([{ ...row(), active: false }]).total).toBe(0);
});
test('warnings retain literal evidence and exact source without mixing case and objection', () => {
  const one = row();
  one.spiced.impact.text = 'No se acordaron base, meta ni responsable.';
  one.preparedCase = { text: 'Integración con ERP por validar.', source: { noteId: '11', date: '2026-10-01T15:00:00Z', url: 'https://adereso.diio.com/meetings/a' } };
  one.preparedObjection = { text: 'El comprador está en pausa por presupuesto.', source: { noteId: '12', date: '2026-11-01T15:00:00Z', url: 'https://adereso.diio.com/meetings/b' } };
  const found = diagnosticWarnings([one]);
  expect(found.find(item => item.rule === 'impact')?.evidence).toBe(one.spiced.impact.text);
  expect(found.find(item => item.rule === 'integration')?.source?.noteId).toBe('11');
  expect(found.find(item => item.rule === 'pause')?.source?.noteId).toBe('12');
  one.spiced.critical_event.text = 'El comprador pausó el proyecto.';
  expect(diagnosticWarnings([one]).find(item => item.rule === 'pause')?.source).toBeUndefined();
});
test('explicit cleared concerns do not generate warnings from keywords alone', () => {
  const one = row(); one.objection = 'No tiene preocupación por el costo. La duda económica está resuelta.';
  one.caseUse = 'No hay integraciones pendientes.';
  one.spiced.critical_event.text = 'No está en pausa.';
  expect(diagnosticWarnings([one])).toEqual([]);
});
test('first edition and different owner populations cannot fabricate warning trends', () => {
  const one = row(); one.spiced.impact.text = 'Faltan meta y plazo.';
  expect(warningComparison(edition([one]), null)).toBeNull();
  expect(warningComparison(edition([one]), { ...edition([one]), scope: { ...edition([one]).scope, owners: { '8': 'Otro' } } })).toBeNull();
});
test('disappearance distinguishes changed evidence, missing coverage and leaving the active population', () => {
  const before = row(); before.spiced.impact.text = 'Faltan meta y plazo.';
  const after = row(); after.spiced.impact.text = 'El cliente acordó meta, plazo y responsable.';
  expect(warningComparison(edition([after]), edition([before]))?.noLongerObserved).toHaveLength(1);
  expect(warningComparison(edition([row()]), edition([before]))?.lostCoverage).toHaveLength(1);
  expect(warningComparison(edition([{ ...before, active: false }]), edition([before]))?.outsideScope).toHaveLength(1);
  expect(warningComparison(edition([{ ...before, active: false }]), edition([before]))?.noLongerObserved).toHaveLength(0);
});
test('new deals are entries, not new deterioration on an existing deal', () => {
  const added = row('2'); added.spiced.decision.text = 'Sin aprobación económica verificada.';
  const diff = warningComparison(edition([row(), added]), edition([row()]))!;
  expect(diff.entered).toHaveLength(1);
  expect(diff.appeared).toHaveLength(0);
});
