import { useMemo } from "react";
import { MiniBars, MiniLine } from "./MiniCharts";
import { Metric } from "./PulseDashboard";
import type { Tone } from "@/lib/pulse-types";
import type { RampScope } from "@/lib/team-types";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const shortPeriod = (period: string) => {
  const [year, q] = period.split("-Q");
  return `Q${q}-${year!.slice(2)}`;
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const days = (value: number) => `${Math.round(value)}d`;

export function TimeToService({
  scope,
  rangeLabel,
  selectedPeriods,
  yearPeriods,
  onModal,
  title,
  note,
  fromLabel,
  toLabel,
  thresholds = [30, 60],
}: {
  scope: RampScope;
  rangeLabel: string;
  selectedPeriods: string[];
  yearPeriods: string[];
  onModal: (key: string) => void;
  title: string;
  note: string;
  fromLabel: string;
  toLabel: string;
  thresholds?: [number, number];
}) {
  const rows = useMemo(
    () => scope.periods.filter((row) => selectedPeriods.includes(row.period)),
    [scope.periods, selectedPeriods],
  );
  const yearRows = useMemo(
    () => scope.periods.filter((row) => yearPeriods.includes(row.period)),
    [scope.periods, yearPeriods],
  );

  const allDays = rows.flatMap((row) => row.days);
  const med = median(allDays);
  const avg = allDays.length ? allDays.reduce((a, b) => a + b, 0) / allDays.length : 0;
  const mrrSum = rows.reduce((acc, row) => acc + row.mrrSum, 0);
  const mrrAvg = allDays.length ? mrrSum / allDays.length : 0;
  const pendingCount = rows.reduce((acc, row) => acc + row.pendingCount, 0);
  const pendingDays = rows.flatMap((row) => row.pendingDays);
  const pendingMed = median(pendingDays);

  const tone: Tone = !allDays.length
    ? "neutral"
    : med <= thresholds[0]
      ? "ok"
      : med <= thresholds[1]
        ? "warn"
        : "bad";

  const trend = yearRows.map((row) => ({
    period: shortPeriod(row.period),
    amount: Math.round(median(row.days)),
    deals: row.days.length,
  }));
  const mrrTrend = yearRows.map((row) => ({
    period: shortPeriod(row.period),
    amount: row.days.length ? Math.round(row.mrrSum / row.days.length) : 0,
    deals: row.days.length,
  }));
  const conversion = yearRows.map((row) => {
    const total = row.days.length + row.pendingCount;
    return {
      period: shortPeriod(row.period),
      rate: total ? (row.days.length / total) * 100 : 0,
    };
  });

  const lastPeriod = rows[rows.length - 1];

  return (
    <>
      <div className="team-section-head">
        <h2 className="pulse-h2">{title}</h2>
        <span className="eyebrow">{note}</span>
      </div>
      <section className="grid-4">
        <Metric
          label={`Mediana ${fromLabel} → ${toLabel}`}
          value={allDays.length ? days(med) : "s/n"}
          note={`${allDays.length} deals · ${rangeLabel}`}
          tone={tone}
          onClick={() => lastPeriod && onModal(lastPeriod.modal)}
          tooltip={`Mediana de días entre la entrada a ${fromLabel} y la entrada a ${toLabel}, para los deals firmados en el periodo filtrado.`}
        />
        <Metric
          label="Promedio"
          value={allDays.length ? days(avg) : "s/n"}
          note={allDays.length ? `mediana ${days(med)}` : "sin deals completados"}
          tone="neutral"
          tooltip="Promedio simple de días. Se muestra junto a la mediana porque los casos extremos lo inflan."
        />
        <Metric
          label="MRR promedio"
          value={mrrAvg ? money(mrrAvg) : "s/n"}
          note={`${money(mrrSum)} en total`}
          tone="neutral"
          tooltip="Monto promedio de los deals que completaron el tránsito en el periodo (monto del deal en HubSpot)."
        />
        <Metric
          label={`Firmados sin ${toLabel}`}
          value={String(pendingCount)}
          note={pendingCount ? `${days(pendingMed)} esperando (mediana)` : "todo al día"}
          tone={pendingCount ? (pendingMed > thresholds[1] ? "bad" : "warn") : "ok"}
          onClick={() => lastPeriod && onModal(lastPeriod.pendingModal)}
          tooltip={`Deals firmados en el periodo que todavía no entran a ${toLabel}, con la mediana de días que llevan esperando.`}
        />
      </section>

      <div className="rep-charts">
        <div className="rep-chart">
          <span className="eyebrow">Mediana de días por trimestre</span>
          <MiniBars data={trend} onSelect={() => undefined} />
        </div>
        <div className="rep-chart">
          <span className="eyebrow">MRR promedio por trimestre</span>
          <MiniBars data={mrrTrend} onSelect={() => undefined} />
        </div>
        <div className="rep-chart">
          <span className="eyebrow">% que ya completó el tránsito</span>
          <MiniLine data={conversion} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Trimestre</th>
              <th>Deals completados</th>
              <th>Mediana</th>
              <th>Promedio</th>
              <th>MRR prom.</th>
              <th>Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {yearRows.map((row) => {
              const rowMed = median(row.days);
              const rowAvg = row.days.length
                ? row.days.reduce((a, b) => a + b, 0) / row.days.length
                : 0;
              return (
                <tr key={row.period}>
                  <td>{shortPeriod(row.period)}</td>
                  <td>
                    {row.days.length ? (
                      <button className="cell-button" type="button" onClick={() => onModal(row.modal)}>
                        {row.days.length}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{row.days.length ? days(rowMed) : "—"}</td>
                  <td>{row.days.length ? days(rowAvg) : "—"}</td>
                  <td>{row.days.length ? money(row.mrrSum / row.days.length) : "—"}</td>
                  <td>
                    {row.pendingCount ? (
                      <button
                        className="cell-button"
                        type="button"
                        onClick={() => onModal(row.pendingModal)}
                      >
                        {row.pendingCount} · {days(median(row.pendingDays))}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
