import { useMemo, useState } from "react";
import { MiniLine } from "./MiniCharts";
import type { Tone } from "@/lib/pulse-types";
import type { WrScope } from "@/lib/team-types";

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

const toneOfRate = (rate: number, total: number): Tone => {
  if (!total) return "neutral";
  if (rate >= 35) return "ok";
  if (rate >= 20) return "warn";
  return "bad";
};

type Row = {
  key: string;
  label: string;
  won: number;
  lost: number;
  wonAmount: number;
  lostAmount: number;
  rate: number;
  trend: { period: string; rate: number }[];
  wonModal: string;
  lostModal: string;
};

export function WinRateCross({
  scope,
  rangeLabel,
  selectedPeriods,
  yearPeriods,
  onModal,
}: {
  scope: WrScope;
  rangeLabel: string;
  selectedPeriods: string[];
  yearPeriods: string[];
  onModal: (key: string) => void;
}) {
  const [dimId, setDimId] = useState(scope.dimensions[0]?.id ?? "source");
  const dimension = scope.dimensions.find((dim) => dim.id === dimId) ?? scope.dimensions[0];

  const rows = useMemo<Row[]>(() => {
    if (!dimension) return [];
    return dimension.buckets
      .map((bucket) => {
        let won = 0;
        let lost = 0;
        let wonAmount = 0;
        let lostAmount = 0;
        for (const period of selectedPeriods) {
          const stat = bucket.byPeriod[period];
          if (!stat) continue;
          won += stat.won;
          lost += stat.lost;
          wonAmount += stat.wonAmount;
          lostAmount += stat.lostAmount;
        }
        const total = won + lost;
        return {
          key: bucket.key,
          label: bucket.label,
          won,
          lost,
          wonAmount,
          lostAmount,
          rate: total ? (won / total) * 100 : 0,
          trend: yearPeriods.map((period) => {
            const stat = bucket.byPeriod[period];
            const closed = (stat?.won ?? 0) + (stat?.lost ?? 0);
            return {
              period: shortPeriod(period),
              rate: closed ? ((stat?.won ?? 0) / closed) * 100 : 0,
            };
          }),
          wonModal: bucket.wonModal,
          lostModal: bucket.lostModal,
        };
      })
      .filter((row) => row.won + row.lost > 0)
      .sort((a, b) => b.won + b.lost - (a.won + a.lost));
  }, [dimension, selectedPeriods, yearPeriods]);

  const totals = rows.reduce(
    (acc, row) => ({ won: acc.won + row.won, lost: acc.lost + row.lost }),
    { won: 0, lost: 0 },
  );
  const totalClosed = totals.won + totals.lost;
  const best = rows.filter((row) => row.won + row.lost >= 3).sort((a, b) => b.rate - a.rate)[0];
  const worst = rows.filter((row) => row.won + row.lost >= 3).sort((a, b) => a.rate - b.rate)[0];

  return (
    <section className="wr-cross">
      <div className="team-section-head">
        <h2 className="pulse-h2">Win rate cruzado · {scope.name}</h2>
        <span className="eyebrow">
          {rangeLabel} · {totalClosed} deals cerrados
          {scope.isAE ? " · perfil AE" : ""}
        </span>
      </div>

      <div className="wr-dim-tabs">
        {scope.dimensions.map((dim) => (
          <button
            key={dim.id}
            className="tab"
            type="button"
            data-active={dim.id === dimension?.id}
            onClick={() => setDimId(dim.id)}
          >
            {dim.label}
          </button>
        ))}
      </div>

      {dimension ? <p className="wr-help">{dimension.help}</p> : null}

      {rows.length ? (
        <>
          <div className="wr-highlights">
            <div className="wr-highlight" data-tone="ok">
              <em>Mejor conversión</em>
              <strong>{best ? best.label : "s/n"}</strong>
              <span>
                {best ? `${Math.round(best.rate)}% (${best.won}/${best.won + best.lost})` : "sin volumen suficiente"}
              </span>
            </div>
            <div className="wr-highlight" data-tone="bad">
              <em>Peor conversión</em>
              <strong>{worst ? worst.label : "s/n"}</strong>
              <span>
                {worst
                  ? `${Math.round(worst.rate)}% (${worst.won}/${worst.won + worst.lost})`
                  : "sin volumen suficiente"}
              </span>
            </div>
            <div className="wr-highlight" data-tone="neutral">
              <em>Win rate del rango</em>
              <strong>
                {totalClosed ? `${Math.round((totals.won / totalClosed) * 100)}%` : "s/n"}
              </strong>
              <span>
                {totals.won} ganados · {totals.lost} perdidos
              </span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="pulse-table">
              <thead>
                <tr>
                  <th>{dimension?.label}</th>
                  <th>Win rate</th>
                  <th>Ganados</th>
                  <th>Perdidos</th>
                  <th>MRR ganado</th>
                  <th>MRR perdido</th>
                  <th>Evolución trimestral</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td>
                      <span className="wr-rate">
                        <span className="status" data-tone={toneOfRate(row.rate, row.won + row.lost)}>
                          {Math.round(row.rate)}%
                        </span>
                        <span className="progress" data-tone={toneOfRate(row.rate, row.won + row.lost)}>
                          <span style={{ width: `${Math.min(100, row.rate)}%` }} />
                        </span>
                      </span>
                    </td>
                    <td>
                      <button className="cell-button" type="button" onClick={() => onModal(row.wonModal)}>
                        {row.won}
                      </button>
                    </td>
                    <td>
                      <button className="cell-button" type="button" onClick={() => onModal(row.lostModal)}>
                        {row.lost}
                      </button>
                    </td>
                    <td>{money(row.wonAmount)}</td>
                    <td>{money(row.lostAmount)}</td>
                    <td>
                      <MiniLine data={row.trend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-state">Sin deals cerrados en {rangeLabel} para este cruce.</div>
      )}
    </section>
  );
}
