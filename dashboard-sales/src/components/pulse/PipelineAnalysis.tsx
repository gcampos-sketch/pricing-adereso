import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { getPipelineAnalysis } from '@/lib/pipeline-analysis.functions';
import {
  STAGES, adKey, adLabel, creativeFormat, hasStage, inboundAdCoverage, isProspectingCandidate, layoutPipelineFlow, meetingBooked, meetingHeld, pipelineColumns,
  reachedCommercial, serviceToChurn, wasInService, wasLost, wasWon,
  type PipelineDeal, type PipelineReport, type RouteDetail, type StageId, type View,
} from '@/lib/pipeline-analysis';
import { layoutPipelineTrace, pipelineTraceIds, selectPipelineTrace, type PipelineTrace } from '@/lib/pipeline-trace';
import type { RoleFilter } from '@/lib/owner-roles';
import { CopyDealLinksButton } from './CopyControls';
import './PipelineAnalysis.css';

const hubSpotAdsUrl = 'https://app.hubspot.com/ads/23480943/';
const dealUrl = (id: string) => `https://app.hubspot.com/contacts/23480943/record/0-3/${id}?utm_source=hub_comercial&utm_medium=pipeline_analysis`;
const number = new Intl.NumberFormat('es-CL');
const percent = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 });
const formatDate = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Coyhaique', dateStyle: 'medium', timeStyle: 'short' });
const views = [['all', 'Todo el pipeline'], ['Inbound', 'Inbound'], ['Outbound', 'Outbound'], ['Sin clasificar', 'Sin clasificar']] as const;
const routes = [['compact', 'Resumen compacto'], ['summary', 'Recorrido completo'], ['sdr', 'Detalle SDR'], ['sales', 'Detalle Comercial'], ['activation', 'Detalle activación']] as const;

type Drill = { title: string; deals: PipelineDeal[] };
type Props = { owner: string; role: RoleFilter; periods: string[]; rangeLabel: string; refreshKey: string; segment?: string | undefined };

export function PipelineAnalysis({ owner, role, periods, rangeLabel, refreshKey, segment }: Props) {
  const query = useQuery({
    queryKey: ['pipeline-analysis', owner, role, periods, refreshKey],
    queryFn: async () => JSON.parse(await getPipelineAnalysis({ data: { periods, role, owner } })) as PipelineReport,
    staleTime: 90_000,
    retry: false,
  });
  if (query.isPending) return <p className="empty-state" role="status">Leyendo los hitos y contactos de HubSpot…</p>;
  if (query.isError) return <div className="empty-state" role="alert">No se pudo completar la lectura del pipeline. <button type="button" className="tab" onClick={() => void query.refetch()}>Reintentar</button></div>;
  return <PipelineAnalysisView key={`${owner}:${role}:${rangeLabel}:${segment}`} report={query.data} rangeLabel={rangeLabel} segment={segment} />;
}

function options(deals: PipelineDeal[], value: (deal: PipelineDeal) => string) {
  return [...new Set(deals.map(value))].sort((a, b) => a.localeCompare(b, 'es'));
}

const breakdowns = {
  industry: ['Industria', (deal: PipelineDeal) => deal.industry],
  ad: ['Anuncio rastreado', adKey],
  format: ['Tipo de creativo', creativeFormat],
  campaign: ['Campaña', (deal: PipelineDeal) => deal.campaign],
  role: ['Rol del contacto', (deal: PipelineDeal) => deal.role],
  type: ['Tipo de deal', (deal: PipelineDeal) => deal.dealType],
  source: ['Fuente de creación', (deal: PipelineDeal) => deal.sourceLabel],
} as const;
type Breakdown = keyof typeof breakdowns;
const segmentNames: Record<string, string> = { inbound: 'Inbound', outbound: 'Outbound', upsell: 'Upsell', crossSell: 'Cross sell' };
const metrics = [
  ['Deals', () => true],
  ['Agendadas', meetingBooked], ['Concretadas', meetingHeld], ['En Comercial', reachedCommercial],
  ['Valorizados E4', (deal: PipelineDeal) => hasStage(deal, '171385866')], ['Ganados', wasWon], ['Perdidos', wasLost],
  ['Llegaron a E8', wasInService], ['En servicio hoy', (deal: PipelineDeal) => deal.stage === '173990327'], ['Churn tras E8', serviceToChurn],
] as const;

const primaryRankingColumns = ['Ganados', 'Llegaron a E8', 'Concretadas'] as const;
const inboundRankingMetrics = primaryRankingColumns.flatMap(column => metrics.filter(([label]) => label === column));

function splitAdLabel(label: string) {
  if (label.length <= 36) return [label];
  const space = label.lastIndexOf(' ', 36);
  const split = space >= 22 ? space : 36;
  const tail = label.slice(split).trimStart();
  return [label.slice(0, split), tail.length > 36 ? `${tail.slice(0, 35)}…` : tail];
}

function adSubtitle(first: PipelineDeal | undefined) {
  if (!first?.adId) return '';
  return `${creativeFormat(first)} · ID …${first.adId.slice(-9)}`;
}

function flowTone(name: string) {
  if (name.startsWith('Ganado y')) return 'mixed';
  if (name === 'Ganado registrado' || name === 'Llegó a E8') return 'positive';
  if (name === 'Pérdida registrada') return 'negative';
  if (name === 'Sin cierre registrado' || name === 'E8 sin registro' || name === 'Sin registro' || name === 'Sin anuncio rastreado' || name === 'Lectura pendiente') return 'muted';
  return undefined;
}

export function PipelineAnalysisView({ report, rangeLabel, segment }: { report: PipelineReport; rangeLabel: string; segment?: string | undefined }) {
  const [view, setView] = useState<View>('all');
  const [includeProspecting, setIncludeProspecting] = useState(true);
  const [rankByRate, setRankByRate] = useState(false);
  const [route, setRoute] = useState<RouteDetail>('summary');
  const [source, setSource] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown>('industry');
  const [focus, setFocus] = useState<string | null>(null);
  const [paths, setPaths] = useState<PipelineTrace>([]);
  const [addPath, setAddPath] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const returnFocus = useRef<Element | null>(null);
  const graphHeading = useRef<HTMLHeadingElement>(null);
  const isInbound = view === 'Inbound';
  const compact = isInbound && route === 'compact';
  const [expanded, setExpanded] = useState(false);
  const [rankingDetail, setRankingDetail] = useState(false);
  const [rankMetric, setRankMetric] = useState<(typeof metrics)[number][0]>('Ganados');

  const population = useMemo(() => report.deals.filter(deal =>
    (!segment || !segmentNames[segment] || deal.segment === segmentNames[segment]) && (view === 'all' || deal.motion === view || (view === 'Outbound' && includeProspecting && isProspectingCandidate(deal)))),
  [report.deals, segment, view, includeProspecting]);
  const sources = useMemo(() => [...new Map(population.map(deal => [deal.source, deal.sourceLabel])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'es')), [population]);
  const bySource = useMemo(() => population.filter(deal => source === null || deal.source === source), [population, source]);
  const industries = useMemo(() => options(bySource, deal => deal.industry), [bySource]);
  const scoped = useMemo(() => bySource.filter(deal => industry === null || deal.industry === industry), [bySource, industry]);
  const coverage = useMemo(() => inboundAdCoverage(scoped), [scoped]);
  const adRanking = isInbound && (breakdown === 'ad' || breakdown === 'format' || breakdown === 'campaign');
  const rankingDeals = adRanking ? coverage.tracked : scoped;
  const [groupLabel, groupBy] = breakdowns[breakdown];
  const deals = useMemo(() => scoped.filter(deal => focus === null || groupBy(deal) === focus), [scoped, focus, groupBy]);
  const graph = useMemo(() => layoutPipelineFlow(deals, pipelineColumns(view, route), compact), [deals, view, route, compact]);
  const traceIds = useMemo(() => pipelineTraceIds(paths), [paths]);
  const trace = useMemo(() => paths.length ? layoutPipelineTrace(graph, traceIds) : null, [graph, paths.length, traceIds]);
  const tracedDeals = deals.filter(deal => traceIds.has(deal.id));
  const currentPath = paths.at(-1);
  const buckets = useMemo(() => {
    const groups = new Map<string, PipelineDeal[]>();
    for (const deal of rankingDeals) {
      const name = groupBy(deal);
      const rows = groups.get(name) ?? [];
      rows.push(deal);
      groups.set(name, rows);
    }
    return [...groups].map(([key, rows]) => {
      const first = rows[0]!;
      const name = breakdown === 'ad' ? adLabel(first) : key;
      const detail = breakdown === 'ad' ? adSubtitle(first) : '';
      const counts = new Map(metrics.map(([label, test]) => [label, rows.filter(test).length]));
      const rankCount = counts.get(rankMetric) ?? 0;
      return { key, name, detail, rows, counts, rankCount, rate: rankCount / rows.length };
    }).sort((a, b) => (rankByRate ? b.rate - a.rate : b.rankCount - a.rankCount) ||
      b.rows.length - a.rows.length || a.name.localeCompare(b.name, 'es'));
  }, [rankingDeals, breakdown, groupBy, rankMetric, rankByRate]);

  function open(title: string, members: PipelineDeal[], trigger: Element) {
    returnFocus.current = trigger;
    setDrill({ title, deals: members });
  }

  const contactRead = deals.filter(deal => deal.contactRead).length;
  const unconfirmed = deals.filter(isProspectingCandidate).length;
  const firstWidth = isInbound ? 282 : 164;
  const nextWidth = compact ? 180 : 164;
  const width = firstWidth + (graph.columns.length - 1) * nextWidth;
  const columnX = (index: number) => index === 0 ? 0 : firstWidth + (index - 1) * nextWidth;
  const activeLabel = focus && (buckets.find(row => row.key === focus)?.name ?? focus);
  const clearTrace = () => { setPaths([]); setAddPath(false); };
  const clearRoute = () => { setFocus(null); clearTrace(); };
  const selectTrace = (key: string, label: string, members: PipelineDeal[]) => {
    setPaths(previous => selectPipelineTrace(previous, { key, label, ids: new Set(members.map(deal => deal.id)) }, addPath));
    setAddPath(false);
  };
  const traceLink = (link: (typeof graph.links)[number]) =>
    selectTrace(edgeKey(link), `${link.source.name} → ${link.target.name}`, link.members);
  const edgeKey = ({ depth, source, target }: (typeof graph.links)[number]) =>
    JSON.stringify([graph.columns[depth]?.title, source.key, graph.columns[depth + 1]?.title, target.key]);
  const ribbon = ({ depth, width: thickness, y1, y2 }: (typeof graph.links)[number]) => {
    const x1 = columnX(depth) + 24, x2 = columnX(depth + 1) + 11, mid = (x1 + x2) / 2;
    return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2} L${x2},${y2 + thickness} C${mid},${y2 + thickness} ${mid},${y1 + thickness} ${x1},${y1 + thickness} Z`;
  };
  const resetGroup = () => { clearRoute(); setExpanded(false); };
  const dismissRoute = () => { clearRoute(); if (isInbound) setRoute('compact'); };
  const focusGraph = () => requestAnimationFrame(() => graphHeading.current?.focus());
  const routeControl = <label>Vista del recorrido<select value={route} onChange={event => setRoute(event.target.value as RouteDetail)}>
    {routes.filter(([key]) => isInbound || key !== 'compact').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select></label>;

  const orderedMetrics = !isInbound ? metrics.slice(1) : [
    ...inboundRankingMetrics,
    ...(rankingDetail ? metrics.slice(1).filter(([label]) => !primaryRankingColumns.some(column => column === label)) : []),
  ];
  const rowLimit = isInbound ? 5 : 10;
  const ranking = <section className="pipeline-analysis-ranking" aria-label={isInbound ? 'Ranking Inbound' : 'Conversión por segmento'}>
    <h3 className="pulse-h2">{isInbound && breakdown === 'ad' ? 'Ranking de anuncios' : 'Conversión por segmento'}</h3>
    {isInbound && <p className="pipeline-analysis-note">
      {number.format(rankingDeals.length)} deals en la comparación{adRanking && ' con anuncio identificado'}. Los resultados se calculan sobre los deals de cada fila.
      {activeLabel && ' El filtro de ruta solo afecta el Sankey.'}
    </p>}
    <div className="pipeline-analysis-filters">
      <label>Comparar por<select value={breakdown} onChange={event => { setBreakdown(event.target.value as Breakdown); dismissRoute(); setExpanded(false); }}>
        {Object.entries(breakdowns).filter(([key]) => isInbound || key !== 'format').map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Ordenar por<select value={rankMetric} onChange={event => { const metric = event.target.value as typeof rankMetric; setRankMetric(metric); if (metric === 'Deals') setRankByRate(false); }}>
        {(isInbound ? [metrics[0], ...orderedMetrics] : metrics).map(([label]) => <option key={label}>{label}</option>)}</select></label>
      <label>Medida<select disabled={rankMetric === 'Deals'} value={rankByRate ? 'rate' : 'count'} onChange={event => setRankByRate(event.target.value === 'rate')}>
        <option value="count">Cantidad</option><option value="rate">Porcentaje de la cohorte</option>
      </select></label>
    </div>
    {buckets.length ? <div className="pipeline-analysis-scroll" tabIndex={0} role="region" aria-label="Tabla de conversión desplazable horizontalmente">
      <table className="pipeline-analysis-table" data-inbound-ranking={isInbound || undefined}>
        <thead><tr><th scope="col">{groupLabel}</th><th scope="col">Deals</th>{orderedMetrics.map(([name]) => <th scope="col" key={name}>{isInbound && name === 'Llegaron a E8' ? 'Llegaron a servicio (E8)' : name}</th>)}</tr></thead>
        <tbody>{buckets.slice(0, expanded ? undefined : rowLimit).map(({ key, name, detail, rows, counts }) => <tr key={key} data-active={focus === key}>
          <th scope="row"><button className="pipeline-analysis-row" type="button" aria-pressed={focus === key}
            aria-label={isInbound ? `Ver ruta de ${name}${rows[0]?.adId && breakdown === 'ad' ? ` · ID ${rows[0].adId}` : ''}` : undefined}
            onClick={() => {
              if (focus === key) { dismissRoute(); return; }
              clearTrace(); setFocus(key); setRoute('summary'); if (isInbound) focusGraph();
            }}>{name}</button>{detail && <small>{detail}</small>}</th>
          <td><button className="pipeline-analysis-row" type="button" onClick={event => open(name, rows, event.currentTarget)}>{number.format(rows.length)}</button></td>
          {orderedMetrics.map(([label, test]) => {
            const count = counts.get(label) ?? 0;
            return <td key={label}>
              {count ? <button className="pipeline-analysis-row" type="button" aria-label={`${name} · ${label} · ${count} de ${rows.length} deals`}
                onClick={event => open(`${name} · ${label}`, rows.filter(test), event.currentTarget)}>
                {number.format(count)} <small>{isInbound ? `de ${number.format(rows.length)} · ` : ''}{percent.format(count / rows.length)}</small>
              </button> : <><span>0</span>{isInbound && <small>de {number.format(rows.length)} · 0%</small>}</>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div> : isInbound && <p className="pipeline-analysis-note">{adRanking ? 'No hay deals con anuncio identificado en estos filtros.' : 'No hay deals para comparar en estos filtros.'}</p>}
    {(buckets.length > rowLimit || (isInbound && buckets.length > 0)) && <div className="pipeline-analysis-ranking-actions">
      {buckets.length > rowLimit && <button type="button" className="tab" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Ver menos' : `Ver los ${buckets.length} grupos`}</button>}
      {isInbound && buckets.length > 0 && <button type="button" className="tab" aria-expanded={rankingDetail} onClick={() => {
        if (rankingDetail && rankMetric !== 'Deals' && !primaryRankingColumns.some(column => column === rankMetric)) {
          setRankMetric('Deals'); setRankByRate(false);
        }
        setRankingDetail(!rankingDetail);
      }}>{rankingDetail ? 'Ver métricas principales' : 'Ver más métricas'}</button>}
    </div>}
  </section>;

  const methodology = <details className="pipeline-analysis-methodology"><summary>Cómo se calculan las conversiones</summary>
    <p>Se cuenta un deal por ID y el período usa su fecha de creación. Los porcentajes incluyen los deals abiertos en la base de cada fila.</p>
    <p>Ganados cuenta cualquier etapa ganada registrada. Llegaron a E8 cuenta la etapa de inicio de servicio registrada. Un deal puede registrar un ganado histórico y una pérdida. Churn tras E8 requiere ambas fechas en ese orden y Churn como etapa actual.</p>
    <p>En Inbound, el ID de Meta procede del primer enlace rastreado del contacto asociado antes o al crear el deal. Nombre y formato se cruzan por ID exacto. En Outbound, el rol usa las etiquetas del contacto asociado, con prioridad para los marcados como Key Contact.</p>
  </details>;
  return <section className="pipeline-analysis" aria-label="Sankey de pipeline comercial">
    <div className="pipeline-analysis-controls">
      <div className="tabs" role="group" aria-label="Origen de adquisición">
        {views.map(([key, label]) => <button type="button" className="tab" key={key} aria-pressed={view === key} data-active={view === key}
          onClick={() => { if (key === view) return; setView(key); setRoute(key === 'Inbound' ? 'compact' : 'summary'); setSource(null); setIndustry(null); setBreakdown(key === 'Inbound' ? 'ad' : 'industry'); setRankMetric(key === 'Inbound' ? 'Deals' : 'Ganados'); setRankByRate(false); resetGroup(); }}>{label}</button>)}
      </div>
      <div className="pipeline-analysis-filters">
        <label>Fuente de creación<select value={source === null ? '' : `source:${source}`} onChange={event => {
          const value = event.target.value;
          setSource(value ? value.slice(7) : null); setIndustry(null); resetGroup(); if (isInbound) setRoute('compact');
        }}><option value="">Todas las fuentes</option>{sources.map(([value, label]) => <option key={value} value={`source:${value}`}>{label}</option>)}</select></label>
        <label>Industria<select value={industry ?? ''} onChange={event => { setIndustry(event.target.value || null); resetGroup(); if (isInbound) setRoute('compact'); }}>
          <option value="">Todas las industrias</option>{industries.map(value => <option key={value}>{value}</option>)}</select></label>
        {!isInbound && routeControl}
      </div>
    </div>
    <div className="pipeline-analysis-meta">
      <span>{rangeLabel} por fecha de creación · {number.format(isInbound ? scoped.length : deals.length)} deals · {formatDate.format(new Date(report.readAt))}</span>

      {view === 'Inbound' && <a href={hubSpotAdsUrl} target="_blank" rel="noreferrer">Anuncios en HubSpot ↗</a>}
    </div>
    {isInbound && <>
      <dl className="pipeline-analysis-coverage" aria-label="Cobertura Inbound de la cohorte filtrada">
        <div><dt>Deals inbound</dt><dd>{number.format(scoped.length)}</dd></div>
        <div><dt>Con anuncio identificado</dt><dd>{number.format(coverage.tracked.length)}{scoped.length > 0 && <small>{percent.format(coverage.tracked.length / scoped.length)} del total</small>}</dd></div>
        <div><dt>Sin anuncio rastreado</dt><dd>{number.format(coverage.untracked)}</dd></div>
        {coverage.pending > 0 && <div><dt>Lectura de contactos pendiente</dt><dd>{number.format(coverage.pending)}</dd></div>}
      </dl>
      {coverage.tracked.length > 0 && <p className="pipeline-analysis-note">
        {number.format(coverage.named)} de {number.format(coverage.tracked.length)} con nombre · {number.format(coverage.formatted)} de {number.format(coverage.tracked.length)} con formato verificado.
      </p>}
      {ranking}
      <div className="pipeline-analysis-graph-heading">
        <h3 ref={graphHeading} tabIndex={-1} className="pulse-h2">Recorrido del pipeline</h3>
        <div className="pipeline-analysis-filters">{routeControl}</div>
      </div>
    </>}
    {activeLabel && <div className="pipeline-analysis-route" aria-live="polite">
      <strong>Ruta de {activeLabel}</strong>
      <span>{number.format(deals.length)} deals de esta ruta · {number.format(deals.filter(wasWon).length)} ganados · {number.format(deals.filter(wasInService).length)} llegaron a E8</span>
      <button type="button" className="tab" onClick={event => open(`Ruta de ${activeLabel}`, deals, event.currentTarget)}>Ver deals de esta ruta</button>
      <button type="button" className="tab" onClick={dismissRoute}>Quitar filtro de ruta</button>
    </div>}
    {view === 'Outbound' && <label className="pipeline-analysis-note">
      <input type="checkbox" checked={includeProspecting} onChange={event => {
        setIncludeProspecting(event.target.checked); setSource(null); setIndustry(null); resetGroup();
      }} /> Incluir prospección SDR sin clasificar{unconfirmed > 0 && ` · ${number.format(unconfirmed)} deals en esta vista`}
    </label>}
    {deals.length > 0 ? <>
      <p className="pipeline-analysis-note">{addPath
        ? 'Selecciona una barra o un flujo para empezar otro recorrido.'
        : trace
          ? 'Selecciona otro punto del recorrido para acotarlo. Vuelve a pulsar un punto marcado para quitarlo.'
          : 'Selecciona una barra o un flujo para iluminar el recorrido de sus deals.'}</p>
      {trace && <div className="pipeline-analysis-route pipeline-analysis-trace-controls">
        <strong role="status">{number.format(tracedDeals.length)} deals resaltados · {number.format(tracedDeals.filter(wasWon).length)} ganados · {number.format(tracedDeals.filter(wasInService).length)} llegaron a servicio</strong>
        <div className="pipeline-analysis-trace-actions">
          <button type="button" className="tab" onClick={event => open('Deals del recorrido resaltado', tracedDeals, event.currentTarget)}>Ver deals de la traza</button>
          <button type="button" className="tab" aria-pressed={addPath} onClick={() => setAddPath(!addPath)}>{addPath ? 'Cancelar nuevo camino' : 'Añadir otro camino'}</button>
          {compact && <button type="button" className="tab" onClick={() => setRoute('summary')}>Recorrido completo</button>}
          <button type="button" className="tab" onClick={clearTrace}>Limpiar trazado</button>
        </div>
        <ul aria-label="Caminos resaltados">
          {paths.map((path, index) => {
            const label = path.map(point => point.label).join(' · ');
            return <li key={index}><span>{label}</span>
              {paths.length > 1 && <button type="button" className="tab" aria-label={`Quitar camino ${index + 1}: ${label}`}
                onClick={() => { setPaths(paths.filter((_, position) => position !== index)); setAddPath(false); }}>×</button>}
            </li>;
          })}
        </ul>
      </div>}
      <div className="pipeline-analysis-scroll" role="region" tabIndex={0} aria-label="Sankey desplazable horizontalmente">
        <div className="pipeline-analysis-flow" style={{ minWidth: width }}>
          <div className="pipeline-analysis-columns" style={{ gridTemplateColumns: `${100 * firstWidth / width}% repeat(${graph.columns.length - 1}, minmax(0, 1fr))` }}>
            {graph.columns.map(column => <span key={column.title}>{column.title}</span>)}
          </div>
          <svg viewBox={`0 0 ${width} ${graph.height}`} width="100%" style={{ display: 'block' }} aria-label="Flujos por hitos" data-tracing={Boolean(trace)}>
            {graph.links.map(link => {
              const { source: start, target, members } = link;
              const key = edgeKey(link);
              const title = `${start.name} → ${target.name}`;
              const action = () => traceLink(link);
              return <path key={key} className="pipeline-analysis-link" role="button" tabIndex={0}
                data-tone={isInbound ? flowTone(target.name) ?? flowTone(start.name) : undefined}
                data-muted={!isInbound && (start.name === 'Sin registro' || target.name === 'Sin registro')}
                aria-label={`${title} · ${members.length} deals`} aria-pressed={currentPath?.some(point => point.key === key) ?? false}
                d={ribbon(link)}
                onClick={action} onKeyDown={event => activate(event, action)}>
                <title>{title} · {members.length} deals</title>
              </path>;
            })}
            {trace?.links.map(link => <path key={edgeKey(link)} className="pipeline-analysis-traced-link"
              data-tone={flowTone(link.target.name) ?? flowTone(link.source.name)} d={ribbon(link)} aria-hidden="true" onClick={() => traceLink(link)} />)}
            {graph.columns.flatMap((column, index) => column.nodes.map(node => {
              const x = columnX(index) + 11;
              const y = node.y + node.height / 2;
              const title = `${column.title} · ${node.name}`;
              const isOrigin = index === 0;
              const isAd = view === 'Inbound' && isOrigin;
              const display = node.name.startsWith('Anuncio Meta ') ? node.name.slice('Anuncio Meta '.length) : node.name;
              const label = isAd ? splitAdLabel(display) : [display.length > 21 ? `${display.slice(0, 20)}…` : display];
              const first = node.members[0];
              const detail = isAd && first && node.key === adKey(first) ? adSubtitle(first) : '';
              const adId = isAd && detail ? first?.adId : null;
              const adInfo = adId && first ? ` · ${creativeFormat(first)} · ID ${adId}` : '';
              const labelTop = isAd ? -19 : -17;
              const boxHeight = isAd ? 54 : 34;
              const key = JSON.stringify([column.title, node.key]);
              const tracedCount = trace?.counts.get(node);
              const action = () => selectTrace(key, node.name, node.members);
              return <g key={key} className="pipeline-analysis-node" role="button" tabIndex={0}
                data-tone={isInbound ? flowTone(node.name) : undefined} data-muted={!isInbound && node.name === 'Sin registro'}
                data-outside-trace={tracedCount === 0} aria-pressed={currentPath?.some(point => point.key === key) ?? false}
                aria-label={`${title}${adInfo} · ${node.members.length} deals${tracedCount ? ` · ${tracedCount} resaltados` : ''}`}
                onClick={action} onKeyDown={event => activate(event, action)}>
                <title>{title}{adInfo} · {node.members.length} deals</title>
                <rect x={x + 13} y={y - boxHeight / 2} width={isAd ? 252 : 136} height={boxHeight} rx="4" className="pipeline-analysis-label-bg" />
                <rect x={x} y={node.y} width={13} height={Math.max(1, node.height)} rx="2" />
                <text x={x + 19} y={isAd ? y + labelTop + 5 : y - 2}>{label.map((line, lineIndex) =>
                  <tspan key={lineIndex} x={x + 19} dy={lineIndex ? 13 : 0}>{line}</tspan>)}</text>
                {detail && <text x={x + 19} y={y + 12} className="pipeline-analysis-count">{detail}</text>}
                <text x={x + 19} y={y + (isAd ? (detail ? 23 : 15) : 12)} className="pipeline-analysis-count">{tracedCount ? `${number.format(tracedCount)} de ${number.format(node.members.length)}` : number.format(node.members.length)}{isAd ? ' deals' : ''}</text>
              </g>;
            }))}
          </svg>
        </div>
      </div>
      <p className="pipeline-analysis-note">
        {!isInbound && contactRead < deals.length && `${number.format(deals.length - contactRead)} deals con lectura de contactos pendiente. `}
        {report.undated > 0 && `${number.format(report.undated)} deals fuera de la cohorte por fecha de creación ausente o inválida.`}
      </p>
    </> : <p className="empty-state">No hay deals para estos filtros.{report.undated > 0 && ` Hay ${report.undated} registros con fecha de creación sin verificar en el alcance seleccionado.`}</p>}

    {!isInbound && ranking}
    {methodology}

    <Dialog open={Boolean(drill)} onOpenChange={open => { if (!open) setDrill(null); }}>
      {drill && <DialogContent className="pipeline-analysis-dialog" onCloseAutoFocus={event => {
        const trigger = returnFocus.current;
        if (trigger?.isConnected && (trigger instanceof HTMLElement || trigger instanceof SVGElement)) { event.preventDefault(); trigger.focus(); }
      }}>
        <div className="pipeline-analysis-dialog-heading">
          <DialogTitle>{drill.title}</DialogTitle>
          <CopyDealLinksButton
            title="Copiar lista de deals"
            getDeals={() => drill.deals.map(deal => ({ name: deal.name, url: dealUrl(deal.id) }))}
          />
        </div>
        <DialogDescription>{number.format(drill.deals.length)} deals de la cohorte · {rangeLabel}</DialogDescription>
        <div className="pipeline-analysis-scroll" tabIndex={0} role="region" aria-label="Negocios incluidos">
          <table className="pipeline-analysis-table">
            <thead><tr>{['Deal', 'Industria', 'Fuente', 'Etapa actual', 'Tipo', 'Anuncio / rol'].map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead>
            <tbody>{drill.deals.map(deal => <tr key={deal.id}>
              <th scope="row"><a href={dealUrl(deal.id)} target="_blank" rel="noreferrer">{deal.name} ↗</a></th>
              <td>{deal.industry}</td><td>{deal.sourceLabel}</td><td>{STAGES[deal.stage as StageId] ?? 'Etapa sin clasificar'}</td>
              <td>{deal.dealType}</td><td>{deal.motion === 'Inbound' ? adLabel(deal) : deal.role}{deal.creative && <small>{creativeFormat(deal)} · {deal.adId}</small>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </DialogContent>}
    </Dialog>
  </section>;
}

function activate(event: KeyboardEvent, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
}
