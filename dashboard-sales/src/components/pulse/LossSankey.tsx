import { useMemo, useState } from 'react';
import { ResponsiveContainer, Sankey } from 'recharts';
import { buildLossSankey, type LossSankeyNode, type LossSankeyLink } from '@/lib/loss-sankey';
import type { InsightDeal } from '@/lib/insights-types';
import { scopeLossSankey, type LossDateBasis } from '@/lib/loss-sankey-scope';
import { money } from './insights-shared';

type NodeShape = { x: number; y: number; width: number; height: number; payload: LossSankeyNode };
type LinkShape = { sourceX: number; sourceY: number; targetX: number; targetY: number; sourceControlX: number; targetControlX: number; linkWidth: number; payload: Omit<LossSankeyLink, 'source' | 'target'> & { source: LossSankeyNode; target: LossSankeyNode } };
const COLORS = { owner: '#d8bd6f', stage: '#a79bd6', reason: '#79b4b5' };
const quantity = (count: number) => `${count} ${count === 1 ? 'deal' : 'deals'}`;

export function LossSankey({ deals, periods, scope, readAt, entryDatesAvailable, onOpen }: {
  deals: InsightDeal[]; periods: string[]; scope: string; readAt: string; entryDatesAvailable: boolean;
  onOpen: (title: string, deals: InsightDeal[], basis: LossDateBasis, reasonDetail?: boolean) => void;
}) {
  const origin = 'all' as const;
  const [basis, setBasis] = useState<LossDateBasis>('entry');
  const filtered = useMemo(() => scopeLossSankey(deals, { periods, origin, basis, readAt }), [deals, periods, origin, basis, readAt]);
  const graph = useMemo(() => buildLossSankey(filtered.deals), [filtered]);
  const context = JSON.stringify([scope, readAt, origin, basis, graph.deals.map(deal => deal.id)]);
  const [inspection, setInspection] = useState<{ context: string; key: string; title: string; count: number; amount: number } | null>(null);
  const hover = inspection?.context === context ? inspection : null;
  const setHover = (value: { key: string; title: string; count: number; amount: number } | null) => setInspection(value ? { ...value, context } : null);
  const open = (title: string, rows: InsightDeal[], reasonDetail = false) => onOpen(title, rows, basis, reasonDetail);
  const height = Math.max(420, Math.max(...(['owner', 'stage', 'reason'] as const).map(kind => graph.nodes.filter(node => node.kind === kind).length)) * 36 + 20);
  const keyboard = (event: React.KeyboardEvent<SVGElement>, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); }
  };
  return <section className="rep-chart loss-sankey" aria-label="Sankey de deals perdidos">
    <div className="loss-sankey-heading"><div><h2>¿Dónde se pierden los deals?</h2><p>{scope} · {basis === "entry" ? "Por entrada a perdido" : "Por cierre"} · {quantity(graph.deals.length)} · {money(graph.deals.reduce((total, deal) => total + deal.amountValue, 0))} MRR</p></div>
      <span className="loss-sankey-unit">Ancho = cantidad de deals</span></div>
    <div className="loss-sankey-controls">
      <div className="loss-sankey-control"><span>Fecha del período</span><div className="tabs" role="group" aria-label="Fecha del Sankey">
        <button type="button" aria-pressed={basis === 'entry'} data-active={basis === 'entry'} onClick={() => setBasis('entry')} title="Última entrada registrada a la etapa perdida actual. Sin sustituir fechas ausentes por cierre o creación.">Entrada a deal perdido</button>
        <button type="button" aria-pressed={basis === 'close'} data-active={basis === 'close'} onClick={() => setBasis('close')}>Fecha de cierre</button>
      </div></div>
    </div>
    <p className="loss-sankey-help">El período y el equipo vienen de los filtros principales. Este control cambia solo el Sankey.</p>
    {basis === 'entry' && !entryDatesAvailable && <p className="loss-sankey-coverage" role="status">La copia actual aún no incluye las fechas de entrada a perdido. Actualiza el dashboard para leerlas; no se sustituyen por fechas de cierre.</p>}
    {filtered.missingDates.length > 0 && (basis === 'close' || entryDatesAvailable) && <p className="loss-sankey-coverage">{quantity(filtered.missingDates.length)} sin {basis === 'entry' ? 'entrada a perdido verificable' : 'fecha de cierre válida'} entre los perdidos disponibles con estos filtros de origen, comercial, rol y etapa. Se excluyen sin asignarlos al período.</p>}
    <p className="loss-sankey-help">Comercial → etapa al perderse → motivo. Haz clic en un bloque o conexión para ver sus deals.</p>
    {graph.deals.length ? <>
      <div className="loss-sankey-inspection" aria-live="polite">{hover ? <><strong>{hover.title}</strong><span>{quantity(hover.count)} · {money(hover.amount)} MRR · clic para ver deals</span></> : <span>Pasa el cursor por el gráfico para explorar cada grupo.</span>}</div>
      <div className="loss-sankey-scroll" tabIndex={0} role="region" aria-label="Diagrama comercial, etapa y motivo; desplazable horizontalmente">
        <div className="loss-sankey-canvas">
          <div className="loss-sankey-columns"><span>Comercial</span><span>Etapa al perderse</span><span>Motivo</span></div>
          <ResponsiveContainer width="100%" height={height}>
            <Sankey data={graph} nodeWidth={12} nodePadding={24} iterations={48} sort={false} margin={{ top: 12, right: 190, bottom: 12, left: 120 }}
              node={(props: NodeShape) => {
                const { x, y, width, height: nodeHeight, payload: node } = props;
                const title = `${node.kind === 'owner' ? 'Comercial' : node.kind === 'stage' ? 'Etapa al perderse' : 'Motivo'} · ${node.name}`;
                const labelX = node.kind === 'owner' ? x - 10 : x + width + 10;
                const focus = () => setHover({ key: node.key, title, count: node.deals.length, amount: node.amount });
                return <g className="loss-sankey-node" role="button" tabIndex={0} aria-label={`Ver ${quantity(node.deals.length)} · ${title}`} onClick={() => open(title, node.deals, node.kind === 'reason')} onKeyDown={event => keyboard(event, () => open(title, node.deals, node.kind === 'reason'))} onMouseEnter={focus} onMouseLeave={() => setHover(null)} onFocus={focus} onBlur={() => setHover(null)}>
                  <title>{`${title} · ${quantity(node.deals.length)} · ${money(node.amount)} MRR`}</title>
                  <rect x={node.kind === 'owner' ? x - 112 : x} y={Math.min(y, y + nodeHeight / 2 - 11)} width={node.kind === 'owner' ? 124 : node.kind === 'stage' ? 110 : 190} height={Math.max(nodeHeight, 24)} fill="transparent" />
                  <rect x={x} y={y} width={width} height={Math.max(nodeHeight, 2)} rx={3} fill={COLORS[node.kind]} />
                  <text x={labelX} y={y + nodeHeight / 2 - 2} textAnchor={node.kind === 'owner' ? 'end' : 'start'} className="loss-sankey-label">{node.name.length > (node.kind === 'owner' ? 17 : 27) ? `${node.name.slice(0, node.kind === 'owner' ? 15 : 25)}…` : node.name}</text>
                  <text x={labelX} y={y + nodeHeight / 2 + 13} textAnchor={node.kind === 'owner' ? 'end' : 'start'} className="loss-sankey-count">{quantity(node.deals.length)}</text>
                </g>;
              }}
              link={(props: LinkShape) => {
                const { payload: link } = props;
                const title = `${link.source.name} → ${link.target.name}`;
                const focus = () => setHover({ key: `link:${link.key}`, title, count: link.value, amount: link.amount });
                return <path className="loss-sankey-link" role="button" tabIndex={0} aria-label={`Ver ${quantity(link.value)} · ${title}`}
                  d={`M${props.sourceX},${props.sourceY} C${props.sourceControlX},${props.sourceY} ${props.targetControlX},${props.targetY} ${props.targetX},${props.targetY}`}
                  fill="none" stroke={COLORS[link.source.kind]} strokeWidth={Math.max(props.linkWidth, 2)} strokeOpacity={hover?.key === `link:${link.key}` ? .85 : .26}
                  onClick={() => open(title, link.deals, link.target.kind === 'reason')} onKeyDown={event => keyboard(event, () => open(title, link.deals, link.target.kind === 'reason'))} onMouseEnter={focus} onMouseLeave={() => setHover(null)} onFocus={focus} onBlur={() => setHover(null)}>
                  <title>{`${title} · ${quantity(link.value)} · ${money(link.amount)} MRR`}</title>
                </path>;
              }} />
          </ResponsiveContainer>
        </div>
      </div>
      <p className="loss-sankey-footnote">Cada deal cuenta una vez por columna. La etapa es la registrada al perderse; los flujos muestran agrupaciones, no el recorrido histórico completo.</p>
    </> : <div className="empty-state">Sin deals perdidos para este origen, período y tipo de fecha.</div>}
  </section>;
}
