import { DIAGNOSTIC_DIMENSIONS, type DiagnosticEdition, type DiagnosticRow } from './commercial-diagnostic';

export type DiagnosticWarning = {
  id: string; rule: string; row: DiagnosticRow; kind: 'warning' | 'gap';
  title: string; action: string; evidence: string; field: string;
  source?: { date: string; url: string };
};

/** Literal, bounded evidence only. Scores and empty fields cannot prove a conversation omission. */
function excerpt(text: string, matches: (sentence: string) => boolean) {
  const sentence = text.split(/\n|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¿])/).find(part => matches(part));
  if (!sentence) return null;
  return sentence.length > 300 ? sentence.slice(0, 297).trimEnd() + '…' : sentence.trim();
}

export function diagnosticWarnings(rows: DiagnosticRow[]): DiagnosticWarning[] {
  return rows.filter(row => row.active).flatMap(row => {
    const findings: DiagnosticWarning[] = [];
    const add = (rule: string, title: string, action: string, evidence: string | null, field: string, kind: DiagnosticWarning['kind'] = 'gap', source?: DiagnosticWarning['source']) => {
      if (evidence) findings.push({ id: `${row.id}/${rule}`, rule, row, title, action, evidence, field, kind, ...(source ? { source } : {}) });
    };
    const impact = row.spiced.impact.text;
    add('impact', 'Impacto sin medir', 'Acordar base, meta, plazo y quién medirá el resultado.', excerpt(impact, sentence => /no se acord|no (?:hay|consta)|faltan?|por (?:definir|validar)|sin cuantificar/i.test(sentence)), 'SPICED · Impacto');
    const event = row.spiced.critical_event.text;
    add('event', 'Hito por confirmar', 'Confirmar cuándo se decide y qué ocurre si se posterga.', excerpt(event, sentence => /sin fecha|no hay.*(?:fecha|ventana)|no fij|no.*fecha.*confirm|no es.*fecha.*(?:compra|acordada)|hist[oó]ric|ventana.*(?:pas|superad)|no mencionado|compra.*(?:sin definir|por definir)|hito.*sin definir/i.test(sentence)), 'SPICED · Evento crítico');
    const pauseMatch = (sentence: string) => /paus[oó]|en pausa|pausad|mantener esa espera/i.test(sentence) && !/no (?:est[aá]|sigue).*pausa|pausa.*levantada|retom[oó] (?:el|la) (?:proyecto|evaluaci[oó]n)/i.test(sentence);
    const eventPause = excerpt(event, pauseMatch);
    add('pause', 'Pausa documentada', 'Confirmar vigencia y condición para retomar; respetar la espera.', eventPause ?? excerpt(row.objection.trim() || row.preparedObjection?.text || '', pauseMatch), eventPause ? 'SPICED · Evento crítico' : 'Objeciones', 'warning', !eventPause && !row.objection ? row.preparedObjection?.source : undefined);
    const decision = row.spiced.decision.text;
    add('decision', 'Aprobación por confirmar', 'Identificar quién aprueba, con qué criterio y qué falta para decidir.', excerpt(decision, sentence => /no.*aprob|sin.*aprob|presupuesto.*(?:pendiente|por validar)|autoridad.*no confirm|aprobador.*no confirm|no consta.*presupuesto/i.test(sentence)), 'SPICED · Decisión');
    const useCase = row.caseUse.trim() || row.preparedCase?.text || '';
    const objection = row.objection.trim() || row.preparedObjection?.text || '';
    const integrationMatch = (sentence: string) => /integra|\bAPI\b|compatibil|factib/i.test(sentence) && /por validar|por definir|por evaluar|sujet[oa]|pendiente|falta.*valid|dudas|preocupaci[oó]n/i.test(sentence) && !/no (?:hay|quedan|existen).*pendientes/i.test(sentence);
    const caseIntegration = excerpt(useCase, integrationMatch);
    add('integration', 'Integración por validar', 'Acordar una validación técnica, responsable y criterio de aceptación.', caseIntegration ?? excerpt(objection, integrationMatch), caseIntegration ? 'Caso de uso' : 'Objeciones', 'gap', caseIntegration ? (!row.caseUse ? row.preparedCase?.source : undefined) : (!row.objection ? row.preparedObjection?.source : undefined));
    add('cost', 'Duda económica', 'Aclarar la duda y desglosar plan, implementación, Meta y excedentes.', excerpt(objection, sentence => /costo|precio|inversi[oó]n|presupuesto|bolsa/i.test(sentence) && /preocupa|duda|cuestion|elevad|sobredimension|m[aá]s alto|inquietud|no cuenta|necesita|revisar|compar/i.test(sentence) && !/no (?:tiene|hay|manifest[oó]|expres[oó]|mostr[oó]).*preocup|sin dudas|(?:duda|preocupaci[oó]n).*(?:aclarada|resuelta)/i.test(sentence)), 'Objeciones', 'warning', !row.objection ? row.preparedObjection?.source : undefined);
    return findings;
  });
}

export function warningCoverage(rows: DiagnosticRow[]) {
  const active = rows.filter(row => row.active);
  return {
    total: active.length,
    spiced: active.filter(row => DIAGNOSTIC_DIMENSIONS.every(([key]) => row.spiced[key].score === null && !row.spiced[key].text.trim())),
    cases: active.filter(row => !row.caseUse.trim() && !row.preparedCase),
    objections: active.filter(row => !row.objection.trim() && !row.preparedObjection),
  };
}

export function warningComparison(current: DiagnosticEdition, previous: DiagnosticEdition | null, owner?: string) {
  if (!previous || current.scope.pipeline !== previous.scope.pipeline || JSON.stringify(Object.keys(current.scope.owners).sort()) !== JSON.stringify(Object.keys(previous.scope.owners).sort())) return null;
  const select = (row: DiagnosticRow) => !owner || owner === 'team' || row.ownerId === owner;
  const before = diagnosticWarnings(previous.rows);
  const after = diagnosticWarnings(current.rows);
  const old = new Map(before.map(item => [item.id, item]));
  const now = new Set(after.map(item => item.id));
  const currentRows = new Map(current.rows.map(row => [row.id, row]));
  const oldRows = new Map(previous.rows.map(row => [row.id, row]));
  const hasInput = (row: DiagnosticRow, rule: string) => {
    const objection = row.objection.trim() || row.preparedObjection?.text || '';
    if (rule === 'cost') return Boolean(objection.trim());
    if (rule === 'integration') return Boolean((row.caseUse.trim() || row.preparedCase?.text || objection).trim());
    if (rule === 'pause') return Boolean((row.spiced.critical_event.text || objection).trim());
    const key = rule === 'event' ? 'critical_event' : rule as 'impact' | 'decision';
    return Boolean(row.spiced[key]?.text.trim());
  };
  return {
    appeared: after.filter(item => select(item.row) && !old.has(item.id) && oldRows.get(item.row.id)?.active && select(oldRows.get(item.row.id)!)),
    entered: after.filter(item => select(item.row) && (!oldRows.get(item.row.id)?.active || !select(oldRows.get(item.row.id)!))),
    persisted: after.filter(item => select(item.row) && old.has(item.id)),
    noLongerObserved: before.filter(item => select(item.row) && !now.has(item.id) && currentRows.get(item.row.id)?.active && select(currentRows.get(item.row.id)!) && hasInput(currentRows.get(item.row.id)!, item.rule)),
    outsideScope: before.filter(item => select(item.row) && (!currentRows.get(item.row.id)?.active || !select(currentRows.get(item.row.id)!))),
    lostCoverage: before.filter(item => select(item.row) && !now.has(item.id) && currentRows.get(item.row.id)?.active && select(currentRows.get(item.row.id)!) && !hasInput(currentRows.get(item.row.id)!, item.rule)),
  };
}
