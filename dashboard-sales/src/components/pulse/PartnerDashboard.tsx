import { useState } from "react";
import { DealModal } from "./DealModal";
import { MiniBars } from "./MiniCharts";
import type { Drilldown, PartnerReport } from "@/lib/pulse-types";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const wrText = (stats: { won: number; lost: number }) => {
  const total = stats.won + stats.lost;
  return total ? `${Math.round((stats.won / total) * 100)}% (${stats.won}/${total})` : "s/n";
};

function Metric({
  label,
  value,
  note,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  tone?: "ok" | "warn" | "bad" | "neutral";
  onClick?: () => void;
}) {
  return (
    <button className="metric" data-tone={tone} type="button" onClick={onClick}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {note ? <div className="metric-note">{note}</div> : null}
    </button>
  );
}

export function PartnerDashboard({
  report,
  tabs,
}: {
  report: PartnerReport;
  tabs: React.ReactNode;
}) {
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"quarter" | "cumulative">("quarter");

  const payload: Drilldown | null = modalKey ? report.drilldowns[modalKey] ?? null : null;
  const open = (key: string) => setModalKey(key);

  return (
    <main className="pulse-main">
      {tabs}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 24,
          alignItems: "flex-end",
          marginBottom: 52,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="pulse-h1">Negocios de Partners</h1>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            Identificado por fuente de creación · comercial = propietario del contacto asociado ·
            datos en vivo desde HubSpot
          </div>
        </div>
        <div className="pill">{report.currentLabel}</div>
      </header>

      <section className="grid-4">
        <Metric
          label="Pipeline partners"
          value={money(report.totals.openAmount)}
          note={`${report.totals.openCount} deals abiertos · ${report.totals.partnerCount} partners`}
          tone="neutral"
          onClick={() => open("all-open")}
        />
        <Metric
          label="Pipeline Q ponderado"
          value={money(report.totals.weightedQ)}
          tone="warn"
          onClick={() => open("all-q-open")}
        />
        <Metric
          label={`Ganado ${report.currentLabel.replace(" QTD", "")}`}
          value={money(report.totals.wonQAmount)}
          note={`${report.totals.wonQCount} deals · WR ${wrText(report.totals.wr)}`}
          tone="ok"
          onClick={() => open("all-won-q")}
        />
        <Metric
          label="Ganado histórico (8Q)"
          value={money(report.totals.wonHistAmount)}
          note={`${report.totals.wonHistCount} deals ganados`}
          tone="ok"
          onClick={() => open("all-won-hist")}
        />
      </section>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          margin: "64px 0 24px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 className="pulse-h2">Fuente de creación</h2>
          <div className="eyebrow" style={{ marginTop: 8 }}>
            La fuente es lo que declara el negocio como de partner. Haz click para ver los deals.
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Fuente de creación</th>
              <th>Tipo</th>
              <th>Pipeline abierto</th>
              <th>Deals abiertos</th>
              <th>Ganado Q</th>
              <th>Ganado 8Q</th>
              <th>WR 8Q</th>
            </tr>
          </thead>
          <tbody>
            {report.sources.map((row) => (
              <tr key={row.id}>
                <th>
                  <button className="cell-button" type="button" onClick={() => open(`source-${row.id}`)}>
                    {row.source}
                  </button>
                </th>
                <td>
                  <span className="status" data-tone={row.isPartner ? "ok" : "warn"}>
                    {row.isPartner ? "Partner" : "Otra fuente"}
                  </span>
                </td>
                <td>{money(row.openAmount)}</td>
                <td>{row.openCount}</td>
                <td>{money(row.wonQAmount)}</td>
                <td>{money(row.wonHistAmount)}</td>
                <td>{wrText(row.wr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          margin: "64px 0 24px",
          flexWrap: "wrap",
        }}
      >
        <h2 className="pulse-h2">Métricas por partner</h2>
        <div className="tabs">
          <button
            className="tab"
            type="button"
            data-active={mode === "quarter"}
            onClick={() => setMode("quarter")}
          >
            Vendido por Q
          </button>
          <button
            className="tab"
            type="button"
            data-active={mode === "cumulative"}
            onClick={() => setMode("cumulative")}
          >
            Acumulado histórico
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Partner</th>
              <th>Comercial (dueño del contacto)</th>
              <th>Pipeline</th>
              <th>Deals</th>
              <th>Pond. Q</th>
              <th>% cierre</th>
              {report.stageColumns.map((column) => (
                <th key={column.key} title={column.label}>
                  {column.key}
                </th>
              ))}
              <th>Ganado Q</th>
              <th>Ganado 8Q</th>
              <th>Perdido</th>
              <th>WR 8Q</th>
              <th>{mode === "quarter" ? "Vendido por Q" : "Acumulado"}</th>
            </tr>
          </thead>
          <tbody>
            {report.partners.map((row) => {
              const cell = (value: number, key: string, formatted?: string) =>
                value ? (
                  <button className="cell-button" type="button" onClick={() => open(key)}>
                    {formatted ?? value}
                  </button>
                ) : (
                  formatted ?? 0
                );
              const bars =
                mode === "quarter"
                  ? row.trend
                  : row.cumulative.map((item) => ({
                      period: item.period,
                      amount: item.amount,
                      deals: 0,
                    }));
              return (
                <tr key={row.id}>
                  <th>{row.name}</th>
                  <td>{row.comerciales.join(", ") || "Sin asignar"}</td>
                  <td>{cell(row.openAmount, `partner-${row.id}-open`, money(row.openAmount))}</td>
                  <td>{cell(row.openCount, `partner-${row.id}-open`)}</td>
                  <td>{cell(row.weightedQ, `partner-${row.id}-q-open`, money(row.weightedQ))}</td>
                  <td>{Math.round(row.avgProbability * 100)}%</td>
                  {row.stages.map((stage) => (
                    <td key={stage.key}>
                      {cell(stage.count, `partner-${row.id}-stage-${stage.key}`)}
                    </td>
                  ))}
                  <td>{cell(row.wonQAmount, `partner-${row.id}-won-q`, money(row.wonQAmount))}</td>
                  <td>
                    {cell(row.wonHistAmount, `partner-${row.id}-won-hist`, money(row.wonHistAmount))}
                  </td>
                  <td>{cell(row.lostAmount, `partner-${row.id}-lost`, money(row.lostAmount))}</td>
                  <td>{wrText(row.wr)}</td>
                  <td>
                    <div className="trend-cell">
                      <MiniBars
                        data={bars}
                        onSelect={(period) => {
                          const index = report.periods.indexOf(period);
                          const full = report.periods[index];
                          if (!full) return;
                          const key = Object.keys(report.drilldowns).find(
                            (candidate) =>
                              candidate.startsWith(`partner-${row.id}-won-`) &&
                              report.drilldowns[candidate]?.title.endsWith(period),
                          );
                          if (key) open(key);
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="pulse-h2" style={{ margin: "64px 0 24px" }}>
        Alertas de partners
      </h2>
      <section className="alerts">
        {report.alerts.length ? (
          report.alerts.map((alert) => (
            <a className="alert" key={alert.id} href={alert.url} target="_blank" rel="noreferrer">
              <span>{alert.owner}</span>
              <strong>{alert.name}</strong>
              <em>
                {alert.reason} · {money(alert.amount)}
              </em>
            </a>
          ))
        ) : (
          <div className="empty-state">Sin alertas en el negocio de partners.</div>
        )}
      </section>

      <DealModal payload={payload} onClose={() => setModalKey(null)} />
    </main>
  );
}
