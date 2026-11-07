import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { DealDTO } from '@/lib/pulse-types';
import { ADOBO_GROUPS, crmFractionPercent, dealIntelligence, evidenceChronology, freshnessReport, validEvidence, type AdoboProperty } from '@/lib/adobo-intelligence';
import { adoboSortCompare, type AdoboSortKey } from '@/lib/adobo-period';
import { REASONS, SUGGESTIONS, alertFingerprint, alertKinds, applyTransition, effectiveState, emptyStore, parseStore, storeKey,
  type AlertKind, type TransitionInput, type WorkflowState, type WorkflowStore } from '@/lib/adobo-workflow';
import { useRefreshMenu } from '@/contexts/RefreshContext';
import { useAccountEmail } from '@/components/AuthGate';

const date = (raw?: string | null) => raw && Number.isFinite(Date.parse(raw))
  ? new Date(raw).toLocaleString('es-CL') : 'sin dato';
const text = (raw?: string | null) => raw?.trim() || 'sin dato';
const percent = (value: number | null) => value == null ? 'pendiente de integración' : `${Number(value.toFixed(2))}%`;
const age = (ms: number) => !Number.isFinite(ms) ? 'sin dato' : ms < 60_000 ? 'hace menos de 1 min'
  : ms < 3_600_000 ? `hace ${Math.floor(ms / 60_000)} min` : ms < 86_400_000 ? `hace ${Math.floor(ms / 3_600_000)} h` : `hace ${Math.floor(ms / 86_400_000)} d`;

/** Live clock so expiry/review logic is never frozen at report generation time. */
export function useLiveNow(initial: number, intervalMs = 30_000) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function intelligenceSummary(deals: DealDTO[], now: number) {
  const signals = deals.map(d => dealIntelligence(d, now));
  const count = (key: 'action' | 'insufficient') => signals.filter(s => s[key]).length;
  const knownCount = (values: (boolean | null)[]) => values.some(v => v != null) ? String(values.filter(v => v === true).length) : 'sin dato';
  return `Requiere acción: ${count('action')} · Score cayó: ${knownCount(signals.map(s => s.delta == null ? null : s.delta < 0))} · Sin respuesta confirmada: ${knownCount(signals.map(s => s.noResponse))} · Compromiso vencido: ${knownCount(signals.map(s => s.overdue))} · Datos insuficientes: ${count('insufficient')}`;
}

const STATE_LABEL: Record<WorkflowState, string> = { pending: 'Pendiente', reviewed: 'Revisado', waiting: 'Esperando cliente', resolved: 'Resuelto' };
const FILTERS: { key: AlertKind; label: string }[] = [
  { key: 'pinzas', label: 'Pinzas' }, { key: 'scoreDrop', label: 'Score cayó' }, { key: 'overdue', label: 'Compromiso vencido' },
  { key: 'noResponse', label: 'Sin respuesta' }, { key: 'insufficient', label: 'Evidencia insuficiente' },
];

function useWorkflow(actor: string | null) {
  const [store, setStore] = useState<WorkflowStore>(emptyStore);
  const [storageError, setStorageError] = useState<string | null>(null);
  useEffect(() => {
    // Reset on account loss/change so another account's state never leaks.
    setStore(emptyStore()); setStorageError(null);
    if (!actor) return;
    try { setStore(parseStore(localStorage.getItem(storeKey(actor)), Date.now())); }
    catch { setStorageError('No se pudo leer el estado guardado en este navegador.'); }
  }, [actor]);
  const save = (next: WorkflowStore): boolean => {
    if (!actor) { setStorageError('Sin cuenta identificada: no se guardó.'); return false; }
    try { localStorage.setItem(storeKey(actor), JSON.stringify(next)); }
    catch { setStorageError('No se pudo guardar en este navegador; el cambio no quedó registrado.'); return false; }
    setStorageError(null); setStore(next); return true;
  };
  return [store, save, storageError] as const;
}

function PropertyAudit({ deal }: { deal: DealDTO }) {
  const p = deal.adobo?.properties;
  function value(key: AdoboProperty) {
    const raw = p?.[key];
    if (raw == null || raw.trim() === '') return p ? 'sin dato' : 'pendiente de integración';
    if (key === 'hs_deal_stage_probability' || key === 'hs_forecast_probability') return percent(crmFractionPercent(raw));
    return raw;
  }
  return <div className="adobo-audit">
    {ADOBO_GROUPS.map(group => <details key={group.name} className="adobo-audit-group">
      <summary>{group.name}</summary>
      <p className="text-muted-foreground text-sm">{group.explanation}</p>
      <dl>{group.fields.map(([key, label, explanation]) => <div key={key} className="adobo-audit-field">
        <dt>{label}<code>{key}</code></dt>
        <dd><strong>{value(key)}</strong><span>{explanation}</span>
          {p?.[key]?.trim() ? <a href={deal.url} target="_blank" rel="noopener noreferrer">Fuente: propiedad CRM ↗</a> : null}
        </dd>
      </div>)}</dl>
    </details>)}
  </div>;
}

function Chronology({ deal, now }: { deal: DealDTO; now: number }) {
  const c = evidenceChronology(deal, now);
  return <details className="adobo-audit-group">
    <summary>Cronología de evidencia</summary>
    <p className="text-muted-foreground text-sm">Eventos históricos registrados en HubSpot; su validez histórica es independiente de la vigencia actual. Nunca se infiere un cambio comparando fotos.</p>
    {c.status === 'missing' ? <p className="adobo-intel-method">Historial: sin dato verificable para este deal.</p> : <>
      {c.status === 'inconsistent' ? <p className="text-warning text-sm">El último valor registrado no coincide con la foto actual: no se muestra variación.</p> : null}
      {c.partial ? <p className="adobo-intel-method">Historial parcial: versiones recortadas, inválidas, en conflicto o lectura incompleta.</p> : null}
      {c.firstRecordedScore ? <p className="adobo-intel-method">Primer valor disponible en el historial leído: {c.firstRecordedScore.score} ({date(c.firstRecordedScore.at)}) · no implica que sea el primer evento.</p> : null}
      <ol className="adobo-chrono">
        {c.status !== 'inconsistent' && c.transitions.map(t => <li key={`s${t.at}`}>
          <strong>{t.from} → {t.to}</strong> · {date(t.at)} · origen {t.sourceType ?? 'sin dato'}
          <small>Variables registradas en la misma actualización: {t.coChanged.length ? t.coChanged.join(', ') : 'ninguna registrada'}</small>
        </li>)}
        {c.status === 'unchanged' ? <li>Sin cambios de score en el historial leído.</li> : null}
        {c.pinzas.map(p => <li key={`p${p.at}`}><strong>Pinzas: {p.kind === 'entry' ? 'entrada' : 'salida'}</strong> · {date(p.at)} · origen {p.sourceType ?? 'sin dato'}
          <small>Motivo: sin dato verificable · cambios simultáneos: {p.coChanged.length ? p.coChanged.join(', ') : 'ninguno'}</small></li>)}
        {c.pinzasStatus === 'missing' ? <li>Pinzas: sin historial verificable.</li> : c.pinzasStatus === 'inconsistent' ? <li className="text-warning">Pinzas: el último registro no coincide con el valor actual o es inválido; no se muestran transiciones.</li> : !c.pinzas.length ? <li>Pinzas: sin entradas ni salidas en el historial leído.</li> : null}
      </ol>
      {c.recordUrl ? <a href={c.recordUrl} target="_blank" rel="noopener noreferrer">Fuente: historial de propiedades del registro en HubSpot ↗</a> : null}
    </>}
  </details>;
}

function Freshness({ deal, readAt, now }: { deal: DealDTO; readAt: string; now: number }) {
  const f = freshnessReport(deal, readAt, now);
  return <div className="adobo-fresh" aria-label="Vigencia y cobertura de fuentes">
    <span>Última evaluación real: {f.evaluation ? `${date(f.evaluation.at)} · ${age(f.evaluation.ageMs)}` : 'sin dato'}</span>
    <span className={f.status === 'recalculation-needed' ? 'text-danger' : undefined}>
      {f.status === 'evaluation-current' ? `Evaluación vigente hasta ${date(f.evaluation?.expiresAt)}`
        : f.status === 'recalculation-needed' ? 'Requiere recálculo: evaluación fuera de vigencia'
        : 'Recálculo: no verificable sin evaluación fechada'}</span>
    <ul>{f.sources.map(s => <li key={s.key} data-state={s.state} title={s.note}>
      {s.label}: {s.state === 'covered' ? 'cubierta' : s.state === 'partial' ? 'parcial' : s.state === 'expired' ? 'vencida' : 'faltante'}</li>)}</ul>
  </div>;
}

function WorkflowControls({ deal, now, store, save, actor }: { deal: DealDTO; now: number; store: WorkflowStore; save: (s: WorkflowStore) => boolean; actor: string | null }) {
  const fingerprint = alertFingerprint(deal, now);
  const events = store.records[deal.id];
  const eff = effectiveState(events, fingerprint, now);
  const [mode, setMode] = useState<null | 'waiting' | 'resolved'>(null);
  const [note, setNote] = useState(''), [url, setUrl] = useState(''), [reviewAt, setReviewAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apply = (input: TransitionInput) => {
    const r = applyTransition(store, deal.id, input, { actor, now: Date.now(), fingerprint });
    if (!r.ok) { setError(r.error); return; }
    if (!save(r.store)) { setError('No se pudo guardar en este navegador.'); return; }
    setError(null); setMode(null); setNote(''); setUrl(''); setReviewAt('');
  };
  return <div className="adobo-workflow">
    <div className="adobo-workflow-row">
      <span data-state={eff.state}>Estado personal: <strong>{STATE_LABEL[eff.state]}</strong>
        {eff.reopened ? ' · reabierto por nueva evidencia' : ''}{eff.resurfaced ? ' · fecha de revisión cumplida' : ''}
        {eff.last ? <small> · último: {STATE_LABEL[eff.last.state]} por {eff.last.actor}, {date(eff.last.at)}</small> : null}</span>
      <Button size="sm" variant="ghost" onClick={() => apply({ state: 'reviewed' })}>Marcar revisado</Button>
      <Button size="sm" variant="ghost" aria-expanded={mode === 'waiting'} onClick={() => setMode(m => m === 'waiting' ? null : 'waiting')}>Esperando cliente</Button>
      <Button size="sm" variant="ghost" aria-expanded={mode === 'resolved'} onClick={() => setMode(m => m === 'resolved' ? null : 'resolved')}>Resolver</Button>
      {eff.state !== 'pending' ? <Button size="sm" variant="ghost" onClick={() => apply({ state: 'pending', note: 'Reabierto manualmente' })}>Reabrir</Button> : null}
    </div>
    {mode === 'waiting' ? <form className="adobo-workflow-form" onSubmit={e => { e.preventDefault(); apply({ state: 'waiting', reviewAt: reviewAt ? new Date(reviewAt).toISOString() : '' }); }}>
      <label>Fecha de revisión<input type="datetime-local" required value={reviewAt} onChange={e => setReviewAt(e.target.value)}/></label>
      <Button size="sm" type="submit">Guardar</Button></form> : null}
    {mode === 'resolved' ? <form className="adobo-workflow-form" onSubmit={e => { e.preventDefault(); apply({ state: 'resolved', note, url }); }}>
      <label>Evidencia de resolución<textarea required value={note} onChange={e => setNote(e.target.value)} rows={2}/></label>
      <label>Enlace de fuente (https, opcional)<input type="url" value={url} onChange={e => setUrl(e.target.value)}/></label>
      <Button size="sm" type="submit">Guardar</Button></form> : null}
    {error ? <p role="alert" className="text-danger text-sm">{error}</p> : null}
    {events?.length ? <details><summary>Historial de revisión ({events.length})</summary><ol className="adobo-chrono">
      {[...events].reverse().map((e, i) => <li key={i}>{STATE_LABEL[e.state]} · {e.actor} · {date(e.at)}{e.reviewAt ? ` · revisar ${date(e.reviewAt)}` : ''}
        {e.note ? <small>{e.note}</small> : null}{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">Fuente ↗</a> : null}
        {e.fingerprint !== fingerprint ? <small>Corresponde a evidencia anterior.</small> : null}</li>)}
    </ol></details> : null}
  </div>;
}

function IntelligenceDeal({ deal, now, readAt, workflow }: { deal: DealDTO; now: number; readAt: string; workflow: Omit<Parameters<typeof WorkflowControls>[0], 'deal' | 'now'> }) {
  const [open, setOpen] = useState(false);
  const s = dealIntelligence(deal, now), a = deal.adobo, c = s.context;
  const kinds = alertKinds(deal, now);
  const next = c?.nextStep && validEvidence(c.nextStep.evidence) ? c.nextStep : null;
  const evaluation = validEvidence(c?.evaluation) ? c?.evaluation : null;
  const response = validEvidence(c?.lastCustomerResponse) ? c?.lastCustomerResponse : null;
  const pinzasSource = validEvidence(c?.pinzasEvidence) ? c?.pinzasEvidence : null;
  const panelId = `adobo-deal-${deal.id}`;
  return <article className="adobo-intel-deal" data-action={s.action || undefined}>
    <div className="adobo-intel-deal-head">
      <div><a className="adobo-deal-link" href={deal.url} target="_blank" rel="noopener noreferrer">{deal.name}<ExternalLink size={14}/></a>
        <small>{deal.stageFull} · {deal.segment} · Owner: {deal.owner || 'Sin propietario'}</small></div>
      <div className="adobo-intel-score"><strong>{s.score ?? 'sin dato'}{s.score != null ? <small>/100</small> : null}</strong><span>Señal comercial</span>
        {s.delta != null ? <span className={s.delta < 0 ? 'text-danger' : 'text-success'}>{s.delta > 0 ? '+' : ''}{s.delta} puntos · historial verificado</span> : <span>Variación: sin historial verificable</span>}
        <span>Evaluación: {evaluation ? date(evaluation.at) : 'sin dato'}</span></div>
      <Button variant="ghost" size="icon" aria-label={`Detalle de ${deal.name}`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(v => !v)}><ChevronDown className={open ? 'rotate-180' : ''}/></Button>
    </div>
    {open ? <div id={panelId} className="adobo-deal-expanded">
    <Freshness deal={deal} readAt={readAt} now={now}/>
    {kinds.length ? <div className="adobo-inbox-reason">
      <strong>{kinds.map(k => REASONS[k]).join(' · ')}</strong>
      <span><em>Sugerencia (no es un compromiso con el cliente):</em> {kinds[0] ? SUGGESTIONS[kinds[0]] : ''}</span>
      <small>Fecha verificada: {s.verifiedDue ? date(s.verifiedDue) : 'sin dato'}</small>
    </div> : null}
    <div className="adobo-intel-reason"><strong>{text(a?.scoreDriver)}</strong><span>{text(a?.scoreChangeReason)}</span>
      {a?.scoreDriver || a?.scoreChangeReason ? <a href={deal.url} target="_blank" rel="noopener noreferrer">Evidencia registrada en CRM ↗</a> : <span>Evidencia: sin dato</span>}
    </div>
    <dl className="adobo-intel-facts">
      <div><dt>Última respuesta del cliente</dt><dd>{response ? <a href={response.url} target="_blank" rel="noopener noreferrer">{date(response.at)} ↗</a> : 'pendiente de integración'}</dd></div>
      <div><dt>Tasa por episodios</dt><dd>{percent(s.metric?.value ?? null)}</dd></div>
      <div><dt>Ratio legado · respuestas / intentos</dt><dd>{a?.contactRate == null ? 'sin dato' : `${a.contactRate}%`}<small>Intentos: {a?.contactAttempts ?? 'sin dato'} · Respuestas: {a?.contactReplies ?? 'sin dato'}</small></dd></div>
      <div><dt>Próximo paso</dt><dd>{next?.text ?? deal.nextStep ?? 'sin dato'}<small>Responsable: {next?.responsible ?? 'sin dato'} · Fecha: {date(next?.dueAt)}</small>
        {next ? <a href={next.evidence.url} target="_blank" rel="noopener noreferrer">Fuente verificada ↗</a> : deal.nextStep ? <a href={deal.url} target="_blank" rel="noopener noreferrer">Texto del CRM ↗</a> : null}</dd></div>
      <div><dt>Seguimiento con pinzas</dt><dd>{s.pinzas == null ? 'sin dato' : s.pinzas ? 'Sí · marca del CRM' : 'No · marca del CRM'}<small>{pinzasSource ? <a href={pinzasSource.url} target="_blank" rel="noopener noreferrer">Evidencia · {date(pinzasSource.at)} ↗</a> : 'Explicación verificable: sin dato'}</small></dd></div>
      <div><dt>Confianza · última evaluación</dt><dd>{text(a?.confidence)}<small>{evaluation ? <a href={evaluation.url} target="_blank" rel="noopener noreferrer">Evaluación: {date(evaluation.at)} ↗</a> : 'Evaluación: pendiente de integración'}</small></dd></div>
    </dl>
    <div className="adobo-intel-status">
      {s.metric?.pauseAgreed ? <span>Pausa acordada · sin alerta de contacto</span> : null}
    </div>
    {s.metric ? <p className="adobo-intel-method">Episodios con respuesta: {s.metric.responded}/{s.metric.eligible} elegibles · una respuesta por episodio · pendientes excluidos · ventana {date(s.metric.window.start)} — {date(s.metric.window.end)} · cobertura {s.metric.coverage.covered}/{s.metric.coverage.total} · metodología: episodios elegibles con respuesta (v1)</p> : <p className="adobo-intel-method">Tasa 0–100: pendiente de integración · ventana, metodología y cobertura verificadas: sin dato.</p>}
    {kinds.length ? <WorkflowControls deal={deal} now={now} {...workflow}/> : null}
    <Chronology deal={deal} now={now}/><PropertyAudit deal={deal}/>
    </div> : <p className="adobo-row-reason">{kinds.length ? kinds.map(k => REASONS[k]).join(' · ') : text(a?.scoreDriver)}</p>}
  </article>;
}

export function AdoboIntelligence({ deals, readAt, now, rangeLabel = '' }: { deals: DealDTO[]; readAt: string; now: number; rangeLabel?: string }) {
  const refresh = useRefreshMenu();
  const actor = useAccountEmail();
  const [store, save, storageError] = useWorkflow(actor);
  const [category, setCategory] = useState<AlertKind | 'all' | 'action' | null>(null);
  const [owner, setOwner] = useState('all');
  const [page, setPage] = useState(0);
  const [view, setView] = useState<'active' | 'resolved' | 'all'>('active');
  const [sort, setSort] = useState<AdoboSortKey>('score');
  const rows = useMemo(() => deals.map(deal => {
    const kinds = alertKinds(deal, now);
    const state = kinds.length ? effectiveState(store.records[deal.id], alertFingerprint(deal, now), now).state : null;
    return { deal, kinds, state };
  }), [deals, now, store]);
  const resolvedCount = rows.filter(r => r.state === 'resolved').length;
  const visible = rows.filter(r => (category === 'all' || category == null || (category === 'action' ? dealIntelligence(r.deal, now).action : r.kinds.includes(category))) &&
    (owner === 'all' || r.deal.ownerId === owner) &&
    (view === 'all' || (view === 'resolved' ? r.state === 'resolved' : r.state !== 'resolved')));
  const compareDeals = adoboSortCompare(sort, now);
  const sorted = [...visible].sort((a, b) => compareDeals(a.deal, b.deal));
  const owners = [...new Map(deals.map(d => [d.ownerId, d.owner || 'Sin propietario'])).entries()];
  const pageCount = Math.max(1, Math.ceil(visible.length / 8));
  const safePage = Math.min(page, pageCount - 1);
  const cards: { key: AlertKind | 'all' | 'action'; label: string; count: number; unknown?: boolean }[] = [
    { key: 'all', label: 'Negocios del período', count: rows.length },
    { key: 'action', label: 'Requieren acción', count: rows.filter(r => dealIntelligence(r.deal, now).action).length },
    ...FILTERS.map(f => ({ key: f.key, label: f.label, count: rows.filter(r => r.kinds.includes(f.key)).length,
      unknown: rows.length > 0 && (f.key === 'scoreDrop' ? rows.every(r => dealIntelligence(r.deal, now).delta == null)
        : f.key === 'overdue' ? rows.every(r => dealIntelligence(r.deal, now).overdue == null)
        : f.key === 'noResponse' ? rows.every(r => dealIntelligence(r.deal, now).noResponse == null) : false) })),
  ];
  const selectedLabel = cards.find(c => c.key === category)?.label ?? 'Negocios';
  const readAge = Number.isFinite(Date.parse(readAt)) ? now - Date.parse(readAt) : NaN;
  return <div className="adobo-intelligence">
    <div className="adobo-intel-toolbar"><span>Foto actual · lectura del reporte: {date(readAt)} ({age(readAge)}) · no es la fecha de evaluación</span>
      <Button variant="ghost" size="sm" disabled={!refresh.onRefresh || refresh.isRefreshing} onClick={() => refresh.onRefresh?.()} title="Vuelve a leer el CRM; no recalcula el score.">
        <RefreshCw className={refresh.isRefreshing ? 'animate-spin' : ''}/>Releer datos del CRM</Button>
    </div>
    <div className="adobo-summary-grid">
      {cards.map(c => <Button key={c.key} variant="outline" className="adobo-summary-card" data-kind={c.key}
        onClick={() => { setCategory(c.key); setOwner('all'); setPage(0); setView('all'); setSort('score'); }}>
        <span className="adobo-summary-label">{c.label}<ArrowUpRight size={16}/></span>
        <strong>{c.unknown ? 'sin dato' : c.count}</strong>
        <span className="adobo-summary-caption">{c.unknown ? 'Sin evidencia verificable' : rangeLabel || 'Período seleccionado'}</span>
      </Button>)}
    </div>
    {storageError ? <p role="alert" className="text-danger text-sm">{storageError}</p> : null}
    {!deals.length ? <p className="empty-state">Sin negocios con fecha de cierre en el período seleccionado.</p> : null}
    <Dialog open={category != null} onOpenChange={v => { if (!v) setCategory(null); }}>
      <DialogContent className="adobo-list-dialog">
        <div className="adobo-list-heading"><DialogTitle>{selectedLabel}</DialogTitle>
          <DialogDescription>{rangeLabel} · {visible.length} negocios · fecha de cierre</DialogDescription></div>
        <div className="adobo-list-controls">
          <label>Comercial<select value={owner} onChange={e => { setOwner(e.target.value); setPage(0); }}>
            <option value="all">Todos</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label>Ordenar por<select value={sort} onChange={e => { setSort(e.target.value as AdoboSortKey); setPage(0); }}>
            <option value="score">Score (mayor a menor)</option>
            <option value="mrr">MRR (mayor a menor)</option>
            <option value="closeDate">Fecha de cierre (más reciente)</option>
          </select></label>
          <div role="group" aria-label="Estado de alertas">{(['all', 'active', 'resolved'] as const).map(v =>
            <Button key={v} size="sm" variant={view === v ? 'secondary' : 'ghost'} aria-pressed={view === v}
              onClick={() => { setView(v); setPage(0); }}>{v === 'all' ? 'Todas' : v === 'active' ? 'Activas' : `Resueltas · ${resolvedCount}`}</Button>)}</div>
        </div>
        <div className="adobo-list-scroll">
          {!visible.length ? <p className="empty-state">Sin negocios para esta selección.</p> : null}
          {sorted.slice(safePage * 8, safePage * 8 + 8).map(({ deal }) => <IntelligenceDeal key={deal.id} deal={deal} now={now} readAt={readAt} workflow={{ store, save, actor }}/>) }
        </div>
        <div className="adobo-list-footer"><span>{visible.length ? `${safePage * 8 + 1}–${Math.min((safePage + 1) * 8, visible.length)} de ${visible.length}` : '0 negocios'}</span>
          <div><Button variant="ghost" size="icon" aria-label="Página anterior" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft/></Button>
            <span>{safePage + 1} / {pageCount}</span><Button variant="ghost" size="icon" aria-label="Página siguiente" disabled={safePage + 1 >= pageCount} onClick={() => setPage(safePage + 1)}><ChevronRight/></Button></div></div>
      </DialogContent>
    </Dialog>
  </div>;
}
