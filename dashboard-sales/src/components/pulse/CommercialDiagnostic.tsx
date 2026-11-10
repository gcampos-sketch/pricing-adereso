import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CalendarDays, ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getCommercialDiagnostic } from '@/lib/commercial-diagnostic.functions';
import { compareDiagnosticEditions, diagnosticDimensionDetail, diagnosticPatterns, diagnosticSummary, DIAGNOSTIC_DIMENSIONS, type DiagnosticDimension, type DiagnosticReport, type DiagnosticRow } from '@/lib/commercial-diagnostic';
import { SectionTitle } from './insights-shared';
import { DiagnosticWarnings } from './DiagnosticWarnings';
import './CommercialDiagnostic.css';

const dateLabel = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Coyhaique' });
const url = (id: string) => `https://app.hubspot.com/contacts/23480943/record/0-3/${id}?utm_source=hub_comercial&utm_medium=diagnostico`;
const short = (text: string) => text.split('\nFuente:')[0]?.split('\n').slice(0, 2).join(' ') || '';
const stages: Record<string, string> = { '1144383754': 'Oportunidad expansión', '171385863': 'Reunión concretada', '171385864': 'Requerimientos', '173996363': 'Propuesta técnica', '1181334581': 'Cotización SP', '171385866': 'Elaboración propuesta', '171385867': 'Negociación', '1245768029': 'PoC / demo', '171385869': 'Perdido', '173990327': 'Servicio iniciado', '1086544542': 'En desarrollo', '178228041': 'Churn', '1278792585': 'Warning', '1372234925': 'Desarrollo perdido' };

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="metric diagnostic-metric"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></div>;
}

function Evidence({ row, kind }: { row: DiagnosticRow; kind: 'case' | 'objection' }) {
  const stored = kind === 'case' ? row.caseUse : row.objection;
  const prepared = kind === 'case' ? row.preparedCase : row.preparedObjection;
  return <section className="diagnostic-evidence">
    <h3>{kind === 'case' ? 'Caso de uso' : 'Objeciones'}</h3>
    {stored ? <><span className="diagnostic-caption">En HubSpot al capturar la edición</span><p>{stored}</p></> : prepared ? <>
      <span className="diagnostic-status">Resumen Diio · pendiente de guardar en HubSpot</span>
      <p>{prepared.text}</p>
      <a className="diagnostic-source" href={prepared.source.url} target="_blank" rel="noreferrer">Fuente del {dateLabel(prepared.source.date)} <ExternalLink size={12} /></a>
    </> : <p className="diagnostic-caption">{kind === 'case' ? 'Sin evidencia suficiente para completar.' : 'Sin objeción explícita suficiente para completar. No equivale a ausencia de objeciones.'}</p>}
  </section>;
}

export function CommercialDiagnostic({ report, tabs }: { report: DiagnosticReport; tabs: React.ReactNode }) {
  const [edition, setEdition] = useState('');
  const [owner, setOwner] = useState('team');
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'foto' | 'warnings' | 'cambios' | 'negocios' | 'archivo'>('foto');
  const [selected, setSelected] = useState<{ row: DiagnosticRow; before?: DiagnosticRow; dimension?: DiagnosticDimension } | null>(null);
  const [dimension, setDimension] = useState<DiagnosticDimension | null>(null);
  const [patternKind, setPatternKind] = useState<'cases' | 'objections'>('cases');
  const historical = useQuery({ queryKey: ['commercial-diagnostic-edition', edition], queryFn: () => getCommercialDiagnostic({ data: { date: edition } }), enabled: Boolean(edition && edition !== report.current?.date), staleTime: Infinity });
  const archive = edition && edition !== report.current?.date ? historical.data : report;
  const current = archive?.current;
  const scoped = useMemo(() => current?.rows.filter(row => owner === 'team' || row.ownerId === owner) ?? [], [current, owner]);
  const summary = useMemo(() => diagnosticSummary(scoped), [scoped]);
  const dimensionDetail = useMemo(() => dimension ? diagnosticDimensionDetail(scoped, dimension) : null, [scoped, dimension]);
  const dimensionLabel = DIAGNOSTIC_DIMENSIONS.find(([key]) => key === dimension)?.[1];
  const patterns = useMemo(() => diagnosticPatterns(scoped, patternKind), [scoped, patternKind]);
  const comparison = useMemo(() => current ? compareDiagnosticEditions(current, archive?.previous ?? null) : null, [current, archive?.previous]);
  const visible = useMemo(() => summary.active.filter(row => row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [summary.active, query]);
  const owners = current?.scope.owners ?? {};
  const inScope = (row: DiagnosticRow) => owner === 'team' || row.ownerId === owner;
  return <main className="pulse-main diagnostic-main">
    {tabs}
    <header className="team-header diagnostic-header"><div><div className="diagnostic-kicker"><ShieldCheck size={14} /> Uso interno · edición semanal</div><h1 className="pulse-h1">Diagnóstico comercial</h1><p className="eyebrow">Lo que sabemos del cliente, lo que falta y lo que cambió.</p></div><BookOpen className="diagnostic-header-icon" aria-hidden="true" /></header>
    <div className="diagnostic-toolbar">
      <label><span><CalendarDays size={14} /> Edición</span><select value={edition || report.current?.date || ''} onChange={event => setEdition(event.target.value)} aria-label="Edición semanal">{report.editions.map(item => <option key={item.date} value={item.date}>{dateLabel(item.date)}</option>)}</select></label>
      <label><span>Comercial</span><select value={owner} onChange={event => setOwner(event.target.value)} aria-label="Comercial del diagnóstico"><option value="team">Equipo de la vista SPICED</option>{Object.entries(owners).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <div className="diagnostic-toolbar-note">{current ? `${current.scope.total} negocios en la captura completa` : 'Archivo de ediciones'}</div>
    </div>
    {historical.isError && edition !== report.current?.date ? <div className="empty-state" role="alert">No pudimos leer esa edición. <Button variant="ghost" onClick={() => void historical.refetch()}>Reintentar</Button></div> : !archive ? <div className="empty-state" role="status">Cargando la edición seleccionada…</div> : !current ? <div className="empty-state">La primera edición todavía no está publicada. Aquí se conservarán las fotos semanales y sus comparaciones.</div> : <>
      <div className="diagnostic-navigation"><nav className="diagnostic-tabs" aria-label="Secciones del diagnóstico">{([['foto', 'Foto actual'], ['warnings', 'Warnings y vacíos'], ['cambios', 'Qué cambió'], ['negocios', 'Cada negocio'], ['archivo', 'Archivo por fecha']] as const).map(([id, name]) => <button key={id} className="diagnostic-tab" type="button" data-active={panel === id} aria-pressed={panel === id} onClick={() => setPanel(id)}>{name}</button>)}</nav>
      <label className="diagnostic-mobile-navigation"><span className="sr-only">Sección del diagnóstico</span><select value={panel} onChange={event => setPanel(event.target.value as typeof panel)}><option value="foto">Foto actual</option><option value="warnings">Warnings y vacíos</option><option value="cambios">Qué cambió</option><option value="negocios">Cada negocio</option><option value="archivo">Archivo por fecha</option></select></label></div>
      {panel === 'warnings' && <DiagnosticWarnings current={current} previous={archive.previous} rows={scoped} owner={owner} onSelect={row => setSelected({ row })} />}
      {panel === 'archivo' && <>
        <SectionTitle note="Una edición por fecha, conservada sin reemplazar las anteriores">Archivo de documentos</SectionTitle>
        <div className="table-wrap diagnostic-archive"><table className="pulse-table"><thead><tr><th>Fecha</th><th>Documento</th><th>Revisar</th></tr></thead><tbody>{report.editions.map(item => <tr key={item.date}><td>{dateLabel(item.date)}</td><td>{item.label}</td><td><Button variant="ghost" onClick={() => { setEdition(item.date); setPanel('warnings'); }}>Abrir edición <ArrowRight size={13} /></Button><Button variant="ghost" onClick={() => { setEdition(item.date); setPanel('cambios'); }}>Comparar</Button></td></tr>)}</tbody></table></div>
      </>}
      {panel === 'foto' && <>
        <section className="grid-4 diagnostic-metrics" aria-label="Cobertura de la edición">
          <Metric label="Negocios activos" value={summary.active.length} note="Etapas comerciales de la vista" />
          <Metric label="Con SPICED" value={summary.evaluated.length} note={`De ${summary.active.length} activos · vacío no es cero`} />
          <Metric label="Con caso de uso" value={summary.cases} note="CRM o resumen Diio identificado" />
          <Metric label="Con objeciones" value={summary.objections} note="CRM o reserva documentada en Diio" />
        </section>
        <SectionTitle note="Solo activos con evaluación SPICED; los vacíos quedan fuera de la media">De entender el dolor a justificar la compra</SectionTitle>
        <div className="diagnostic-dimensions">{summary.dimensions.map(item => <button type="button" className="diagnostic-dimension diagnostic-dimension-trigger" key={item.key} aria-label={`Ver negocios de ${item.label}`} aria-haspopup="dialog" onClick={() => setDimension(item.key)}><div><strong>{item.label}</strong><span>{item.mean === null ? 'Sin evaluar' : `${item.mean.toLocaleString('es-CL', { maximumFractionDigits: 2 })} / 5`}</span></div><div className="diagnostic-track" aria-hidden="true"><span style={{ width: `${(item.mean ?? 0) * 20}%` }} /></div><small>{item.covered} de {item.total} evaluados <ArrowRight size={12} aria-hidden="true" /></small></button>)}</div>
        <p className="diagnostic-caption">El score mide completitud de evidencia, no probabilidad de cierre ni desempeño del comercial. Una respuesta negativa también puede estar bien documentada.</p>
        <SectionTitle note="Menciones temáticas en textos documentados; un negocio puede aparecer en varios patrones">Qué se repite</SectionTitle>
        <nav className="tabs diagnostic-pattern-tabs" aria-label="Tipo de patrón"><button className="tab" data-active={patternKind === 'cases'} onClick={() => setPatternKind('cases')}>Casos de uso</button><button className="tab" data-active={patternKind === 'objections'} onClick={() => setPatternKind('objections')}>Objeciones</button></nav>
        <div className="diagnostic-patterns">{patterns.map(pattern => <details className="diagnostic-pattern" key={pattern.label}><summary><span>{pattern.label}</span><strong>{pattern.rows.length}<small> / {pattern.total}</small></strong></summary><div className="diagnostic-pattern-deals">{pattern.rows.map(row => <Button key={row.id} variant="ghost" onClick={() => setSelected({ row })}>{row.name}<ArrowRight size={13} /></Button>)}{!pattern.rows.length && <span className="diagnostic-caption">Sin menciones en esta edición.</span>}</div></details>)}</div>
        <details className="diagnostic-method"><summary>Alcance y lectura de los datos</summary><p>Captura del {dateLabel(current.date)}. El total incluye historia; las métricas de arriba usan solo las etapas comerciales activas. Las menciones son una clasificación orientativa del texto, no razones de pérdida ni una auditoría de conversaciones. Cada fuente conserva su fecha; no se presume que siga vigente. Los resúmenes preparados y aún no guardados en HubSpot están identificados en el detalle.</p></details>
      </>}
      {panel === 'cambios' && <>
        <SectionTitle note={archive.previous ? `Comparación con ${dateLabel(archive.previous.date)}` : 'Primera edición conservada'}>Qué cambió esta semana</SectionTitle>
        {!comparison ? <div className="empty-state"><CalendarDays size={22} /><h3>{archive.previous ? 'Los alcances no son comparables' : 'Esta es la base inicial'}</h3><p>{archive.previous ? 'Las poblaciones cambiaron de alcance; no se mezclan como una tendencia.' : 'La próxima edición mostrará los cambios sobre los mismos negocios, separando nueva evidencia de cambios comerciales.'}</p></div> : <>
          <section className="grid-3"><Metric label="Con cambios" value={comparison.changed.filter(item => inScope(item.row) || inScope(item.before)).length} note="Mismos IDs comparados" /><Metric label="Entraron a la vista" value={comparison.entered.filter(inScope).length} note="Separados de la población comparable" /><Metric label="Salieron de la vista" value={comparison.exited.filter(inScope).length} note="No implica que el negocio se haya perdido" /></section>
          <div className="table-wrap diagnostic-table"><table className="pulse-table"><thead><tr><th>Negocio</th><th>Qué cambió</th><th>Comparar</th></tr></thead><tbody>{comparison.changed.filter(item => inScope(item.row) || inScope(item.before)).map(item => <tr key={item.row.id}><td>{item.row.name}</td><td>{item.fields.join(' · ')}</td><td><Button variant="ghost" onClick={() => setSelected({ row: item.row, before: item.before })}>Antes / ahora <ArrowRight size={13} /></Button></td></tr>)}{!comparison.changed.filter(item => inScope(item.row) || inScope(item.before)).length && <tr><td colSpan={3}>Sin cambios en los campos comparados. Esto no acredita ausencia de actividad comercial.</td></tr>}</tbody></table></div>
          {(['entered', 'exited'] as const).map(kind => <details className="diagnostic-method" key={kind}><summary>{kind === 'entered' ? 'Entradas' : 'Salidas'} de la vista</summary><div className="diagnostic-pattern-deals">{comparison[kind].filter(inScope).map(row => <Button variant="ghost" key={row.id} onClick={() => setSelected({ row })}>{row.name}</Button>)}</div></details>)}
        </>}
      </>}
      {panel === 'negocios' && <>
        <SectionTitle note="Textos breves primero; fuentes y SPICED completo al abrir el negocio">Cada negocio</SectionTitle>
        <label className="diagnostic-search"><span className="sr-only">Buscar negocio</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar negocio…" /></label>
        <div className="table-wrap diagnostic-table"><table className="pulse-table"><thead><tr><th>Negocio</th><th>Caso de uso</th><th>Objeciones</th><th>SPICED</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><button className="diagnostic-deal" onClick={() => setSelected({ row })}>{row.name}<ArrowRight size={13} /></button><small className="diagnostic-caption">{owners[row.ownerId]} · {stages[row.stage] ?? 'Otra etapa'}</small></td><td><span className="diagnostic-preview-text">{short(row.caseUse || row.preparedCase?.text || '') || <span className="diagnostic-caption">Pendiente de evidencia</span>}</span>{!row.caseUse && row.preparedCase && <small className="diagnostic-caption">Diio · pendiente en CRM</small>}</td><td><span className="diagnostic-preview-text">{short(row.objection || row.preparedObjection?.text || '') || <span className="diagnostic-caption">Sin objeción documentada</span>}</span>{!row.objection && row.preparedObjection && <small className="diagnostic-caption">Diio · pendiente en CRM</small>}</td><td><button className="diagnostic-score-row" onClick={() => setSelected({ row })} aria-label={`Ver SPICED de ${row.name}`}>{DIAGNOSTIC_DIMENSIONS.map(([key, label]) => <span key={key} title={label}>{row.spiced[key].score ?? '—'}</span>)}</button><small className="diagnostic-caption">S · P · I · CE · D</small></td></tr>)}{!visible.length && <tr><td colSpan={4}>No hay negocios con ese nombre en el alcance.</td></tr>}</tbody></table></div>
        <details className="diagnostic-method"><summary>{scoped.length - summary.active.length} negocios de otras etapas</summary><p>Conservados en la captura, fuera de la lectura de activos.</p><div className="diagnostic-pattern-deals">{scoped.filter(row => !row.active).map(row => <Button key={row.id} variant="ghost" onClick={() => setSelected({ row })}>{row.name}</Button>)}</div></details>
      </>}
    </>}
    <Dialog open={Boolean(dimension)} onOpenChange={open => { if (!open && !selected) setDimension(null); }}><DialogContent className="diagnostic-dialog diagnostic-dimension-dialog" overlayClassName="diagnostic-overlay"><DialogHeader><DialogTitle>{dimensionLabel} · negocios evaluados</DialogTitle><DialogDescription>Los mismos negocios que componen este promedio, con el filtro comercial y la edición seleccionados.</DialogDescription></DialogHeader>{dimension && dimensionDetail && <>
      <div className="diagnostic-dimension-summary"><strong>{dimensionDetail.mean === null ? 'Sin promedio' : `${dimensionDetail.mean.toLocaleString('es-CL', { maximumFractionDigits: 2 })} / 5`}</strong><span>{dimensionDetail.evaluated.length} negocios con score · menor primero</span></div>
      <div className="table-wrap"><table className="pulse-table diagnostic-dimension-table"><thead><tr><th>Negocio</th><th>Score</th><th>Evidencia de {dimensionLabel?.toLowerCase()}</th></tr></thead><tbody>{dimensionDetail.evaluated.map(row => <tr key={row.id}><td><Button variant="ghost" onClick={() => setSelected({ row, dimension })}>{row.name}<ArrowRight size={13} /></Button><small className="diagnostic-caption">{owners[row.ownerId]}</small></td><td>{row.spiced[dimension].score} / 5</td><td><span className="diagnostic-preview-text">{short(row.spiced[dimension].text) || 'Score cargado sin texto de respaldo en esta edición.'}</span></td></tr>)}{!dimensionDetail.evaluated.length && <tr><td colSpan={3}>Sin scores cargados para esta dimensión.</td></tr>}</tbody></table></div>
      <details className="diagnostic-method"><summary>Sin score · {dimensionDetail.missing.length} negocios fuera del promedio</summary><div className="diagnostic-pattern-deals">{dimensionDetail.missing.map(row => <Button variant="ghost" key={row.id} onClick={() => setSelected({ row, dimension })}>{row.name}</Button>)}</div></details>
      <p className="diagnostic-caption">Abre un negocio para ver el texto completo y la fuente registrada. El score mide completitud de evidencia, no probabilidad de cierre.</p>
    </>}</DialogContent></Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="diagnostic-dialog" overlayClassName="diagnostic-overlay"><DialogHeader><DialogTitle>{selected?.row.name}</DialogTitle><DialogDescription>Evidencia conservada en esta edición; cada resumen mantiene su fecha y fuente.</DialogDescription></DialogHeader>{selected && <>
      <div className="diagnostic-dialog-meta"><span>{owners[selected.row.ownerId]} · {stages[selected.row.stage] ?? 'Otra etapa'}</span><a href={url(selected.row.id)} target="_blank" rel="noreferrer">Abrir HubSpot <ExternalLink size={13} /></a></div>
      {selected.before && <section className="diagnostic-before"><h3>Antes · {archive?.previous ? dateLabel(archive.previous.date) : ''}</h3><p>Etapa: {stages[selected.before.stage] ?? 'Otra etapa'} · Comercial: {owners[selected.before.ownerId]}</p><div className="diagnostic-detail-grid"><Evidence row={selected.before} kind="case" /><Evidence row={selected.before} kind="objection" /></div></section>}
      <div className="diagnostic-detail-grid"><Evidence row={selected.row} kind="case" /><Evidence row={selected.row} kind="objection" /></div>
      <h3>SPICED · evidencia por dimensión</h3><div className="diagnostic-spiced-detail">{DIAGNOSTIC_DIMENSIONS.map(([key, label]) => <details key={key} open={selected.dimension === key ? true : undefined}><summary><span>{label}</span><strong>{selected.row.spiced[key].score === null ? 'Sin evaluar' : `${selected.row.spiced[key].score} / 5`}</strong></summary>{selected.before && <div className="diagnostic-before"><span className="diagnostic-caption">Antes · {selected.before.spiced[key].score ?? 'Sin evaluar'}</span><p>{selected.before.spiced[key].text || 'Sin evidencia cargada.'}</p></div>}<p>{selected.row.spiced[key].text || 'Sin evidencia cargada.'}</p></details>)}</div>
    </>}</DialogContent></Dialog>
  </main>;
}
