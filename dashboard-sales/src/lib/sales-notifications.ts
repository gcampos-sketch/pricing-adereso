import { roleOfOwner, type RoleFilter } from './owner-roles';
import { safeHttpsUrl } from './adobo-intelligence';

/** Consumption of SALES-89 producer output, NOT a second SALES-76 detector. */
export const RISK_PROPERTIES = ['adobo_alertas_riesgo', 'adobo_alertas_estado', 'adobo_alertas_evidencia', 'adobo_alertas_ultima_revision'] as const;
export const RISK_LABELS: Record<string, string> = {
  sin_contacto_comercial: 'Sin contacto comercial reciente', intentos_sin_respuesta: 'Intentos reiterados sin respuesta',
  respuesta_cliente_demorada: 'Respuesta del cliente demorada', reuniones_sin_avance: 'Reuniones sin avance de decisión',
};
export const SYNC_INTERVAL_MS = 120_000;
export type RiskRecord = { id: string; ownerId: string; owner: string; name: string; stage: string; segment: string;
  inScope: boolean; state: string; risks: string[]; evidence: string; reviewedAt: string | null;
  score: number | null; probability: number | null; money: { value: number; currency: string; unit: string }[] };
export type Attestation = { version: 'adobo-alert-evidence/v1'; portalId: string; dealId: string; ownerId: string;
  cycleId: string; evidenceVersion: string; coverage: 'complete'; state: string; risks: string[];
  observedAt: string; validity: { version: 'producer-validity/v1'; maxAgeMs: number }; pauseAgreed: boolean;
  sources: { id: string; url: string; at: string; summary: string }[] };
export type Notice = { key: string; record: RiskRecord; firstObserved: string; lastObserved: string;
  cycle: number; status: 'nueva' | 'continúa'; fingerprint: string; verified: boolean; blocked: string | null };
export type Archive = { notice: Notice; at: string; reason: string; evidence: string };
export type Repository = { version: 'sales-notifications/v1'; account: string; ownerId: string;
  active: Notice[]; history: Archive[]; syncedAt: string | null; complete: boolean; error: string | null;
  records: RiskRecord[] };
export const emptyRepository = (account: string, ownerId: string): Repository => ({ version: 'sales-notifications/v1', account, ownerId,
  active: [], history: [], syncedAt: null, complete: false, error: null, records: [] });
export function attestation(r: RiskRecord, now: number): Attestation | null {
  let e: Attestation;
  try { e = JSON.parse(r.evidence); } catch { return null; }
  if (!e || e.version !== 'adobo-alert-evidence/v1' || e.portalId !== '23480943' || e.dealId !== r.id || e.ownerId !== r.ownerId ||
      !e.cycleId?.trim() || !e.evidenceVersion?.trim() || e.coverage !== 'complete' || e.state !== r.state ||
      !Array.isArray(e.risks) || JSON.stringify([...new Set(e.risks)].sort()) !== JSON.stringify([...new Set(r.risks)].sort()) ||
      e.validity?.version !== 'producer-validity/v1' || !Number.isSafeInteger(e.validity.maxAgeMs) || e.validity.maxAgeMs <= 0 ||
      typeof e.pauseAgreed !== 'boolean' || !Array.isArray(e.sources) || !e.sources.length) return null;
  const at = Date.parse(e.observedAt), review = Date.parse(r.reviewedAt ?? '');
  if (!Number.isFinite(now) || !Number.isFinite(at) || !Number.isFinite(review) || at > review || review > now || now - at >= e.validity.maxAgeMs) return null;
  if (e.sources.some(s => !s || !s.id?.trim() || !s.summary?.trim() || !safeHttpsUrl(s.url) || !Number.isFinite(Date.parse(s.at)) ||
      Date.parse(s.at) > at || now - Date.parse(s.at) >= e.validity.maxAgeMs)) return null;
  if (r.state === 'alertas_activas' && (e.pauseAgreed || !r.risks.length || r.risks.some(k => !RISK_LABELS[k]))) return null;
  if (r.state === 'pausa_acordada' && !e.pauseAgreed) return null;
  if (r.state === 'sin_riesgo_verificado' && r.risks.length) return null;
  return e;
}
export function crmUrl(id: string) {
  return `https://app.hubspot.com/contacts/23480943/deal/${encodeURIComponent(id)}?utm_source=dashboard_sales&utm_medium=notification&utm_campaign=sales97`;
}
export function corroboratedOwner(email: string, owners: { id: string; email?: string; archived?: boolean }[]): string | null {
  const matches = owners.filter(o => !o.archived && o.email?.trim().toLowerCase() === email.trim().toLowerCase());
  return matches.length === 1 && roleOfOwner(matches[0]?.id ?? '') ? matches[0]?.id ?? null : null;
}
const fingerprint = (r: RiskRecord) => JSON.stringify([r.ownerId, r.state, [...r.risks].sort(), r.evidence, r.reviewedAt]);
/** Complete reads alone may retire; each retirement also needs a newer, exact producer attestation. */
export function reconcile(previous: Repository, input: { account: string; ownerId: string; records: RiskRecord[]; complete: boolean; error: string | null; at: string }, now: number): Repository {
  const p = previous.account === input.account && previous.ownerId === input.ownerId ? previous : emptyRepository(input.account, input.ownerId);
  if (!Number.isFinite(Date.parse(input.at)) || (p.syncedAt && Date.parse(input.at) < Date.parse(p.syncedAt))) return p;
  const records = [...new Map(input.records.map(r => [r.id, r])).values()];
  const active = new Map(p.active.map(n => [n.record.id, n]));
  const history = [...p.history];
  for (const r of records) {
    const old = active.get(r.id);
    // A corroborated handoff revokes access; do not preserve the previous owner's evidence in history.
    if (r.ownerId !== input.ownerId) { active.delete(r.id); continue; }
    const proof = attestation(r, now);
    const review = Date.parse(r.reviewedAt ?? '');
    const oldReview = Date.parse(old?.record.reviewedAt ?? '');
    if (old && Number.isFinite(oldReview) && (!Number.isFinite(review) || review < oldReview)) continue;
    if (r.inScope && r.state === 'alertas_activas' && r.risks.length) {
      const fp = fingerprint(r);
      const cycles = history.filter(h => h.notice.record.id === r.id).length;
      const changed = !!old && old.fingerprint !== fp;
      if (changed) history.push({ notice: old, at: input.at, reason: 'Evidencia actualizada', evidence: r.evidence });
      active.set(r.id, { key: `23480943:${r.id}:${proof?.cycleId ?? old?.cycle ?? cycles + 1}`, record: r,
        firstObserved: old?.firstObserved ?? input.at, lastObserved: input.at, cycle: old?.cycle ?? cycles + 1,
        status: old ? 'continúa' : 'nueva', fingerprint: fp, verified: !!proof,
        blocked: proof ? null : 'Evidencia registrada sin contrato temporal/cobertura verificable; vigencia no confirmada.' });
    } else if (old && input.complete && proof && Number.isFinite(review) && review > oldReview &&
        ['sin_riesgo_verificado', 'pausa_acordada'].includes(r.state)) {
      active.delete(r.id);
      history.push({ notice: old, at: input.at, reason: r.state === 'pausa_acordada' ? 'Pausa corroborada' : 'Resuelta con evidencia', evidence: r.evidence });
    } else if (old) active.set(r.id, { ...old, blocked: 'Última alerta conocida; reevaluación completa y vigente no corroborada.' });
  }
  // Missing records and failed/partial reads NEVER resolve an alert.
  const owned = records.filter(r => r.ownerId === input.ownerId);
  const retainedRecords = input.complete ? owned : [...new Map([...p.records, ...owned].map(r => [r.id,r])).values()];
  const revoked = new Set(records.filter(r => r.ownerId !== input.ownerId).map(r => r.id));
  return { ...p, active: [...active.values()].filter(n => !revoked.has(n.record.id)), history: history.filter(h => !revoked.has(h.notice.record.id)),
    records: retainedRecords.filter(r => !revoked.has(r.id)), syncedAt: input.complete ? input.at : p.syncedAt,
    complete: input.complete, error: input.error };
}
export type NoticeScope = { owner: string; role: RoleFilter; type: string; stages: string[] };
export function visibleNotices(repo: Repository, scope: NoticeScope) {
  return repo.active.filter(n => n.record.ownerId === repo.ownerId && (scope.owner === 'team' || scope.owner === n.record.ownerId) &&
    (scope.role === 'all' || roleOfOwner(n.record.ownerId) === scope.role) && (scope.type === 'all' || n.record.segment === scope.type) &&
    (!scope.stages.length || scope.stages.includes(n.record.stage))).sort((a,b) => a.record.name.localeCompare(b.record.name));
}
export const suggestion = (n: Notice) => n.verified ? 'Revisar la evidencia vigente y acordar el siguiente paso con el responsable.' : 'Corroborar evidencia, cobertura y pausa antes de decidir.';
export function santiago(iso: string | null) {
  return iso && Number.isFinite(Date.parse(iso)) ? new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : 'sin dato';
}
export function copyNotices(repo: Repository, scope: NoticeScope, now: number) {
  const all = visibleNotices(repo, scope);
  const complete = repo.complete && !repo.error && all.every(n => n.verified && !!attestation(n.record, now) && !n.blocked);
  const text = ['Dashboard Sales · revisión para Codex', `Alcance autorizado: owner ${repo.ownerId || 'sin correspondencia'} · filtro ${scope.owner} · rol ${scope.role} · tipo ${scope.type} · etapas ${scope.stages.join(', ') || 'todas'} · sin filtro Q`,
    `Corte de lectura: ${santiago(repo.syncedAt)} America/Santiago · ${all.length} negocios`,
    complete ? 'Conjunto completo; evidencia corroborada al corte.' : 'PARCIAL / VIGENCIA NO CONFIRMADA: último conjunto conocido; no acredita copia completa vigente.',
    'Solo revisión y sugerencias. Copiar NO autoriza a enviar mensajes, crear notas ni modificar CRM.',
    ...all.map(n => { const r = n.record, e = attestation(r, now); return [`\n${r.name} · ID ${r.id} · owner ${r.owner} (${r.ownerId})`, crmUrl(r.id),
      `Motivo registrado: ${r.risks.map(k => RISK_LABELS[k] ?? k).join('; ')} · estado ${n.status} / ${r.state}`,
      `Evidencia: ${e ? e.sources.map(s => `${s.summary} [${s.id}] ${s.at} ${s.url}`).join('; ') : r.evidence || 'sin dato'}`,
      `Última revisión del productor: ${santiago(r.reviewedAt)} America/Santiago`,
      `Monto: ${r.money.length ? r.money.map(m => `${m.value} ${m.currency} ${m.unit}`).join('; ') : 'sin dato verificado'}`,
      `Sugerencia (no compromiso): ${suggestion(n)} · responsable/fecha comprometida: por definir`,
      `Bloqueo: ${n.blocked ?? (e ? 'ninguno para revisión; ejecución no habilitada' : 'vigencia de fuente no corroborada')}`].join('\n'); })].join('\n');
  return { text, complete, count: all.length };
}
export async function writeClipboard(text: string, clipboard?: { writeText: (text: string) => Promise<void> }) {
  if (!clipboard) return false;
  try { await clipboard.writeText(text); return true; } catch { return false; }
}
export type TaskState = 'syncing' | 'clear' | 'unknown' | 'error';
/** One conservative status per read: a clear day is claimed only from a complete, corroborated read. */
export function taskState(repo: Repository, scope: NoticeScope, now: number, busy = false): { state: TaskState; note: string | null; uncertain: number } {
  const all = visibleNotices(repo, scope);
  const uncertain = repo.records.filter(r => r.inScope && !attestation(r, now)).length;
  if (repo.error) return { state: 'error', note: 'No pudimos actualizar. Revisa tu acceso.', uncertain };
  if (!repo.syncedAt && busy) return { state: 'syncing', note: null, uncertain };
  if (!repo.complete || uncertain > 0 || all.some(n => !attestation(n.record, now))) return { state: 'unknown', note: 'Falta corroborar la fuente; el conteo puede estar incompleto.', uncertain };
  return { state: 'clear', note: null, uncertain };
}