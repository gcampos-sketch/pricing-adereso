import type { DealDTO } from './pulse-types';
import { dealIntelligence, evidenceChronology, safeHttpsUrl } from './adobo-intelligence';

/** Personal, browser-local review workflow. Never mutates CRM, score or Pinzas and never contacts anyone. */
export type WorkflowState = 'pending' | 'reviewed' | 'waiting' | 'resolved';
export type WorkflowEvent = { state: WorkflowState; at: string; actor: string; fingerprint: string;
  note?: string; url?: string; reviewAt?: string };
export type WorkflowStore = { version: 'adobo-workflow/v1'; records: Record<string, WorkflowEvent[]> };
export const emptyStore = (): WorkflowStore => ({ version: 'adobo-workflow/v1', records: {} });

export type AlertKind = 'pinzas' | 'scoreDrop' | 'overdue' | 'noResponse' | 'insufficient';
export function alertKinds(deal: DealDTO, now: number): AlertKind[] {
  const s = dealIntelligence(deal, now);
  const k: AlertKind[] = [];
  if (s.overdue === true) k.push('overdue');
  if (s.noResponse === true) k.push('noResponse');
  if (s.delta != null && s.delta < 0) k.push('scoreDrop');
  if (s.pinzas === true) k.push('pinzas');
  if (s.insufficient) k.push('insufficient');
  return k;
}
/**
 * Binds a review to the exact alert, owner and evidence identities (IDs, dates, URLs).
 * Read/fetch times are excluded so a re-read alone never reopens an alert.
 */
export function alertFingerprint(deal: DealDTO, now: number): string {
  const s = dealIntelligence(deal, now), c = s.context, ch = evidenceChronology(deal, now);
  const ev = (e: { url: string; at: string } | null | undefined) => e ? [e.url, e.at] : null;
  return JSON.stringify({ v: 2, id: deal.id, owner: deal.ownerId, kinds: alertKinds(deal, now), score: s.score, delta: s.delta,
    scoreT: ch.transitions.map(t => [t.at, t.from, t.to]), pinzasT: ch.pinzas.map(t => [t.at, t.kind]), pinzas: s.pinzas,
    recordUrl: ch.recordUrl,
    commitment: c?.commitment ? [c.commitment.dueAt, c.commitment.completed, ev(c.commitment.evidence)] : null,
    pinzasEvidence: ev(c?.pinzasEvidence), lastResponse: ev(c?.lastCustomerResponse),
    episodes: s.metric && c?.followup ? [...c.followup.episodes].sort((a, b) => a.id.localeCompare(b.id))
      .map(e => [e.id, e.state, ev(e.evidence), ev(e.response), e.dueAt ?? null]) : null,
    window: s.metric ? [s.metric.window.start, s.metric.window.end] : null });
}
export type Effective = { state: WorkflowState; reopened: boolean; resurfaced: boolean; last: WorkflowEvent | null };
export function effectiveState(events: WorkflowEvent[] | undefined, fingerprint: string, now: number): Effective {
  const last = events?.at(-1) ?? null;
  if (!last) return { state: 'pending', reopened: false, resurfaced: false, last };
  if (last.fingerprint !== fingerprint) return { state: 'pending', reopened: last.state !== 'pending', resurfaced: false, last };
  if (last.state === 'waiting' && !(Date.parse(last.reviewAt ?? '') > now))
    return { state: 'pending', reopened: false, resurfaced: true, last };
  return { state: last.state, reopened: false, resurfaced: false, last };
}
export type TransitionInput = { state: WorkflowState; note?: string; url?: string; reviewAt?: string };
export const MIN_RESOLUTION_NOTE = 12;
const STATES: WorkflowState[] = ['pending', 'reviewed', 'waiting', 'resolved'];
const usefulNote = (note: string | undefined) => !!note && note.length >= MIN_RESOLUTION_NOTE && /[a-záéíóúñ0-9]{3,}/i.test(note);
/** Same rules for new transitions and persisted events. `createdAt` is the event time; reviewAt is checked against it. */
export function eventError(e: unknown, now: number): string | null {
  if (!e || typeof e !== 'object') return 'Evento inválido.';
  const ev = e as Record<string, unknown>;
  if (!STATES.includes(ev['state'] as WorkflowState)) return 'Estado inválido.';
  if (typeof ev['actor'] !== 'string' || !ev['actor'].trim()) return 'Se requiere una cuenta identificada.';
  if (typeof ev['fingerprint'] !== 'string' || !ev['fingerprint'].trim()) return 'Falta la huella de la alerta.';
  const at = typeof ev['at'] === 'string' ? Date.parse(ev['at']) : NaN;
  if (!Number.isFinite(at) || at > now) return 'Fecha del evento inválida.';
  for (const k of ['note', 'url', 'reviewAt']) if (ev[k] !== undefined && typeof ev[k] !== 'string') return 'Campo inválido.';
  const note = ev['note'] as string | undefined, url = ev['url'] as string | undefined, reviewAt = ev['reviewAt'] as string | undefined;
  if (url !== undefined && !safeHttpsUrl(url)) return 'El enlace debe ser una URL https válida.';
  if (ev['state'] === 'waiting') {
    const due = Date.parse(reviewAt ?? '');
    if (!Number.isFinite(due) || due <= at) return 'Esperando cliente requiere una fecha de revisión futura.';
  } else if (reviewAt !== undefined) return 'Fecha de revisión solo aplica a Esperando cliente.';
  if (ev['state'] === 'resolved' && !usefulNote(note?.trim())) return `Resolver requiere evidencia útil (mínimo ${MIN_RESOLUTION_NOTE} caracteres).`;
  return null;
}
export function applyTransition(store: WorkflowStore, dealId: string, input: TransitionInput,
  ctx: { actor: string | null; now: number; fingerprint: string }): { ok: true; store: WorkflowStore } | { ok: false; error: string } {
  if (!Number.isFinite(ctx.now)) return { ok: false, error: 'Hora inválida.' };
  const note = input.note?.trim() || undefined, url = input.url?.trim() || undefined;
  const due = Date.parse(input.reviewAt ?? '');
  const ev: WorkflowEvent = { state: input.state, at: new Date(ctx.now).toISOString(), actor: (ctx.actor ?? '').trim(), fingerprint: ctx.fingerprint };
  if (input.state === 'waiting') ev.reviewAt = Number.isFinite(due) ? new Date(due).toISOString() : '';
  if (note) ev.note = note;
  if (url) ev.url = url;
  const error = eventError(ev, ctx.now);
  if (error) return { ok: false, error };
  const events = [...(store.records[dealId] ?? []), ev];
  return { ok: true, store: { ...store, records: { ...store.records, [dealId]: events } } };
}
/** Any invalid persisted event discards that deal's whole record (fail open to "pending", never hidden). */
export function parseStore(raw: string | null, now: number): WorkflowStore {
  try {
    const s = JSON.parse(raw ?? '');
    if (s?.version !== 'adobo-workflow/v1' || typeof s.records !== 'object' || !s.records || Array.isArray(s.records)) return emptyStore();
    const records: WorkflowStore['records'] = {};
    for (const [id, evs] of Object.entries(s.records)) {
      if (!Array.isArray(evs) || !evs.length || evs.some(e => eventError(e, now))) continue;
      records[id] = evs as WorkflowEvent[];
    }
    return { version: 'adobo-workflow/v1', records };
  } catch { return emptyStore(); }
}
export const storeKey = (actor: string) => `adobo-workflow:v1:${actor.toLowerCase()}`;

export const SUGGESTIONS: Record<AlertKind, string> = {
  overdue: 'Revisar el compromiso vencido con el cliente y registrar la nueva fecha acordada en el CRM.',
  noResponse: 'Probar otro canal o contacto con el decisor antes de nuevos envíos.',
  scoreDrop: 'Revisar la razón del cambio y las variables que cambiaron junto al score.',
  pinzas: 'Validar con el owner el plan de seguimiento del deal.',
  insufficient: 'Completar la evidencia faltante antes de priorizar este deal.',
};
export const REASONS: Record<AlertKind, string> = {
  overdue: 'Compromiso vencido verificado', noResponse: 'Sin respuesta confirmada en la ventana',
  scoreDrop: 'El score cayó según historial registrado', pinzas: 'Pinzas registrado en CRM', insufficient: 'Evidencia insuficiente',
};
