import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatTrendValue, type TrendPoint, type TrendUnit } from '@/lib/chart-trend';
import './MetricTrend.css';

/** Shared curves for card/table trends. Gaps stay gaps; chart interaction never triggers a surrounding metric card. */
export function MetricTrend({ data, label, unit = 'money', caption, reference, referenceLabel = 'Referencia', onSelect, compact = false }: {
  data: TrendPoint[]; label: string; unit?: TrendUnit; caption?: string; reference?: number | null;
  referenceLabel?: string; onSelect?: (index: number) => void; compact?: boolean;
}) {
  const points = data.map(point => ({ ...point, value: point.value !== null && Number.isFinite(point.value) ? point.value : null }));
  const available = points.some(point => point.value !== null);
  const baseline = reference != null && Number.isFinite(reference) ? reference : null;
  const accessible = `${label}. ${points.map(point => `${point.label}: ${formatTrendValue(point.value, unit)}${point.partial ? ', parcial' : ''}${point.detail ? `, ${point.detail}` : ''}`).join('; ')}${baseline !== null ? `. ${referenceLabel}: ${formatTrendValue(baseline, unit)}` : ''}`;
  return <div className="metric-curve" data-compact={compact || undefined} onClick={event => event.stopPropagation()}>
    {caption && <div className="metric-curve-caption">{caption}{points.some(point => point.partial) ? ' · mes actual parcial' : ''}</div>}
    <div role={onSelect ? "group" : "img"} aria-label={accessible}>
      {available ? <ResponsiveContainer width="100%" height={compact ? 60 : 72}>
        <LineChart role="group" data={points} onClick={state => { if (onSelect && state?.activeTooltipIndex != null && state.activeTooltipIndex >= 0 && points[state.activeTooltipIndex]?.value != null) onSelect(state.activeTooltipIndex); }} margin={{ top: 8, right: 7, bottom: 0, left: 7 }}>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={unit === 'percent' ? [0, 100] : ['auto', 'auto']} />
          <Tooltip content={({ active, payload }) => {
            const point = payload?.[0]?.payload as TrendPoint | undefined;
            return active && point ? <div className="metric-curve-tooltip"><strong>{point.label}{point.partial ? ' · parcial' : ''}</strong><span>{label}: {formatTrendValue(point.value, unit)}</span>{point.detail && <span>{point.detail}</span>}</div> : null;
          }} />
          {baseline !== null && <ReferenceLine y={baseline} stroke="var(--muted)" strokeDasharray="3 3" strokeOpacity={.55} ifOverflow="extendDomain" />}
          <Line type="monotone" dataKey="value" stroke="var(--muted)" strokeWidth={2} connectNulls={false} isAnimationActive={false}
            activeDot={{ r: 4 }} dot={(props: { cx?: number; cy?: number; index?: number; payload?: TrendPoint }) => {
              if (props.payload?.value == null) return <g key={props.index} />;
              const index = props.index!;
              return <circle key={index} cx={props.cx} cy={props.cy} r={2} fill="var(--muted)" strokeWidth={0}
                {...(onSelect ? { role: 'button', tabIndex: 0, className: 'metric-curve-point', 'aria-label': `Ver ${props.payload.label} · ${formatTrendValue(props.payload.value, unit)}`,
                  onClick: (event: React.MouseEvent<SVGCircleElement>) => { event.stopPropagation(); onSelect(index); },
                  onKeyDown: (event: React.KeyboardEvent<SVGCircleElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(index); } } } : {})}>
                <title>{`${props.payload.label}: ${formatTrendValue(props.payload.value, unit)}${props.payload.detail ? ` · ${props.payload.detail}` : ''}`}</title>
              </circle>;
            }}
            />
        </LineChart>
      </ResponsiveContainer> : <div className="metric-curve-empty">Sin datos de tendencia para este alcance</div>}
    </div>
    <div className="metric-curve-periods">{points.map((point, index) => <span key={index}>{point.label}{point.partial ? '*' : ''}</span>)}</div>
    <div className="metric-curve-reference" aria-hidden={baseline === null || undefined}>{baseline !== null ? `${referenceLabel}: ${formatTrendValue(baseline, unit)}` : "\u00a0"}</div>
  </div>;
}
