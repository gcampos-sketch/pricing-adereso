import type { DealDTO } from './pulse-types';
import { roleOfOwner, type RoleFilter } from './owner-roles';

/** Exact CRM property contract; not all properties are arithmetic score inputs. */
export const ADOBO_GROUPS = [
  { name: 'Resultado', explanation: 'Señal comercial; no es una probabilidad estadística calibrada.', fields: [
    ['adobo_closing_score', 'Señal comercial', 'Score publicado por Adobo, de 0 a 100.'],
    ['adobo_score_driver_principal', 'Motor principal', 'Factor principal reportado por Adobo.'],
    ['adobo_score_last_change_reason', 'Razón del cambio', 'Explicación registrada del último cambio.'],
    ['adobo_score_last_changed_at', 'Último cambio', 'Fecha de cambio del score, no de evaluación.'],
    ['adobo_score_trend', 'Tendencia registrada', 'Valor del CRM; no demuestra un historial numérico.'],
  ] },
  { name: 'Calificación', explanation: 'Contexto comercial registrado; no se infiere su contribución aritmética.', fields: [
    ['adobo_icp_score', 'Score ICP', 'Calificación ICP independiente del closing score.'],
    ['adobo_icp_fit', 'Fit ICP', 'Encaje reportado con el perfil ideal.'],
    ['adobo_icp_fit_evidencia', 'Evidencia ICP', 'Texto que justifica el encaje.'],
    ['adobo_motivo_compra', 'Motivo de compra', 'Motivo registrado.'],
    ['adobo_pain_categoria', 'Necesidad', 'Categoría de necesidad registrada.'],
    ['adobo_decisor_presente', 'Decisor presente', 'Presencia declarada del decisor.'],
    ['adobo_presupuesto_mencionado', 'Presupuesto mencionado', 'Mención de presupuesto, no aprobación.'],
    ['adobo_current_timing', 'Timing', 'Horizonte comercial registrado.'],
    ['adobo_current_urgencia', 'Urgencia', 'Urgencia registrada.'],
    ['adobo_next_step_claro', 'Próximo paso claro', 'Indicador; no proporciona responsable ni fecha.'],
    ['adobo_current_objecion', 'Objeción', 'Objeción comercial registrada.'],
    ['adobo_current_competidor', 'Competidor', 'Competidor registrado.'],
    ['adobo_tiene_whatsapp_b_api_negociacion', 'WhatsApp Business API', 'Uso registrado; no prueba una respuesta.'],
    ['adobo_stakeholders_mapeados', 'Stakeholders', 'Participantes mapeados.'],
    ['adobo_riesgos_restricciones', 'Riesgos y restricciones', 'Contexto registrado.'],
    ['adobo_compromisos_especiales', 'Compromisos especiales', 'Texto registrado; no demuestra vencimiento.'],
  ] },
  { name: 'Contacto', explanation: 'Contadores históricos y ratio legado, separados de episodios de seguimiento.', fields: [
    ['adobo_intentos_contacto_prospecto', 'Intentos históricos', 'No equivalen a episodios elegibles.'],
    ['adobo_respuestas_prospecto', 'Respuestas históricas', 'No equivalen a episodios respondidos.'],
    ['adobo_tasa_contactabilidad_prospecto', 'Ratio legado (%)', 'Respuestas / intentos × 100; puede superar 100%. No se trunca.'],
  ] },
  { name: 'Reuniones y confianza', explanation: 'Una reunión o cambio de snapshot no identifica una evaluación nueva.', fields: [
    ['adobo_last_reu_date', 'Última reunión', 'Fecha de reunión, no de evaluación.'],
    ['adobo_last_diio_meeting_id', 'ID reunión Diio', 'Identificador; no se fabrica un enlace a Diio.'],
    ['adobo_last_reu_tipo', 'Tipo de reunión', 'Clasificación registrada.'],
    ['adobo_reus_analizadas_count', 'Reuniones analizadas', 'Conteo registrado.'],
    ['adobo_last_reu_quality', 'Calidad de reunión', 'Calidad registrada.'],
    ['adobo_snapshot_confidence', 'Confianza', 'Confianza declarada por Adobo.'],
  ] },
  { name: 'Seguimiento', explanation: 'Solo representa el estado del CRM; no cambia pinzas.', fields: [
    ['seguimiento_con_pinzas', 'Seguimiento con pinzas', 'Marca del CRM. Sin evidencia específica no se atribuye un motivo.'],
  ] },
  { name: 'Coaching', explanation: 'Oportunidades de mejora separadas del score.', fields: [
    ['adobo_oportunidad_de_mejora', 'Oportunidad de mejora', 'Categoría de coaching.'],
    ['adobo_oportunidad_de_mejora_evidencia', 'Evidencia de coaching', 'Justificación registrada del coaching.'],
  ] },
  { name: 'Traspaso y portal', explanation: 'Estado operativo; no son inputs de probabilidad.', fields: [
    ['adobo_handoff_ready', 'Traspaso listo', 'Disponibilidad para onboarding.'],
    ['adobo_handoff_missing_fields', 'Faltantes de traspaso', 'Información operativa faltante.'],
    ['adobo_handoff_riesgo_operativo', 'Riesgo operativo', 'Riesgo de traspaso registrado.'],
    ['adobo_etapa_actual_portal_cliente', 'Etapa del portal', 'Etapa operativa actual.'],
    ['adobo_dias_en_etapa_actual', 'Días en etapa', 'Antigüedad operativa registrada.'],
    ['adobo_avance_kickoff_pct', 'Avance kickoff (%)', 'Porcentaje operativo, no score comercial.'],
  ] },
  { name: 'Métricas independientes', explanation: 'Probabilidades CRM y on track no son Adobo score.', fields: [
    ['hs_deal_stage_probability', 'Probabilidad de etapa CRM', 'Contrato CRM fraccional 0–1; se muestra en porcentaje.'],
    ['hs_forecast_probability', 'Probabilidad forecast CRM', 'Contrato CRM fraccional 0–1; independiente de Adobo.'],
    ['on_track', 'On track', 'Estado del CRM independiente de pinzas.'],
  ] },
] as const;

export const ADOBO_INTELLIGENCE_PROPS = ADOBO_GROUPS.flatMap(g => g.fields.map(f => f[0]));
export type AdoboProperty = typeof ADOBO_GROUPS[number]['fields'][number][0];
export type AdoboPropertyValues = Partial<Record<AdoboProperty, string | null>>;

export function numericValue(raw: string | number | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
/** Percentage already in percent units. Never magnitude-detect or clamp. */
export const legacyContactPercent = numericValue;
export function crmFractionPercent(raw: string | number | null | undefined): number | null {
  const value = numericValue(raw);
  return value == null ? null : value * 100;
}
export function booleanValue(raw: string | null | undefined): boolean | null {
  const value = raw?.trim().toLowerCase();
  if (['true', 'si', 'sí', 'yes', '1'].includes(value ?? '')) return true;
  if (['false', 'no', '0'].includes(value ?? '')) return false;
  return null;
}

export type Evidence = { url: string; at: string };
export function validEvidence(e: Evidence | null | undefined): e is Evidence {
  if (!e || !Number.isFinite(Date.parse(e.at))) return false;
  try { return new URL(e.url).protocol === 'https:'; } catch { return false; }
}
/** Integration DTO, not new CRM properties. Only a verified producer may supply it. */
export type FollowupEpisodesV1 = {
  version: 'followup-episodes/v1';
  methodology: 'responded-eligible-episodes';
  verified: boolean;
  fresh: boolean;
  coverageVerified: boolean;
  pauseAgreed: boolean | null;
  window: { start: string; end: string };
  observedAt: string;
  /** Producer-owned freshness contract; no application/business TTL default. */
  validity?: { version: 'producer-validity/v1'; maxAgeMs: number } | null;
  /** Counts episodes, including pending episodes; covered must match the supplied list. */
  coverage: { covered: number; total: number };
  episodes: { id: string; state: 'pending' | 'eligible'; response: Evidence | null; evidence: Evidence;
    /** Actual response deadline supplied by the producer, never inferred. */
    dueAt?: string | null }[];
};
export function episodeResponseMetric(input?: FollowupEpisodesV1 | null, now: number = Date.now()) {
  if (!input || input.version !== 'followup-episodes/v1' || input.methodology !== 'responded-eligible-episodes' ||
      input.verified !== true || input.fresh !== true || input.coverageVerified !== true ||
      typeof input.pauseAgreed !== 'boolean' || !Number.isFinite(now) ||
      !input.window || !input.coverage || !Array.isArray(input.episodes)) return null;
  const start = Date.parse(input.window.start), end = Date.parse(input.window.end);
  const observed = Date.parse(input.observedAt);
  const validity = input.validity;
  if (![start, end, observed].every(Number.isFinite) || start > end || end > observed || observed > now ||
      validity?.version !== 'producer-validity/v1' || !Number.isSafeInteger(validity.maxAgeMs) ||
      validity.maxAgeMs <= 0 || now - observed >= validity.maxAgeMs) return null;
  const { covered, total } = input.coverage;
  if (!Number.isSafeInteger(covered) || !Number.isSafeInteger(total) || total <= 0 ||
      covered < 0 || covered > total || covered !== input.episodes.length) return null;
  const withinWindow = (e: Evidence | null | undefined) => validEvidence(e) &&
    Date.parse(e.at) >= start && Date.parse(e.at) <= end;
  if (new Set(input.episodes.map(e => e?.id)).size !== input.episodes.length ||
      input.episodes.some(e => {
        if (!e || typeof e.id !== 'string' || !e.id.trim() || !['pending', 'eligible'].includes(e.state) ||
            !withinWindow(e.evidence)) return true;
        const requested = Date.parse(e.evidence.at);
        if (e.response != null && (!withinWindow(e.response) || Date.parse(e.response.at) < requested)) return true;
        if (e.dueAt != null) {
          const due = Date.parse(e.dueAt);
          if (!Number.isFinite(due) || due < requested) return true;
        }
        // Absence requires an actually elapsed deadline inside the observed window.
        return e.state === 'eligible' && e.response == null &&
          (e.dueAt == null || Date.parse(e.dueAt) > now || Date.parse(e.dueAt) > end || Date.parse(e.dueAt) >= observed);
      })) return null;
  const eligible = input.episodes.filter(e => e.state === 'eligible');
  const responded = eligible.filter(e => e.response != null).length;
  const coverageStatus = covered === total ? 'complete' as const : 'partial' as const;
  // Partial samples never stand in for the global metric or confirm absence.
  return { value: coverageStatus === 'complete' && eligible.length ? responded / eligible.length * 100 : null,
    coverageStatus, eligible: eligible.length, responded,
    window: input.window, coverage: input.coverage, methodology: input.methodology, pauseAgreed: input.pauseAgreed };
}
export type AdoboVerifiedContextV1 = {
  version: 'adobo-evidence/v1';
  /** Integration-only producer contract. Missing metadata fails closed. */
  temporal?: {
    version: 'adobo-context-time/v1'; observedAt: string;
    window: { start: string; end: string };
    validity: { version: 'producer-validity/v1'; maxAgeMs: number };
  } | null;
  verified: boolean;
  fresh: boolean;
  coverageVerified: boolean;
  evaluation: Evidence | null;
  history: { score: number; evidence: Evidence }[];
  lastCustomerResponse: Evidence | null;
  nextStep: { text: string; responsible: string | null; dueAt: string | null; evidence: Evidence } | null;
  commitment: { dueAt: string; completed: boolean; evidence: Evidence } | null;
  pinzasEvidence: Evidence | null;
  followup: FollowupEpisodesV1 | null;
};
/** `ignoreExpiry` keeps every structural/temporal check except the producer TTL, for showing a historical (expired) evaluation. */
export function verifiedContext(deal: DealDTO, now: number = Date.now(), opts: { ignoreExpiry?: boolean } = {}) {
  const c = deal.adobo?.verifiedContext;
  if (c?.version !== 'adobo-evidence/v1' || c.verified !== true || c.fresh !== true ||
      c.coverageVerified !== true || !Number.isFinite(now)) return null;
  const t = c.temporal;
  if (t?.version !== 'adobo-context-time/v1' || !t.window ||
      t.validity?.version !== 'producer-validity/v1') return null;
  const start = Date.parse(t.window.start), end = Date.parse(t.window.end), observed = Date.parse(t.observedAt);
  const age = t.validity.maxAgeMs;
  if (![start,end,observed].every(Number.isFinite) || start > end || end > observed || observed > now ||
      !Number.isSafeInteger(age) || age <= 0 || (!opts.ignoreExpiry && now - observed >= age)) return null;
  const inWindow = (e: Evidence | null | undefined) => validEvidence(e) &&
    Date.parse(e.at) >= start && Date.parse(e.at) <= end;
  const currentEvidence = (e: Evidence | null | undefined) => inWindow(e) &&
    e != null && Date.parse(e.at) <= now && (opts.ignoreExpiry || now - Date.parse(e.at) < age);
  // Historic events may be old within the explicit history window, never future.
  if (!Array.isArray(c.history) || c.history.some(h => !h || !Number.isFinite(h.score) ||
      h.score < 0 || h.score > 100 || !inWindow(h.evidence))) return null;
  if ((c.evaluation != null && !currentEvidence(c.evaluation)) ||
      (c.lastCustomerResponse != null && !currentEvidence(c.lastCustomerResponse)) ||
      (c.pinzasEvidence != null && !currentEvidence(c.pinzasEvidence))) return null;
  if (c.commitment != null && (!currentEvidence(c.commitment.evidence) ||
      typeof c.commitment.completed !== 'boolean' || !Number.isFinite(Date.parse(c.commitment.dueAt)) ||
      Date.parse(c.commitment.dueAt) < Date.parse(c.commitment.evidence.at))) return null;
  if (c.nextStep != null && (!currentEvidence(c.nextStep.evidence) || !c.nextStep.text?.trim() ||
      (c.nextStep.dueAt != null && (!Number.isFinite(Date.parse(c.nextStep.dueAt)) ||
        Date.parse(c.nextStep.dueAt) < Date.parse(c.nextStep.evidence.at))))) return null;
  return c;
}
export function dealIntelligence(deal: DealDTO, now: number) {
  const p = deal.adobo?.properties;
  const scoreRaw = p ? numericValue(p.adobo_closing_score) : numericValue(deal.adoboScoreValue);
  const score = scoreRaw != null && scoreRaw >= 0 && scoreRaw <= 100 ? scoreRaw : null;
  const c = verifiedContext(deal, now);
  const history = (c?.history ?? []).filter(h => h.score >= 0 && h.score <= 100 && validEvidence(h.evidence))
    .sort((a,b) => Date.parse(a.evidence.at) - Date.parse(b.evidence.at));
  const last = history.at(-1), previous = history.at(-2);
  const contextDelta = last && previous && last.score === score && Date.parse(last.evidence.at) > Date.parse(previous.evidence.at)
    ? last.score - previous.score : null;
  // Fallback: HubSpot property history, only when the newest recorded version is itself the transition.
  const historyDelta = currentScoreDelta(deal, now);
  const delta = contextDelta ?? (score != null ? historyDelta : null);
  const metric = episodeResponseMetric(c?.followup, now);
  const noResponse = metric && metric.coverageStatus === 'complete' && !metric.pauseAgreed && metric.eligible > 0
    ? metric.responded === 0 : null;
  const overdue = c?.commitment && validEvidence(c.commitment.evidence) && Number.isFinite(Date.parse(c.commitment.dueAt))
    ? !c.commitment.completed && Date.parse(c.commitment.dueAt) < now : null;
  const pinzas = booleanValue(p?.seguimiento_con_pinzas);
  const insufficient = score == null || !c || !metric || metric.value == null;
  const verifiedDue = [c?.commitment && !c.commitment.completed ? c.commitment.dueAt : null, c?.nextStep?.dueAt ?? null]
    .filter((d): d is string => !!d && Number.isFinite(Date.parse(d))).sort()[0] ?? null;
  const action = pinzas === true || (delta != null && delta < 0) || noResponse === true || overdue === true;
  return { score, delta, verifiedDue, metric, noResponse, overdue, pinzas, insufficient, action, context: c,
    priority: (overdue === true ? 8 : 0) + (noResponse === true ? 4 : 0) + (delta != null && delta < 0 ? 2 : 0) + (pinzas === true ? 1 : 0) };
}
export function intelligenceDeals(deals: DealDTO[], scope: { owner: string; role: RoleFilter; stages: string[]; matchesType: (d: DealDTO) => boolean }, now: number) {
  return [...new Map(deals.filter(d => (scope.owner === 'team' || d.ownerId === scope.owner) &&
    (scope.role === 'all' || roleOfOwner(d.ownerId) === scope.role) &&
    (!scope.stages.length || scope.stages.includes(d.stage)) && scope.matchesType(d)).map(d => [d.id, d])).values()]
    .sort((a,b) => dealIntelligence(b, now).priority - dealIntelligence(a, now).priority || a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name));
}
/* ── Real producer: HubSpot property history (timestamped versions of this exact deal record). ── */
export const ADOBO_HISTORY_PROPS = ['adobo_closing_score', 'seguimiento_con_pinzas', 'adobo_score_driver_principal',
  'adobo_score_last_change_reason', 'adobo_icp_score', 'adobo_snapshot_confidence', 'adobo_current_urgencia',
  'adobo_current_timing', 'adobo_current_objecion', 'adobo_next_step_claro'] as const;
export type AdoboHistoryProp = typeof ADOBO_HISTORY_PROPS[number];
export const HISTORY_VERSION_CAP = 12;
export type PropertyVersion = { value: string | null; at: string; sourceType: string | null };
export type PropertyHistoryV1 = {
  version: 'hubspot-property-history/v1';
  dealId: string;
  /** Time the history was read; never an evaluation time. */
  fetchedAt: string;
  /** HubSpot record whose property history is the source of every version. */
  recordUrl: string;
  /** false when the batch read was partial or reported errors; never treat as complete. */
  complete?: boolean;
  /** Newest-first as returned by HubSpot; truncated when older versions were dropped. */
  properties: Partial<Record<AdoboHistoryProp, { versions: PropertyVersion[]; truncated: boolean;
    /** Undated/malformed versions were discarded: adjacency of retained versions is unprovable. */
    malformed?: boolean }>>;
};
export const safeHttpsUrl = (raw: unknown): raw is string => {
  if (typeof raw !== 'string') return false;
  try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
};
/** Accept history only when it is bound to this exact deal record and every version is dated in the past. */
export function validPropertyHistory(deal: DealDTO, now: number): PropertyHistoryV1 | null {
  const h = deal.adobo?.propertyHistory;
  if (!h || h.version !== 'hubspot-property-history/v1' || h.dealId !== deal.id || !Number.isFinite(now) ||
      !safeHttpsUrl(h.recordUrl) || h.recordUrl !== deal.url || !h.properties) return null;
  const fetched = Date.parse(h.fetchedAt);
  if (!Number.isFinite(fetched) || fetched > now) return null;
  for (const key of Object.keys(h.properties)) {
    const p = h.properties[key as AdoboHistoryProp];
    if (!(ADOBO_HISTORY_PROPS as readonly string[]).includes(key) || !p || !Array.isArray(p.versions) ||
        typeof p.truncated !== 'boolean' || (p.malformed !== undefined && typeof p.malformed !== 'boolean')) return null;
    let prev = Infinity;
    for (const v of p.versions) {
      const at = Date.parse(v?.at);
      if (!Number.isFinite(at) || at > fetched || at > prev) return null;
      prev = at;
    }
  }
  return h;
}
export type ScoreTransition = { from: number; to: number; at: string; sourceType: string | null; coChanged: AdoboHistoryProp[] };
export type PinzasTransition = { kind: 'entry' | 'exit'; at: string; sourceType: string | null; coChanged: AdoboHistoryProp[] };
export type Chronology = {
  status: 'missing' | 'unchanged' | 'changed' | 'inconsistent';
  partial: boolean; recordUrl: string | null; fetchedAt: string | null;
  firstRecordedScore: { score: number; at: string } | null;
  transitions: ScoreTransition[]; pinzas: PinzasTransition[]; pinzasStatus: 'missing' | 'available' | 'inconsistent';
};
type Parsed<T> = { at: string; sourceType: string | null; value: string | null; parsed: T | null; conflict: boolean };
/** Ascending versions; versions sharing a timestamp with different values are marked as conflicts. */
function parsedVersions<T>(versions: PropertyVersion[], parse: (v: string | null) => T | null): Parsed<T>[] {
  const asc = [...versions].reverse().map(v => ({ at: v.at, sourceType: v.sourceType, value: v.value, parsed: parse(v.value), conflict: false }));
  for (let i = 0; i < asc.length; i++) for (let j = 0; j < asc.length; j++)
    if (i !== j && Date.parse(asc[i]!.at) === Date.parse(asc[j]!.at) && asc[i]!.value !== asc[j]!.value) asc[i]!.conflict = true;
  return asc;
}
/** Transitions only between directly adjacent, valid, non-conflicting versions; unknown values break adjacency. */
function adjacent<T>(list: Parsed<T>[]): [Parsed<T>, Parsed<T>][] {
  const out: [Parsed<T>, Parsed<T>][] = [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1]!, b = list[i]!;
    if (a.parsed == null || b.parsed == null || a.conflict || b.conflict || Date.parse(a.at) === Date.parse(b.at)) continue;
    if (a.parsed !== b.parsed) out.push([a, b]);
  }
  return out;
}
const scoreValue = (v: string | null) => { const n = numericValue(v); return n != null && n >= 0 && n <= 100 ? n : null; };
/** Transitions come only from recorded versions; consecutive snapshots are never compared. */
export function evidenceChronology(deal: DealDTO, now: number): Chronology {
  const empty: Chronology = { status: 'missing', partial: false, recordUrl: null, fetchedAt: null, firstRecordedScore: null, transitions: [], pinzas: [], pinzasStatus: 'missing' };
  const h = validPropertyHistory(deal, now);
  if (!h) return empty;
  const coChanged = (at: string, self: AdoboHistoryProp) => ADOBO_HISTORY_PROPS.filter(k => k !== self &&
    (h.properties[k]?.versions ?? []).some(v => Date.parse(v.at) === Date.parse(at)));
  const score = parsedVersions(h.properties.adobo_closing_score?.versions ?? [], scoreValue);
  const pz = parsedVersions(h.properties.seguimiento_con_pinzas?.versions ?? [], booleanValue);
  const gaps = (l: Parsed<unknown>[]) => l.some(v => v.parsed == null || v.conflict);
  const partial = h.complete === false ||
    ADOBO_HISTORY_PROPS.some(k => h.properties[k]?.truncated || h.properties[k]?.malformed) || gaps(score) || gaps(pz);
  const transitions = adjacent(score).map(([a, b]) => ({ from: a.parsed!, to: b.parsed!, at: b.at, sourceType: b.sourceType, coChanged: coChanged(b.at, 'adobo_closing_score') }));
  const pinzasT = adjacent(pz).map(([, b]) => ({ kind: b.parsed ? 'entry' as const : 'exit' as const, at: b.at, sourceType: b.sourceType, coChanged: coChanged(b.at, 'seguimiento_con_pinzas') }));
  // Consistency uses the actual latest version, not the latest surviving valid one.
  const latestScore = score.at(-1), latestPz = pz.at(-1);
  const currentPz = booleanValue(deal.adobo?.properties?.seguimiento_con_pinzas ?? null);
  const pinzasOk = !h.properties.seguimiento_con_pinzas?.malformed && !!latestPz && !latestPz.conflict && latestPz.parsed != null && latestPz.parsed === currentPz;
  const pinzasStatus = !latestPz ? 'missing' as const : pinzasOk ? 'available' as const : 'inconsistent' as const;
  const firstValid = score.find(v => v.parsed != null && !v.conflict);
  const base = { partial, recordUrl: h.recordUrl, fetchedAt: h.fetchedAt,
    firstRecordedScore: firstValid ? { score: firstValid.parsed!, at: firstValid.at } : null,
    transitions, pinzas: pinzasOk ? pinzasT : [], pinzasStatus };
  if (!latestScore) return { ...empty, ...base, transitions: [], status: 'missing' };
  const current = scoreValue(deal.adobo?.properties?.adobo_closing_score ?? null);
  if (h.properties.adobo_closing_score?.malformed || latestScore.conflict || latestScore.parsed == null || current == null || latestScore.parsed !== current)
    return { ...base, transitions: [], status: 'inconsistent' };
  return { ...base, transitions, status: transitions.length ? 'changed' : 'unchanged' };
}
/** Delta claimable as "current": only when the newest recorded version is itself a valid adjacent transition. */
export function currentScoreDelta(deal: DealDTO, now: number): number | null {
  const c = evidenceChronology(deal, now);
  if (c.status !== 'changed') return null;
  const h = validPropertyHistory(deal, now)!;
  const latestAt = h.properties.adobo_closing_score?.versions[0]?.at;
  const last = c.transitions.at(-1);
  return last && latestAt && Date.parse(last.at) === Date.parse(latestAt) ? last.to - last.from : null;
}

/* ── Source coverage / freshness beside the score. ── */
export type SourceState = 'covered' | 'partial' | 'missing' | 'expired';
export type FreshnessReport = {
  readAt: string; readAgeMs: number;
  evaluation: { at: string; ageMs: number; expiresAt: string; state: 'current' | 'expired' } | null;
  sources: { key: string; label: string; state: SourceState; note: string }[];
  status: 'evaluation-current' | 'recalculation-needed' | 'not-verifiable';
};
export function freshnessReport(deal: DealDTO, readAt: string, now: number): FreshnessReport {
  const read = Date.parse(readAt);
  const raw = deal.adobo?.verifiedContext;
  const t = raw?.temporal;
  let evaluation: FreshnessReport['evaluation'] = null;
  // Full structural/temporal validation; only the producer TTL is ignored to label an evaluation as expired.
  const structural = verifiedContext(deal, now, { ignoreExpiry: true });
  if (structural?.evaluation && t) {
    const at = Date.parse(structural.evaluation.at), maxAge = t.validity.maxAgeMs;
    const current = verifiedContext(deal, now)?.evaluation != null;
    evaluation = { at: structural.evaluation.at, ageMs: now - at, expiresAt: new Date(Math.min(at, Date.parse(t.observedAt)) + maxAge).toISOString(),
      state: current ? 'current' : 'expired' };
  }
  const chron = evidenceChronology(deal, now);
  const metric = episodeResponseMetric(verifiedContext(deal, now)?.followup, now);
  const sources: FreshnessReport['sources'] = [
    { key: 'crm', label: 'Propiedades CRM (foto)', state: deal.adobo?.properties ? 'covered' : 'missing', note: 'Lectura del reporte; no es evaluación.' },
    { key: 'history', label: 'Historial de propiedades', state: chron.status === 'missing' ? 'missing' : chron.partial || chron.status === 'inconsistent' || chron.pinzasStatus === 'inconsistent' ? 'partial' : 'covered',
      note: chron.status === 'missing' ? 'Sin historial verificable.' : chron.status === 'inconsistent' || chron.pinzasStatus === 'inconsistent' ? 'Historial inconsistente o con versiones descartadas.' : chron.partial ? 'Historial parcial.' : 'Versiones de HubSpot.' },
    { key: 'evaluation', label: 'Evaluación Adobo', state: evaluation ? (evaluation.state === 'current' ? 'covered' : 'expired') : 'missing', note: evaluation ? 'Vigencia del productor.' : 'Pendiente de integración en esta app.' },
    { key: 'episodes', label: 'Episodios de seguimiento', state: metric ? (metric.coverageStatus === 'complete' ? 'covered' : 'partial') : 'missing', note: metric ? `Cobertura ${metric.coverage.covered}/${metric.coverage.total}.` : 'Pendiente de integración.' },
    { key: 'diio', label: 'Reuniones Diio', state: 'missing', note: 'Pendiente de integración en esta app.' },
    { key: 'email', label: 'Correo / respuestas', state: 'missing', note: 'Pendiente de integración en esta app.' },
  ];
  return { readAt, readAgeMs: Number.isFinite(read) ? Math.max(0, now - read) : NaN, evaluation, sources,
    status: evaluation?.state === 'current' ? 'evaluation-current' : evaluation?.state === 'expired' ? 'recalculation-needed' : 'not-verifiable' };
}
