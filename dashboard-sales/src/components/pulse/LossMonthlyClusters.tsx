import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { InsightDeal } from "@/lib/insights-types";
import { LOSS_CLUSTERS, lossMonthlyClusters, type LossCluster, type LossClusterDate } from "@/lib/loss-monthly-clusters";
import "./LossMonthlyClusters.css";

const dateChoices = [
  ["creation", "Fecha de creación"],
  ["entry", "Entrada a Deal perdido"],
] as const;
const colors = [
  "#007e7c", "#5a60d6", "#d58a13", "#b95182", "#3184b9", "#70862a", "#8450b9",
  "#cd694d", "#256152", "#626a9c", "#9a5b28", "#8a4168", "#498a78", "#b09e33",
  "#4e60ab", "#9d714f", "#488ca4", "#956f97", "#b1504d", "#519b45", "#8f789f",
];
const colorOf = (group: string, index: number) => group === "Sin dato" ? "#909399" : colors[index % colors.length];

export function LossMonthlyClusters({ deals, periods, readAt, available, companySizeAvailable }: {
  deals: InsightDeal[];
  periods: string[];
  readAt: string;
  available: boolean;
  companySizeAvailable: boolean;
}) {
  const [basis, setBasis] = useState<LossClusterDate>("entry");
  const [cluster, setCluster] = useState<LossCluster>("conversations");
  const result = useMemo(() => lossMonthlyClusters(deals, periods, readAt, basis, cluster),
    [deals, periods, readAt, basis, cluster]);
  const dataAvailable = available && (cluster !== "companySize" || companySizeAvailable);
  const hasDeals = result.groups.length > 0;

  return <section className="rep-chart loss-monthly-clusters" aria-labelledby="loss-monthly-clusters-title">
    <div className="loss-monthly-clusters-heading">
      <div>
        <h2 id="loss-monthly-clusters-title" className="pulse-h2">Tendencia mensual de pérdidas</h2>
        <p>Deals perdidos por mes y clúster{cluster === "companySize" ? " · Segmentación de la empresa asociada" : ""}</p>
      </div>
      <label className="loss-monthly-select">
        Clúster
        <select value={cluster} onChange={event => setCluster(event.target.value as LossCluster)}>
          {LOSS_CLUSTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    <div className="tabs loss-monthly-date" role="group" aria-label="Fecha para agrupar los negocios por mes">
      {dateChoices.map(([value, label]) => <button key={value} type="button" data-active={basis === value}
        aria-pressed={basis === value} onClick={() => setBasis(value)}>{label}</button>)}
    </div>

    {!dataAvailable ? <p className="empty-state" role="status">
      {available ? "No se pudo verificar la segmentación de las empresas." : "Esta lectura aún no incluye los datos del gráfico."} Actualiza el reporte para volver a cargar el clúster.
    </p> : <>
      {result.months.length > 0 && <div className="loss-monthly-plot" tabIndex={0} role="region" aria-label="Gráfico mensual desplazable">
        <div style={{ minWidth: Math.max(280, result.months.length * 54) }}>
          <ResponsiveContainer width="100%" height={248}>
            <BarChart data={result.months} margin={{ top: 12, right: 10, bottom: 4, left: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} interval={0} />
              <YAxis allowDecimals={false} domain={[0, hasDeals ? "auto" : 1]} width={33}
                tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "var(--border)", opacity: 0.3 }} content={({ active, label }) => {
                const row = result.months.find(month => month.label === label);
                if (!active || !row) return null;
                return <div className="loss-monthly-tooltip">
                  <strong>{row.label} · {row.total} deals</strong>
                  <ul>{result.groups.map((group, index) => (row.counts[index] ?? 0) > 0 &&
                    <li key={group}>{group}<b>{row.counts[index]}</b></li>)}</ul>
                </div>;
              }} />
              {result.groups.map((group, index) => <Bar key={group} name={group} dataKey={`counts.${index}`}
                stackId="deals" fill={colorOf(group, index)} maxBarSize={56} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>}
      {hasDeals ? <>
        <ul className="loss-monthly-legend" aria-label="Clústeres">
          {result.groups.map((group, index) => <li key={group}><span aria-hidden="true" style={{ background: colorOf(group, index) }} />{group}</li>)}
        </ul>
        <details className="loss-monthly-data">
          <summary>Ver datos por mes</summary>
          <div className="loss-monthly-table"><table>
            <caption className="sr-only">Cantidad de deals perdidos por clúster y mes</caption>
            <thead><tr><th scope="col">Mes</th><th scope="col">Total</th>
              {result.groups.map(group => <th key={group} scope="col">{group}</th>)}
            </tr></thead>
            <tbody>{result.months.map(row => <tr key={row.month}><th scope="row">{row.label}</th><td>{row.total}</td>
              {row.counts.map((count, index) => <td key={result.groups[index]}>{count}</td>)}
            </tr>)}</tbody>
          </table></div>
        </details>
      </> : <p className="empty-state" role="status">Sin deals perdidos para la fecha y el período seleccionados.</p>}
      {result.unassigned > 0 && <p className="loss-monthly-note">
        {result.unassigned} {result.unassigned === 1 ? "deal sin fecha válida" : "deals sin fecha válida"} para esta agrupación entre todos los períodos disponibles.
      </p>}
    </>}
  </section>;
}
