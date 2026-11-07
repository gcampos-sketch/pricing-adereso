import { useMemo } from "react";
import { MiniBars } from "./MiniCharts";
import type { PlanBotScope } from "@/lib/pulse-types";

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

export function PlanBotWon({
  scope,
  rangeLabel,
  selectedPeriods,
  yearPeriods,
  onModal,
}: {
  scope: PlanBotScope;
  rangeLabel: string;
  selectedPeriods: string[];
  yearPeriods: string[];
  onModal: (key: string) => void;
}) {
  const rows = useMemo(() => {
    const list = (scope.rows ?? []).map((row) => {
      let count = 0;
      let amount = 0;
      const modals: string[] = [];
      for (const period of selectedPeriods) {
        const stat = row.byPeriod[period];
        if (!stat) continue;
        count += stat.count;
        amount += stat.amount;
        modals.push(stat.modal);
      }
      return { key: row.key, label: row.label, count, amount, modal: modals[0] ?? null, row };
    });
    return list.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  }, [scope.rows, selectedPeriods]);

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const top = rows[0];

  const trend = useMemo(
    () =>
      yearPeriods.map((period) => {
        let count = 0;
        let amount = 0;
        for (const row of scope.rows ?? []) {
          const stat = row.byPeriod[period];
          if (!stat) continue;
          count += stat.count;
          amount += stat.amount;
        }
        return { period: shortPeriod(period), amount: count, deals: count };
      }),
    [scope.rows, yearPeriods],
  );

  return (
    <>
      <div className="team-section-head">
        <h2 className="pulse-h2">Ganados por Plan de Bot</h2>
        <span className="eyebrow">
          {scope.name} · {rangeLabel} · {total} deals ganados · {money(totalAmount)}
        </span>
      </div>

      {!total ? (
        <div className="empty-state">Sin deals ganados con plan de bot en el rango filtrado.</div>
      ) : (
        <>
          <div className="rep-charts">
            <div className="rep-chart">
              <span className="eyebrow">Ganados por trimestre (todos los planes)</span>
              <MiniBars data={trend} onSelect={() => undefined} />
            </div>
            <div className="rep-chart">
              <span className="eyebrow">Distribución de planes</span>
              <div className="plan-bars">
                {rows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    className="plan-bar"
                    onClick={() => row.modal && onModal(row.modal)}
                  >
                    <span className="plan-bar-label">{row.label}</span>
                    <span className="plan-bar-track">
                      <span
                        className="plan-bar-fill"
                        style={{ width: `${top ? (row.count / top.count) * 100 : 0}%` }}
                      />
                    </span>
                    <strong>{row.count}</strong>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="pulse-table">
              <thead>
                <tr>
                  <th>Plan de Bot</th>
                  <th>Ganados</th>
                  <th>Share</th>
                  <th>Monto</th>
                  {yearPeriods.map((period) => (
                    <th key={period}>{shortPeriod(period)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <th>{row.label}</th>
                    <td>
                      {row.modal ? (
                        <button
                          className="cell-button"
                          type="button"
                          onClick={() => onModal(row.modal!)}
                        >
                          {row.count}
                        </button>
                      ) : (
                        row.count
                      )}
                    </td>
                    <td>{total ? `${Math.round((row.count / total) * 100)}%` : "—"}</td>
                    <td>{money(row.amount)}</td>
                    {yearPeriods.map((period) => {
                      const stat = row.row.byPeriod[period];
                      return (
                        <td key={period}>
                          {stat?.count ? (
                            <button
                              className="cell-button"
                              type="button"
                              onClick={() => onModal(stat.modal)}
                            >
                              {stat.count}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
