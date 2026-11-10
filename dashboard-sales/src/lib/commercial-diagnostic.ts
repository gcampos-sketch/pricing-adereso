import { z } from 'zod';

export const DIAGNOSTIC_PREFIX = 'commercial-diagnostic/v1/';
export const DIAGNOSTIC_DIMENSIONS = [
  ['situation', 'Situación'], ['pain', 'Dolor'], ['impact', 'Impacto'],
  ['critical_event', 'Evento crítico'], ['decision', 'Decisión'],
] as const;
export type DiagnosticDimension = typeof DIAGNOSTIC_DIMENSIONS[number][0];
const text = z.string().max(16000);
const score = z.number().int().min(0).max(5).nullable();
const field = z.object({ text, score });
const source = z.object({ noteId: z.string().regex(/^\d+$/), date: z.iso.datetime({ offset: true }), url: z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && ['adereso.diio.com', 'app.diio.com', 'app.adere.so'].includes(url.hostname);
}) });
const evidence = z.object({ text, source });
export const diagnosticEditionSchema = z.object({
  schema: z.literal('commercial-diagnostic/v1'),
  date: z.iso.date(), capturedAt: z.iso.datetime({ offset: true }),
  label: z.string().min(1).max(120),
  scope: z.object({ pipeline: z.literal('93085851'), owners: z.record(z.string().regex(/^\d+$/), z.string()), total: z.number().int().nonnegative(), complete: z.literal(true) }),
  rows: z.array(z.object({
    id: z.string().regex(/^\d+$/), name: z.string().min(1).max(500), ownerId: z.string(), stage: z.string(), active: z.boolean(),
    spiced: z.object({ situation: field, pain: field, impact: field, critical_event: field, decision: field }),
    caseUse: text, objection: text,
    preparedCase: evidence.optional(), preparedObjection: evidence.optional(),
  })).max(10000),
}).superRefine((edition, context) => {
  if (edition.rows.length !== edition.scope.total || new Set(edition.rows.map(row => row.id)).size !== edition.rows.length) {
    context.addIssue({ code: 'custom', message: 'La captura debe contener todos los negocios, sin duplicados.' });
  }
  if (edition.rows.some(row => !Object.hasOwn(edition.scope.owners, row.ownerId))) {
    context.addIssue({ code: 'custom', message: 'Un negocio no pertenece al alcance de propietarios declarado.' });
  }
});
export type DiagnosticEdition = z.infer<typeof diagnosticEditionSchema>;
export type DiagnosticRow = DiagnosticEdition['rows'][number];
export type DiagnosticReport = {
  generatedAt: string;
  editions: { date: string; label: string }[];
  current: DiagnosticEdition | null;
  previous: DiagnosticEdition | null;
};

export function diagnosticSummary(rows: DiagnosticRow[]) {
  const active = rows.filter(row => row.active);
  const evaluated = active.filter(row => DIAGNOSTIC_DIMENSIONS.some(([key]) => row.spiced[key].score !== null || row.spiced[key].text));
  return {
    active, evaluated,
    cases: active.filter(row => row.caseUse.trim() || row.preparedCase).length,
    objections: active.filter(row => row.objection.trim() || row.preparedObjection).length,
    dimensions: DIAGNOSTIC_DIMENSIONS.map(([key, label]) => {
      const values = evaluated.flatMap(row => row.spiced[key].score === null ? [] : [row.spiced[key].score!]);
      return { key, label, covered: values.length, total: evaluated.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
    }),
  };
}

/** The exact active score-bearing population behind a dimension's mean. */
export function diagnosticDimensionDetail(rows: DiagnosticRow[], dimension: DiagnosticDimension) {
  const active = rows.filter(row => row.active);
  const evaluated = active.filter(row => row.spiced[dimension].score !== null).sort((a, b) => a.spiced[dimension].score! - b.spiced[dimension].score! || a.name.localeCompare(b.name));
  return {
    evaluated,
    missing: active.filter(row => row.spiced[dimension].score === null),
    mean: evaluated.length ? evaluated.reduce((sum, row) => sum + row.spiced[dimension].score!, 0) / evaluated.length : null,
  };
}

/** Textual themes are overlapping mentions, never diagnoses or lost reasons. */
export function diagnosticPatterns(rows: DiagnosticRow[], kind: 'cases' | 'objections') {
  const definitions = kind === 'cases' ? [
    ['Atención y calificación', /atenci[oó]n|consulta|precalific|leads/i],
    ['Pedidos y cotizaciones', /pedidos|cotizaci|stock|inventario/i],
    ['Centralización y trazabilidad', /centraliz|trazabilidad|unificar/i],
    ['Seguimiento y recuperación', /seguimiento|carritos|recupera/i],
    ['Integración con sistemas', /integraci|conectar|conexi[oó]n|crm|erp/i],
  ] as const : [
    ['Costo y retorno', /costo|precio|inversi[oó]n|presupuesto|rentabilidad|retorno|econ[oó]mic/i],
    ['Integración y alcance', /integraci|compatibil|alcance|factib|sistemas/i],
    ['Confianza, precisión y soporte', /soporte|precisi[oó]n|confianza|errores|continuidad|datos|aprendizaje/i],
    ['Volumen y condiciones', /volumen|bolsa|m[ií]nimo|contrato|permanencia/i],
  ] as const;
  const evidenced = rows.filter(row => row.active && Boolean(kind === 'cases' ? row.caseUse.trim() || row.preparedCase : row.objection.trim() || row.preparedObjection));
  return definitions.map(([label, pattern]) => ({ label, total: evidenced.length, rows: evidenced.filter(row => pattern.test(kind === 'cases' ? row.caseUse.trim() || row.preparedCase?.text || '' : row.objection.trim() || row.preparedObjection?.text || '')) })).sort((a, b) => b.rows.length - a.rows.length);
}

/** Compare the same IDs and scope; new documentation is not a purchase event. */
export function compareDiagnosticEditions(current: DiagnosticEdition, previous: DiagnosticEdition | null) {
  if (!previous) return null;
  if (current.scope.pipeline !== previous.scope.pipeline || JSON.stringify(Object.keys(current.scope.owners).sort()) !== JSON.stringify(Object.keys(previous.scope.owners).sort())) return null;
  const before = new Map(previous.rows.map(row => [row.id, row]));
  const now = new Set(current.rows.map(row => row.id));
  return {
    entered: current.rows.filter(row => !before.has(row.id)),
    exited: previous.rows.filter(row => !now.has(row.id)),
    changed: current.rows.flatMap(row => {
      const old = before.get(row.id);
      if (!old) return [];
      const fields: string[] = [];
      if (row.stage !== old.stage) fields.push('Etapa');
      if (row.ownerId !== old.ownerId) fields.push('Comercial');
      for (const [key, label] of DIAGNOSTIC_DIMENSIONS) if (row.spiced[key].text !== old.spiced[key].text || row.spiced[key].score !== old.spiced[key].score) fields.push(label);
      if (row.caseUse !== old.caseUse || JSON.stringify(row.preparedCase) !== JSON.stringify(old.preparedCase)) fields.push('Caso de uso');
      if (row.objection !== old.objection || JSON.stringify(row.preparedObjection) !== JSON.stringify(old.preparedObjection)) fields.push('Objeciones');
      return fields.length ? [{ row, before: old, fields }] : [];
    }),
  };
}
