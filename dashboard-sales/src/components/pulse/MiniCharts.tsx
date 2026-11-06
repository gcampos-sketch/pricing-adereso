import { useEffect, useRef, useState } from "react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function MiniBars({
  data,
  onSelect,
}: {
  data: { period: string; amount: number; deals: number }[];
  onSelect: (period: string) => void;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [maxH, setMaxH] = useState(120);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      // available height for bars = container height minus the label row (~16px) and gaps
      const h = Math.max(40, el.clientHeight - 20);
      setMaxH(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(...data.map((item) => item.amount), 1);
  return (
    <span
      className="mini-bars"
      ref={wrapRef}
      aria-label="Tendencia de ganado por trimestre"
    >
      {data.map((item) => {
        const height = Math.max(4, (item.amount / max) * maxH);
        const empty = item.amount <= 0;
        return (
          <button
            key={item.period}
            className="mini-bar"
            type="button"
            data-empty={empty}
            disabled={empty}
            title={`${item.period}: ${money(item.amount)} · ${item.deals} deals`}
            onClick={() => !empty && onSelect(item.period)}
          >
            <span style={{ height: `${height}px` }} />
            <em>{item.period}</em>
          </button>
        );
      })}
    </span>
  );
}

/** Línea de tendencia mensual de montos con etiquetas y área sutil. */
export function TrendLine({
  labels,
  values,
  compact = false,
}: {
  labels: string[];
  values: number[];
  compact?: boolean;
}) {
  const width = 640;
  const height = compact ? 92 : 180;
  if (!values.length) return <div className="empty-state">Sin datos de tendencia.</div>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? (width - 24) / (values.length - 1) : 0;
  const pts = values.map((value, index) => {
    const x = 12 + index * step;
    const y = height - 26 - ((value - min) / span) * (height - (compact ? 44 : 56));
    return { x, y, value, label: labels[index] ?? "" };
  });
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `12,${height - 26} ${line} ${(12 + (values.length - 1) * step).toFixed(1)},${height - 26}`;
  return (
    <div className="trend-line" data-compact={compact ? "true" : undefined}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tendencia mensual de pipeline">
        <polygon points={area} className="trend-area" />
        <polyline points={line} className="trend-stroke" />
        {pts.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            <circle cx={p.x} cy={p.y} r={compact ? 3 : 3.5} className="trend-dot">
              <title>{`${p.label}: ${money(p.value)}`}</title>
            </circle>
            {!compact ? (
              <text x={p.x} y={p.y - 8} className="trend-value" textAnchor="middle">
                {money(p.value)}
              </text>
            ) : null}
            <text x={p.x} y={height - 8} className="trend-label" textAnchor="middle">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function MiniLine({ data }: { data: { period: string; rate: number }[] }) {
  const width = 132;
  const step = data.length > 1 ? (width - 8) / (data.length - 1) : 0;
  const points = data
    .map((item, index) => {
      const x = 4 + index * step;
      const y = 36 - (Math.min(item.rate, 100) / 100) * 32;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <span className="mini-line-wrap">
      <svg className="mini-line" viewBox="0 0 132 40" role="img" aria-label="Tendencia de win rate por trimestre">
        <path d="M4 20H128" />
        <polyline points={points} />
        {data.map((item, index) => (
          <circle
            key={item.period}
            cx={4 + index * step}
            cy={36 - (Math.min(item.rate, 100) / 100) * 32}
            r={2.5}
          />
        ))}
      </svg>
      <span className="mini-labels">
        {data.map((item) => (
          <span key={item.period}>{item.period}</span>
        ))}
      </span>
    </span>
  );
}
