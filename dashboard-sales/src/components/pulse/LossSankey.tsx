import { useId, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, Sankey } from 'recharts';
import { buildLossSankey, lossSankeyColumns, type LossSankeyNode, type LossSankeyLink, type LossSankeyGrouping } from '@/lib/loss-sankey';
import type { InsightDeal } from '@/lib/insights-types';
import { lossSankeyMonths, scopeLossSankey, type LossDateBasis } from '@/lib/loss-sankey-scope';
import { money } from './insights-shared';
import { ACTIVITY_CHANNELS, activityChannels } from '@/lib/deal-activity-analysis';
import { lossActivityTotals, type LossActivityChannel } from '@/lib/loss-sankey-activity';
import { useLossSankeyActivity } from '@/hooks/use-loss-sankey-activity';

type NodeShape = { x: number; y: number; width: number; height: number; payload: LossSankeyNode };
type LinkShape = { sourceX: number; sourceY: number; targetX: number; targetY: number; sourceControlX: number; targetControlX: number; linkWidth: number; payload: Omit<LossSankeyLink, 'source' | 'target'> & { source: LossSankeyNode; target: LossSankeyNode } };
const COLORS = { owner: '#d8bd6f', stage: '#a79bd6', reason: '#79b4b5', activity: '#d99377' };
const monthFormat = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatMonth = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));
const quantity = (count: number) => `${count} ${count === 1 ? 'deal' : 'deals'}`;

export function LossSankey({ deals, periods, scope, readAt, entryDatesAvailable, onOpen, onWarning }: {
  deals: InsightDeal[]; periods: string[]; scope: string; readAt: string; entryDatesAvailable: boolean;
  onWarning: (deals: InsightDeal[], basis: LossDateBasis) => void;
  onOpen: (title: string, deals: InsightDeal[], basis: LossDateBasis, reasonDetail: boolean, monthLabel: string) => void;
}) {
  const origin = 'all' as const;
  const coverageHelpId = useId();
  const [grouping, setGrouping] = useState<LossSankeyGrouping>('owner');
  const activityMode = grouping === 'activity';
  const columns = lossSankeyColumns(grouping);
  const [channel, setChannel] = useState<LossActivityChannel>('all');
  const [reasonFilter, setReasonFilter] = useState<{ reason: string; scope: string } | null>(null);
  const reasonSelect = useRef<HTMLSelectElement>(null);
  const columnLabels = {
    owner: grouping === 'team' ? 'Equipo' : 'Comercial',
    reason: 'Motivo de pérdida',
    stage: activityMode ? 'Etapa anterior verificada' : 'Etapa al perderse',
    activity: 'Actividades por deal',
  };
  const [basis, setBasis] = useState<LossDateBasis>('entry');
  const [month, setMonth] = useState('');
  const months = useMemo(() => lossSankeyMonths(periods), [periods]);
  const selectedMonth = months.includes(month) ? month : '';
  const monthLabel = selectedMonth ? formatMonth(selectedMonth) : '';
  const filtered = useMemo(() => scopeLossSankey(deals, { periods, origin, basis, readAt, month: selectedMonth }),
    [deals, periods, origin, basis, readAt, selectedMonth]);
  const coverageExplanation = `Entre los perdidos disponibles con estos filtros de origen, comercial, rol y etapa, estos deals no tienen ${basis === 'entry' ? 'una entrada a perdido verificable' : 'una fecha de cierre válida'}. Se excluyen del Sankey sin asignarlos al período. Pulsa para revisar sus deals.`;
  const reasonScope = JSON.stringify([scope, periods, basis]);
  const selectReason = (reason: string | null) => setReasonFilter(reason === null ? null : { reason, scope: reasonScope });
  const activeReason = activityMode && reasonFilter?.scope === reasonScope ? reasonFilter.reason : null;
  const reasons = useMemo(() => [...new Set(filtered.periodDeals.map(deal => deal.lostReason || ''))]
    .sort((a, b) => a.localeCompare(b, 'es')), [filtered]);
  const selectedReason = activeReason !== null && reasons.includes(activeReason) ? activeReason : null;
  const activityDeals = useMemo(() => selectedReason === null ? filtered.deals
    : filtered.deals.filter(deal => (deal.lostReason || '') === selectedReason), [filtered, selectedReason]);
  const activity = useLossSankeyActivity(filtered.deals, readAt, activityMode);
  const evidence = activity.data?.evidence;
  const loadingActivity = activityMode && activity.isPending && activityDeals.length > 0;
  const graph = useMemo(() => buildLossSankey(activityDeals, grouping, { evidence, channel }),
    [activityDeals, grouping, evidence, channel]);
  const context = JSON.stringify([scope, readAt, origin, basis, selectedMonth, grouping, channel, selectedReason, graph.deals.map(deal => deal.id)]);
  type Inspection = { key: string; title: string; count: number; amount: number; deals: InsightDeal[]; isolatesReason?: boolean };
  const [inspection, setInspection] = useState<(Inspection & { context: string }) | null>(null);
  const hover = inspection?.context === context ? inspection : null;
  const setHover = (value: Inspection | null) => setInspection(value ? { ...value, context } : null);
  const open = (title: string, rows: InsightDeal[], reasonDetail = false) => onOpen(title, rows, basis, reasonDetail, monthLabel);
  const activityTotals = activityMode && evidence ? lossActivityTotals(hover?.deals ?? graph.deals, evidence) : [];
  const maxNodes = Math.max(...columns.map(kind => graph.nodes.filter(node => node.kind === kind).length));
  const height = activityMode ? Math.max(420, maxNodes * 44 + 32) : Math.max(420, maxNodes * 36 + 20);
  const keyboard = (event: React.KeyboardEvent<SVGElement>, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
  };
  return <section className="rep-chart loss-sankey" aria-label="Sankey de deals perdidos">
    <div className="loss-sankey-heading"><div><h2 className="pulse-h2">¿Dónde se pierden los deals?</h2><p>{scope}{monthLabel && ` · ${monthLabel}`} · {basis === "entry" ? "Por entrada a perdido" : "Por cierre"} · {quantity(graph.deals.length)} · {money(graph.deals.reduce((total, deal) => total + deal.amountValue, 0))} MRR</p></div>
      <span className="loss-sankey-unit">Ancho = cantidad de deals</span></div>
    <div className="loss-sankey-controls">
      <div className="loss-sankey-control"><span>Agrupar</span><div className="tabs" role="group" aria-label="Agrupación del Sankey">
        <button type="button" className="tab" aria-pressed={grouping === 'owner'} data-active={grouping === 'owner'} onClick={() => setGrouping('owner')}>Por comercial</button>
        <button type="button" className="tab" aria-pressed={grouping === 'team'} data-active={grouping === 'team'} onClick={() => setGrouping('team')}>Por equipo</button>
        <button type="button" className="tab" aria-pressed={activityMode} data-active={activityMode} onClick={() => setGrouping('activity')}>Por actividad</button>
      </div></div>
      <div className="loss-sankey-control"><span>Fecha del período</span><div className="tabs" role="group" aria-label="Fecha del Sankey">
        <button type="button" className="tab" aria-pressed={basis === 'entry'} data-active={basis === 'entry'} onClick={() => setBasis('entry')} title="Última entrada registrada a la etapa perdida actual. Sin sustituir fechas ausentes por cierre o creación.">Entrada a deal perdido</button>
        <button type="button" className="tab" aria-pressed={basis === 'close'} data-active={basis === 'close'} onClick={() => setBasis('close')}>Fecha de cierre</button>
      </div></div>
      {months.length > 0 && <label className="loss-sankey-control"><span>Mes</span>
        <select value={selectedMonth} onChange={event => setMonth(event.target.value)}>
          <option value="">Todo el período</option>
          {months.map(option => <option key={option} value={option}>{formatMonth(option)}</option>)}
        </select>
      </label>}
      {activityMode && <>
        <label className="loss-sankey-control"><span>Canal</span>
          <select value={channel} onChange={event => setChannel(event.target.value as LossActivityChannel)}>
            <option value="all">Todos los canales</option>
            {activityChannels.map(key => <option key={key} value={key}>{ACTIVITY_CHANNELS[key]}</option>)}
          </select>
        </label>
        <label className="loss-sankey-control"><span>Motivo</span>
          <select ref={reasonSelect} value={selectedReason === null ? 'all' : `reason:${selectedReason}`} onChange={event => {
            selectReason(event.target.value === 'all' ? null : event.target.value.slice(7));
          }}>
            <option value="all">Todos los motivos</option>
            {reasons.map(reason => <option key={reason} value={`reason:${reason}`}>{reason || 'Sin motivo listado'}</option>)}
          </select>
        </label>
      </>}
    </div>
    <div className="loss-sankey-meta">
      <div className="loss-sankey-inspection" aria-live="polite">
        {hover ? <><strong>{hover.title}</strong><span>{quantity(hover.count)} · {money(hover.amount)} MRR · {hover.isolatesReason ? 'clic para ver el recorrido' : 'clic para ver deals'}</span></>
          : selectedReason !== null ? <span>Recorrido de {selectedReason || 'Sin motivo listado'}</span>
          : <span>{activityMode ? 'Pulsa un motivo para ver su recorrido o una conexión para ver sus deals.' : 'Pulsa un bloque o conexión para ver sus deals.'}</span>}
      </div>
      {selectedReason !== null && <button type="button" className="loss-sankey-warning-link" onClick={() => {
        selectReason(null);
        reasonSelect.current?.focus({ preventScroll: true });
      }}>Ver todos los motivos</button>}
      {basis === 'entry' && !entryDatesAvailable && <span className="loss-sankey-note" role="status" title="La copia actual aún no incluye las fechas de entrada a perdido; no se sustituyen por fechas de cierre.">Actualiza para leer las fechas de entrada.</span>}
      {filtered.missingDates.length > 0 && (basis === 'close' || entryDatesAvailable) && <>
        <button type="button" className="loss-sankey-warning-link" aria-describedby={coverageHelpId} title={coverageExplanation}
          aria-label={`Ver ${quantity(filtered.missingDates.length)} sin ${basis === 'entry' ? 'entrada a perdido verificable' : 'fecha de cierre válida'}`}
          onClick={() => onWarning(filtered.missingDates, basis)}>{filtered.missingDates.length} sin {basis === 'entry' ? 'entrada verificable' : 'fecha de cierre'} ↗</button>
        <span id={coverageHelpId} className="sr-only">{coverageExplanation}</span>
      </>}
    </div>
    {activityMode && (activity.isError || activity.data?.incomplete) && <p className="loss-sankey-note" role="status">
      La consulta de actividad quedó incompleta. <button type="button" className="loss-sankey-warning-link"
        disabled={activity.isFetching} onClick={() => void activity.refetch()}>Volver a consultar</button>
    </p>}
    {!!activityTotals.length && <dl className="loss-sankey-activity-totals" aria-label={hover ? 'Actividad del grupo seleccionado' : 'Actividad de todos los deals del gráfico'}>
      {activityTotals.map(({ channel: key, total, covered }) => <div key={key}>
        <dt>{ACTIVITY_CHANNELS[key]}</dt>
        <dd><strong>{covered ? total.toLocaleString('es-CL') : '—'}</strong> <span>{covered}/{(hover?.deals ?? graph.deals).length} deals verificados</span></dd>
      </div>)}
    </dl>}
    {loadingActivity ? <div className="empty-state" role="status">Consultando historial y actividades en HubSpot…</div>
      : graph.deals.length ? <>
      <div className="loss-sankey-scroll" tabIndex={0} role="region" aria-label={`Diagrama ${columns.map(kind => columnLabels[kind]).join(', ')}; desplazable horizontalmente`}>
        <div className="loss-sankey-canvas">
          <div className="loss-sankey-columns">{columns.map(kind => <span key={kind}>{columnLabels[kind]}</span>)}</div>
          <ResponsiveContainer width="100%" height={height}>
            <Sankey key={grouping} data={graph} nodeWidth={12} nodePadding={24} iterations={48} sort={false} margin={{ top: 12, right: 190, bottom: 12, left: activityMode ? 164 : 120 }}
              node={(props: NodeShape) => {
                const { x, y, width, height: nodeHeight, payload: node } = props;
                const title = `${columnLabels[node.kind]} · ${node.name}`;
                const first = node.kind === columns[0];
                const leftLabelWidth = activityMode ? 156 : 112;
                const labelX = first ? x - 10 : x + width + 10;
                const maxLabel = first && !activityMode ? 17 : 26;
                const isolatesReason = activityMode && node.kind === 'reason' && selectedReason === null;
                const focus = () => setHover({ key: node.key, title, count: node.deals.length, amount: node.amount, deals: node.deals, isolatesReason });
                const activate = (restoreFocus = false) => {
                  if (isolatesReason) {
                    selectReason(node.deals[0]?.lostReason || '');
                    if (restoreFocus) reasonSelect.current?.focus({ preventScroll: true });
                  } else open(title, node.deals, node.kind === 'reason');
                };
                return <g className="loss-sankey-node" role="button" tabIndex={0}
                  aria-label={isolatesReason ? `Ver recorrido de ${node.name} · ${quantity(node.deals.length)}` : `Ver ${quantity(node.deals.length)} · ${title}`}
                  onClick={() => activate()} onKeyDown={event => keyboard(event, () => activate(true))}
                  onMouseEnter={focus} onMouseLeave={() => setHover(null)} onFocus={focus} onBlur={() => setHover(null)}>
                  <title>{`${title} · ${quantity(node.deals.length)} · ${money(node.amount)} MRR`}</title>
                  <rect x={first ? x - leftLabelWidth : x} y={Math.min(y, y + nodeHeight / 2 - 11)} width={first ? leftLabelWidth + width : 190} height={Math.max(nodeHeight, 24)} fill="transparent" />
                  <rect x={x} y={y} width={width} height={Math.max(nodeHeight, 2)} rx={3} fill={COLORS[node.kind]} />
                  <text x={labelX} y={y + nodeHeight / 2 - 2} textAnchor={first ? 'end' : 'start'} className="loss-sankey-label">{node.name.length > maxLabel ? `${node.name.slice(0, maxLabel - 1)}…` : node.name}</text>
                  <text x={labelX} y={y + nodeHeight / 2 + 13} textAnchor={first ? 'end' : 'start'} className="loss-sankey-count">{quantity(node.deals.length)}</text>
                </g>;
              }}
              link={(props: LinkShape) => {
                const { payload: link } = props;
                const title = `${link.source.name} → ${link.target.name}`;
                const focus = () => setHover({ key: `link:${link.key}`, title, count: link.value, amount: link.amount, deals: link.deals });
                return <path className="loss-sankey-link" role="button" tabIndex={0} aria-label={`Ver ${quantity(link.value)} · ${title}`}
                  d={`M${props.sourceX},${props.sourceY} C${props.sourceControlX},${props.sourceY} ${props.targetControlX},${props.targetY} ${props.targetX},${props.targetY}`}
                  fill="none" stroke={COLORS[link.source.kind]} strokeWidth={Math.max(props.linkWidth, 2)} strokeOpacity={hover?.key === `link:${link.key}` ? .85 : .26}
                  onClick={() => open(title, link.deals, link.source.kind === 'reason' || link.target.kind === 'reason')} onKeyDown={event => keyboard(event, () => open(title, link.deals, link.source.kind === 'reason' || link.target.kind === 'reason'))} onMouseEnter={focus} onMouseLeave={() => setHover(null)} onFocus={focus} onBlur={() => setHover(null)}>
                  <title>{`${title} · ${quantity(link.value)} · ${money(link.amount)} MRR`}</title>
                </path>;
              }} />
          </ResponsiveContainer>
        </div>
      </div>
      <p className="loss-sankey-footnote">{activityMode
        ? 'Cada deal cuenta una vez por columna. Los rangos suman actividades verificadas y asociadas al deal desde su creación hasta antes de entrar a perdido. Incluye correos y WhatsApp enviados o recibidos, llamadas con resultado y reuniones realizadas.'
        : 'Cada deal cuenta una vez por columna. La etapa es la registrada al perderse; los flujos muestran agrupaciones, no el recorrido histórico completo.'}</p>
    </> : <div className="empty-state">Sin deals perdidos con estos filtros.</div>}
  </section>;
}
