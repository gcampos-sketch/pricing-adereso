/**
 * Detalle del MRR en servicio: evolución de lo incorporado por año, trimestre,
 * mes o semana, con variación por periodo y los deals de cada periodo.
 */
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActiveMrr } from "@/contexts/RefreshContext";
import { buildBuckets, periodKey, shortDate, type Granularity } from "./activeMrrSeries";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "year", label: "Año" },
  { value: "quarter", label: "Trimestre" },
  { value: "month", label: "Mes" },
  { value: "week", label: "Semana" },
];

export function ActiveMrrDetail({
  data,
  year,
  quarter,
  onClose,
}: {
  data: ActiveMrr;
  year: string;
  quarter: string;
  onClose: () => void;
}) {
  const [granularity, setGranularity] = useState<Granularity>(quarter === "all" ? "month" : "quarter");
  const buckets = useMemo(() => buildBuckets(data.entries, granularity), [data.entries, granularity]);
  const shown = useMemo(() => buckets.slice(granularity === "week" ? -16 : -14), [buckets, granularity]);
  const focus = periodKey(year, quarter).key;
  const [selected, setSelected] = useState<string | null>(null);
  const activeKey = selected ?? shown.find((bucket) => bucket.key === focus)?.key ?? shown[shown.length - 1]?.key ?? null;
  const active = shown.find((bucket) => bucket.key === activeKey) ?? null;
  const max = Math.max(1, ...shown.map((bucket) => bucket.value));

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal mrr-detail"
        role="dialog"
        aria-modal="true"
        aria-label="Evolución del MRR en servicio"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mrr-detail-head">
          <div>
            <h3>MRR incorporado a servicio</h3>
            <p>
              {money.format(data.value)} activo · {data.count} deals
              {data.lastStart ? ` · último inicio ${shortDate(data.lastStart.date)}` : ""}
            </p>
            <p className="mrr-detail-note">
              Monto del deal al entrar a Inicio de servicio, no lo ganado por fecha de cierre
              {data.churnedExcluded
                ? ` · ${data.churnedExcluded} ${data.churnedExcluded === 1 ? "deal excluido" : "deals excluidos"} por churn del cliente`
                : ""}
            </p>
          </div>
          <div className="mrr-detail-granularity">
            {GRANULARITIES.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                size="sm"
                data-active={granularity === option.value}
                onClick={() => {
                  setGranularity(option.value);
                  setSelected(null);
                }}
              >
                {option.label}
              </Button>
            ))}
            <Button type="button" variant="ghost" size="sm" aria-label="Cerrar" onClick={onClose}>
              <X size={14} aria-hidden="true" />
            </Button>
          </div>
        </header>

        {shown.length ? (
          <div className="mrr-detail-chart">
            <svg className="mrr-detail-line" viewBox="0 0 1000 180" role="img" aria-label="Tendencia del MRR incorporado">
              <defs>
                <linearGradient id="mrr-line-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopOpacity="0.35" style={{ stopColor: "var(--brand)" }} />
                  <stop offset="100%" stopOpacity="0" style={{ stopColor: "var(--brand)" }} />
                </linearGradient>
              </defs>
              {(() => {
                const w = 1000;
                const h = 180;
                const padX = 24;
                const padY = 18;
                const vals = shown.map((b) => b.cumulative);
                const lo = Math.min(...vals) * 0.92;
                const hi = Math.max(...vals, 1);
                const span = hi - lo || 1;
                const step = shown.length > 1 ? (w - padX * 2) / (shown.length - 1) : 0;
                const px = (i: number) => padX + i * step;
                const py = (v: number) => h - padY - ((v - lo) / span) * (h - padY * 2);
                const pts = shown.map((b, i) => `${px(i).toFixed(1)},${py(b.cumulative).toFixed(1)}`);
                const last = shown.length > 1 ? px(shown.length - 1) : w - padX;
                const area = `${padX},${h - padY} ${pts.join(" ")} ${last.toFixed(1)},${h - padY}`;
                return (
                  <>
                    <polygon points={area} fill="url(#mrr-line-grad)" stroke="none" />
                    <polyline
                      points={pts.join(" ")}
                      fill="none"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      style={{ stroke: "var(--brand)", filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--brand) 55%, transparent))" }}
                    />
                    {shown.map((b, i) => (
                      <circle
                        key={b.key}
                        cx={px(i)}
                        cy={py(b.cumulative)}
                        r={b.key === activeKey ? 6 : 4}
                        strokeWidth="2"
                        style={{ fill: b.key === activeKey ? "var(--brand)" : "var(--surface)", stroke: "var(--brand)" }}
                        className="mrr-detail-line-dot"
                        data-active={b.key === activeKey}
                        onClick={() => setSelected(b.key)}
                      >
                        <title>{`${b.label}: ${money.format(b.cumulative)} acumulado · ${b.value >= 0 ? "+" : ""}${money.format(b.value)} en el periodo · ${b.count} deals`}</title>
                      </circle>
                    ))}
                  </>
                );
              })()}
            </svg>
            <div className="mrr-detail-labels" role="list">
              {shown.map((bucket) => (
                  <button
                    key={bucket.key}
                    type="button"
                    role="listitem"
                    className="mrr-detail-label"
                    data-active={bucket.key === activeKey}
                    data-focus={bucket.key === focus}
                    onClick={() => setSelected(bucket.key)}
                    title={`${bucket.label}: ${money.format(bucket.cumulative)} acumulado en servicio · ${bucket.value >= 0 ? "+" : ""}${money.format(bucket.value)} incorporado · ${bucket.count} deals`}
                  >
                    <span className="mrr-detail-label-value">{money.format(bucket.cumulative)}</span>
                    <span className="mrr-detail-label-name">{bucket.label}</span>
                    <span className="mrr-detail-label-change" data-tone={bucket.value > 0 ? "ok" : bucket.value < 0 ? "bad" : "neutral"}>
                      {bucket.value === 0 ? "—" : `${bucket.value > 0 ? "+" : ""}${money.format(bucket.value)}`}
                    </span>
                  </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mrr-detail-empty">Aún no hay deals con fecha de inicio de servicio registrada.</p>
        )}

        {active ? (
          <div className="mrr-detail-table-wrap">
            <h4>
              {active.label} · {money.format(active.cumulative)} acumulado · {active.value >= 0 ? "+" : ""}
              {money.format(active.value)} en el periodo · {active.count} deals
            </h4>
            <table className="mrr-detail-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Deal</th>
                  <th>Comercial</th>
                  <th className="num">MRR</th>
                </tr>
              </thead>
              <tbody>
                {[...active.entries]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((entry) => (
                    <tr key={entry.id}>
                      <td>{shortDate(entry.date)}</td>
                      <td>{entry.name}</td>
                      <td>{entry.owner}</td>
                      <td className="num">{money.format(entry.mrr)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
