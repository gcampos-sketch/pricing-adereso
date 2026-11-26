import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { getPipelineAnalysis } from '@/lib/pipeline-analysis.functions';
import {
  STAGES, adKey, adLabel, creativeFormat, hasStage, isProspectingCandidate, layoutPipelineFlow, meetingBooked, meetingHeld, pipelineColumns,
  reachedCommercial, serviceToChurn, wasInService, wasLost, wasWon,
  type PipelineDeal, type PipelineReport, type RouteDetail, type StageId, type View,
} from '@/lib/pipeline-analysis';
import type { RoleFilter } from '@/lib/owner-roles';
import './PipelineAnalysis.css';

const hubSpotAdsUrl = 'https://app.hubspot.com/ads/23480943/';
const number = new Intl.NumberFormat('es-CL');
const percent = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 });
const formatDate = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Coyhaique', dateStyle: 'medium', timeStyle: 'short' });
const views = [['all', 'Todo el pipeline'], ['Inbound', 'Inbound'], ['Outbound', 'Outbound'], ['Sin clasificar', 'Sin clasificar']] as const;
const routes = [['summary', 'Recorrido completo'], ['sdr', 'Detalle SDR'], ['sales', 'Detalle Comercial'], ['activation', 'Detalle activación']] as const;

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

export function PipelineAnalysisView({ report, rangeLabel, segment }: { report: PipelineReport; rangeLabel: string; segment?: string | undefined }) {
  const [view, setView] = useState<View>('all');
  const [includeProspecting, setIncludeProspecting] = useState(true);
  const [rankByRate, setRankByRate] = useState(false);
  const [route, setRoute] = useState<RouteDetail>('summary');
  const [source, setSource] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown>('industry');
  const [focus, setFocus] = useState<string | null>(null);
  const [origin, setOrigin] = useState<{ label: string; ids: Set<string> } | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const returnFocus = useRef<Element | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [rankMetric, setRankMetric] = useState<(typeof metrics)[number][0]>('Ganados');

  const population = useMemo(() => report.deals.filter(deal =>
    (!segment || !segmentNames[segment] || deal.segment === segmentNames[segment]) && (view === 'all' || deal.motion === view || (view === 'Outbound' && includeProspecting && isProspectingCandidate(deal)))),
  [report.deals, segment, view, includeProspecting]);
  const sources = useMemo(() => [...new Map(population.map(deal => [deal.source, deal.sourceLabel])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'es')), [population]);
  const bySource = useMemo(() => population.filter(deal => source === null || deal.source === source), [population, source]);
  const industries = useMemo(() => options(bySource, deal => deal.industry), [bySource]);
  const scoped = useMemo(() => bySource.filter(deal => industry === null || deal.industry === industry), [bySource, industry]);
  const [groupLabel, groupBy] = breakdowns[breakdown];
  const deals = useMemo(() => scoped.filter(deal => (focus === null || groupBy(deal) === focus) && (!origin || origin.ids.has(deal.id))), [scoped, focus, groupBy, origin]);
  const graph = useMemo(() => layoutPipelineFlow(deals, pipelineColumns(view, route)), [deals, view, route]);
  const buckets = useMemo(() => {
    const groups = new Map<string, PipelineDeal[]>();
    for (const deal of scoped) {
      const name = groupBy(deal);
      const rows = groups.get(name) ?? [];
      rows.push(deal);
      groups.set(name, rows);
    }
    const index = metrics.findIndex(([name]) => name === rankMetric);
    return [...groups].map(([key, rows]) => {
      const first = rows[0]!;
      const name = breakdown === 'ad' ? adLabel(first) : key;
      const detail = breakdown === 'ad' && first.adId ? [creativeFormat(first), first.creative ? first.adId : ''].filter(Boolean).join(' · ') : '';
      const counts = metrics.map(([, test]) => rows.filter(test).length);
      const rankCount = counts[index] ?? 0;
      return { key, name, detail, rows, counts, rankCount, rate: rankCount / rows.length };
    }).sort((a, b) => (rankByRate ? b.rate - a.rate : b.rankCount - a.rankCount) ||
      b.rows.length - a.rows.length || a.name.localeCompare(b.name, 'es'));
  }, [scoped, breakdown, groupBy, rankMetric, rankByRate]);

  function open(title: string, members: PipelineDeal[], trigger: Element) {
    returnFocus.current = trigger;
    setDrill({ title, deals: members });
  }

  const contactRead = deals.filter(deal => deal.contactRead).length;
  const unconfirmed = deals.filter(isProspectingCandidate).length;
  const ads = deals.filter(deal => deal.adId).length;
  const enrichedAds = deals.filter(deal => deal.creative).length;
  const verifiedFormats = deals.filter(deal => deal.creative?.format).length;
  const firstWidth = view === 'Inbound' ? 232 : 164;
  const width = firstWidth + (graph.columns.length - 1) * 164;
  const columnX = (index: number) => index === 0 ? 0 : firstWidth + (index - 1) * 164;
  const activeLabel = origin?.label ?? (focus && (buckets.find(row => row.key === focus)?.name ?? focus));
  const clearRoute = () => { setFocus(null); setOrigin(null); };
  const resetGroup = () => { clearRoute(); setExpanded(false); };
  return <section className="pipeline-analysis" aria-label="Sankey de pipeline comercial">
    <div className="pipeline-analysis-controls">
      <div className="tabs" role="group" aria-label="Origen de adquisición">
        {views.map(([key, label]) => <button type="button" className="tab" key={key} aria-pressed={view === key} data-active={view === key}
          onClick={() => { setView(key); setSource(null); setIndustry(null); setBreakdown(key === 'Inbound' ? 'ad' : 'industry'); setRankMetric(key === 'Inbound' ? 'Deals' : 'Ganados'); setRankByRate(false); resetGroup(); }}>{label}</button>)}
      </div>
      <div className="pipeline-analysis-filters">
        <label>Fuente de creación<select value={source === null ? '' : `source:${source}`} onChange={event => {
          const value = event.target.value;
          setSource(value ? value.slice(7) : null); setIndustry(null); resetGroup();
        }}><option value="">Todas las fuentes</option>{sources.map(([value, label]) => <option key={value} value={`source:${value}`}>{label}</option>)}</select></label>
        <label>Industria<select value={industry ?? ''} onChange={event => { setIndustry(event.target.value || null); resetGroup(); }}>
          <option value="">Todas las industrias</option>{industries.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Vista del recorrido<select value={route} onChange={event => setRoute(event.target.value as RouteDetail)}>
          {routes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
    </div>
    <div className="pipeline-analysis-meta">
      <span>{rangeLabel} por fecha de creación · {number.format(deals.length)} deals · {formatDate.format(new Date(report.readAt))}</span>

      {view === 'Inbound' && <a href={hubSpotAdsUrl} target="_blank" rel="noreferrer">Anuncios en HubSpot ↗</a>}
    </div>
    {activeLabel && <div className="pipeline-analysis-route" aria-live="polite">
      <strong>Ruta de {activeLabel}</strong>
      <span>{number.format(deals.length)} deals · {number.format(deals.filter(wasWon).length)} ganados · {number.format(deals.filter(wasInService).length)} llegaron a E8</span>
      <button type="button" className="tab" onClick={event => open(`Ruta de ${activeLabel}`, deals, event.currentTarget)}>Ver deals de esta ruta</button>
      <button type="button" className="tab" onClick={clearRoute}>Quitar filtro de ruta</button>
    </div>}
    {view === 'Outbound' && <label className="pipeline-analysis-note">
      <input type="checkbox" checked={includeProspecting} onChange={event => {
        setIncludeProspecting(event.target.checked); setSource(null); setIndustry(null); resetGroup();
      }} /> Incluir prospección SDR sin clasificar{unconfirmed > 0 && ` · ${number.format(unconfirmed)} deals en esta vista`}
    </label>}
    {deals.length > 0 ? <>
      <p className="pipeline-analysis-note">El ancho representa cantidad de deals. Cada columna muestra evidencia registrada del hito. Pulsa un bloque de origen para aislar su ruta completa. Las conexiones y los demás bloques abren el detalle de deals.</p>
      <div className="pipeline-analysis-scroll" role="region" tabIndex={0} aria-label="Sankey desplazable horizontalmente">
        <div style={{ minWidth: width }}>
          <div className="pipeline-analysis-columns" style={{ gridTemplateColumns: `${firstWidth}px repeat(${graph.columns.length - 1}, minmax(0, 1fr))` }}>
            {graph.columns.map(column => <span key={column.title}>{column.title}</span>)}
          </div>
          <svg viewBox={`0 0 ${width} ${graph.height}`} width="100%" style={{ display: 'block' }} aria-label="Flujos por hitos">
            {graph.links.map(({ depth, source: start, target, width: thickness, y1, y2, members }) => {
              const x1 = columnX(depth) + 24, x2 = columnX(depth + 1) + 11, mid = (x1 + x2) / 2;
              const title = `${start.name} → ${target.name}`;
              return <path key={JSON.stringify([depth, start.key, target.key])} className="pipeline-analysis-link" role="button" tabIndex={0}
                data-muted={start.name === 'Sin registro' || target.name === 'Sin registro'}
                aria-label={`${title} · ${members.length} deals`}
                d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2} L${x2},${y2 + thickness} C${mid},${y2 + thickness} ${mid},${y1 + thickness} ${x1},${y1 + thickness} Z`}
                onClick={event => open(title, members, event.currentTarget)} onKeyDown={event => activate(event, () => open(title, members, event.currentTarget))}>
                <title>{title} · {members.length} deals</title>
              </path>;
            })}
            {graph.columns.flatMap((column, index) => column.nodes.map(node => {
              const x = columnX(index) + 11;
              const y = node.y + node.height / 2;
              const title = `${column.title} · ${node.name}`;
              const isOrigin = index === 0;
              const isAd = view === 'Inbound' && isOrigin;
              const display = node.name.startsWith('Anuncio Meta ') ? node.name.slice('Anuncio Meta '.length) : node.name;
              const max = isAd ? 32 : 21;
              const label = display.length > max ? `${display.slice(0, max - 1)}…` : display;
              const detail = node.detail && (node.detail.length > 25 ? `${node.detail.slice(0, 24)}…` : node.detail);
              const action = (trigger: Element) => {
                if (isOrigin) {
                  setOrigin({ label: isAd && node.key !== node.name && node.key.startsWith('Anuncio Meta ') ? `${node.name} · ${node.key.slice(13)}` : node.name, ids: new Set(node.members.map(deal => deal.id)) });
                  setRoute('summary');
                } else open(title, node.members, trigger);
              };
              return <g key={JSON.stringify([index, node.key])} className="pipeline-analysis-node" role="button" tabIndex={0}
                data-muted={node.name === 'Sin registro'} aria-label={`${isOrigin ? 'Ver ruta completa de ' : ''}${title}${node.detail ? ` · ${node.detail}` : ''} · ${node.members.length} deals`}
                onClick={event => action(event.currentTarget)} onKeyDown={event => activate(event, () => action(event.currentTarget))}>
                <title>{title}{node.detail && ` · ${node.detail}`}{isAd && node.key !== node.name && ` · ${node.key}`} · {node.members.length} deals</title>
                <rect x={x + 13} y={y - (detail ? 22 : 17)} width={isAd ? 204 : 136} height={detail ? 44 : 34} rx="4" className="pipeline-analysis-label-bg" />
                <rect x={x} y={node.y} width={13} height={Math.max(1, node.height)} rx="2" />
                <text x={x + 19} y={y - (detail ? 9 : 2)}>{label}</text>
                {detail && <text x={x + 19} y={y + 4} className="pipeline-analysis-count">{detail}</text>}
                <text x={x + 19} y={y + (detail ? 17 : 12)} className="pipeline-analysis-count">{number.format(node.members.length)}</text>
              </g>;
            }))}
          </svg>
        </div>
      </div>
      <p className="pipeline-analysis-note">
        {contactRead < deals.length && `${number.format(deals.length - contactRead)} deals con lectura de contactos pendiente. `}
        {view === 'Inbound' && `${number.format(ads)}/${number.format(deals.length)} con ID de anuncio rastreado antes de su creación. `}
        {view === 'Inbound' && ads > 0 && (report.creativeCatalogStatus === 'ready'
          ? `${number.format(enrichedAds)}/${number.format(ads)} deals con nombre de anuncio. ${number.format(verifiedFormats)}/${number.format(ads)} con formato verificado. `
          : 'Catálogo de anuncios pendiente. Los anuncios rastreados se muestran por ID. ')}
        {report.undated > 0 && `${number.format(report.undated)} deals fuera de la cohorte por fecha de creación ausente o inválida.`}
      </p>
    </> : <p className="empty-state">No hay deals para estos filtros.{report.undated > 0 && ` Hay ${report.undated} registros con fecha de creación sin verificar en el alcance seleccionado.`}</p>}

    <div className="pipeline-analysis-ranking">
      <h3 className="pulse-h2">Conversión por segmento</h3>
      <div className="pipeline-analysis-filters">
        <label>Comparar por<select value={breakdown} onChange={event => { setBreakdown(event.target.value as Breakdown); resetGroup(); }}>
          {Object.entries(breakdowns).filter(([key]) => view === 'Inbound' || key !== 'format').map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Ordenar por<select value={rankMetric} onChange={event => { const metric = event.target.value as typeof rankMetric; setRankMetric(metric); if (metric === 'Deals') setRankByRate(false); }}>
          {metrics.map(([label]) => <option key={label}>{label}</option>)}</select></label>
        <label>Medida<select disabled={rankMetric === 'Deals'} value={rankByRate ? 'rate' : 'count'} onChange={event => setRankByRate(event.target.value === 'rate')}>
          <option value="count">Cantidad</option><option value="rate">Porcentaje de la cohorte</option>
        </select></label>
      </div>
      {!!buckets.length && <div className="pipeline-analysis-scroll" tabIndex={0} role="region" aria-label="Tabla de conversión desplazable horizontalmente">
        <table className="pipeline-analysis-table">
          <thead><tr><th scope="col">{groupLabel}</th><th scope="col">Deals</th>{metrics.slice(1).map(([name]) => <th scope="col" key={name}>{name}</th>)}</tr></thead>
          <tbody>{buckets.slice(0, expanded ? undefined : 10).map(({ key, name, detail, rows, counts }) => <tr key={key} data-active={focus === key}>
            <th scope="row"><button className="pipeline-analysis-row" type="button" aria-pressed={focus === key} onClick={() => { setOrigin(null); setFocus(focus === key ? null : key); setRoute('summary'); }}>{name}</button>{detail && <small>{detail}</small>}</th>
            <td><button className="pipeline-analysis-row" type="button" onClick={event => open(name, rows, event.currentTarget)}>{number.format(rows.length)}</button></td>
            {metrics.slice(1).map(([label, test], index) => {
              const count = counts[index + 1] ?? 0;
              return <td key={label}>{count ? <button className="pipeline-analysis-row" type="button" aria-label={`${name} · ${label} · ${count} deals`}
                onClick={event => open(`${name} · ${label}`, rows.filter(test), event.currentTarget)}>
                {number.format(count)} <small>{percent.format(count / rows.length)}</small>
              </button> : '0'}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>}
      {buckets.length > 10 && <button type="button" className="tab" onClick={() => setExpanded(!expanded)}>{expanded ? 'Ver menos' : `Ver los ${buckets.length} grupos`}</button>}
      <details><summary>Cómo se calculan las conversiones</summary>
        <p>Los porcentajes usan todos los deals de la fila como base, incluidos los abiertos. Selecciona el nombre del grupo para seguir su recorrido en el Sankey.</p>
        <p>Se cuenta un deal por ID. El período usa la creación del deal. Las etapas usan su última entrada registrada o su etapa actual. Un deal puede tener un ganado histórico y una pérdida posterior. Churn tras E8 requiere ambas fechas en ese orden y Churn como etapa actual.</p>
        <p>En inbound el anuncio se identifica por el ID de Meta del primer enlace rastreado del contacto asociado, con visita anterior o igual a la creación del deal. El nombre y el formato se cruzan por ID exacto con el catálogo privado de anuncios. La vista previa de HubSpot permite verificar el formato. En outbound el rol usa las etiquetas deal-contacto, con prioridad para los contactos marcados como Key Contact. La fuente Prospección SDR permite explorar negocios sin clasificación confirmada y conserva su etiqueta en el recorrido.</p>
      </details>
    </div>

    <Dialog open={Boolean(drill)} onOpenChange={open => { if (!open) setDrill(null); }}>
      {drill && <DialogContent className="pipeline-analysis-dialog" onCloseAutoFocus={event => {
        const trigger = returnFocus.current;
        if (trigger?.isConnected && (trigger instanceof HTMLElement || trigger instanceof SVGElement)) { event.preventDefault(); trigger.focus(); }
      }}>
        <DialogTitle>{drill.title}</DialogTitle>
        <DialogDescription>{number.format(drill.deals.length)} deals de la cohorte · {rangeLabel}</DialogDescription>
        <div className="pipeline-analysis-scroll" tabIndex={0} role="region" aria-label="Negocios incluidos">
          <table className="pipeline-analysis-table">
            <thead><tr>{['Deal', 'Industria', 'Fuente', 'Etapa actual', 'Tipo', 'Anuncio / rol'].map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead>
            <tbody>{drill.deals.map(deal => <tr key={deal.id}>
              <th scope="row"><a href={`https://app.hubspot.com/contacts/23480943/record/0-3/${deal.id}?utm_source=hub_comercial&utm_medium=pipeline_analysis`} target="_blank" rel="noreferrer">{deal.name} ↗</a></th>
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
