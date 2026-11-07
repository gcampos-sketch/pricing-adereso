import { useEffect, useMemo, useRef, useState } from "react";
import { DealModal } from "./DealModal";
import { Metric } from "./PulseDashboard";
import { CompactFilterBar } from "./FilterBar";
import {
  HBars,
  SectionTitle,
  money,
  pct,
  sum,
  useAgo,
  useInsightFilters,
  weighted,
} from "./insights-shared";
import type { Drilldown, Tone } from "@/lib/pulse-types";
import type { InsightDeal, InsightsReport } from "@/lib/insights-types";
import { roleOfOwner } from "@/lib/owner-roles";

/** puntaje de empuje: mezcla probabilidad de etapa y adobo closing score */
function pushScore(deal: InsightDeal) {
  const prob = (deal.probabilityValue || 0) * 100;
  const adobo = deal.adoboScoreValue >= 0 ? deal.adoboScoreValue : prob;
  return Math.round(prob * 0.5 + adobo * 0.5);
}

type Lever = {
  id: string;
  label: string;
  help: string;
  deals: InsightDeal[];
  tone: Tone;
};

export function SimulatorDashboard({
  report,
  onRefresh,
  isRefreshing,
  tabs,
  initialOwnerId,
  role = "all",
  onRole,
}: {
  report: InsightsReport;
  onRefresh: () => void;
  isRefreshing: boolean;
  tabs: React.ReactNode;
  initialOwnerId?: string | undefined;
  role?: "all" | "AE" | "KAM";
  onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const ago = useAgo(report.generatedAt);
  const filters = useInsightFilters(report, initialOwnerId, role, onRole);
  const roleOwnerOptions = useMemo(
    () =>
      report.owners
        .filter((owner) => role === "all" || roleOfOwner(owner.id) === role)
        .map((owner) => [owner.id, owner.name] as [string, string]),
    [report.owners, role],
  );
  const [drill, setDrill] = useState<Drilldown | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [stageFilter, setStageFilter] = useState<string[]>([]);

  const periodKey = filters.quarter === "all" ? report.currentPeriod : `${filters.year}-Q${filters.quarter}`;
  const quotaByOwner = report.quotas[periodKey] ?? {};

  const scopeOwners = useMemo(
    () =>
      report.owners
        .filter((owner) => role === "all" || roleOfOwner(owner.id) === role)
        .filter((owner) => filters.ownerId === "team" || owner.id === filters.ownerId),
    [report.owners, role, filters.ownerId],
  );

  const rows = useMemo(
    () =>
      scopeOwners.map((owner) => {
        const quota = quotaByOwner[owner.id] ?? 0;
        const won = report.deals.filter(
          (deal) => deal.status === "won" && deal.ownerId === owner.id && deal.period === periodKey,
        );
        const wonAmount = sum(won, (d) => d.mrr);
        const openAll = report.deals.filter((deal) => deal.status === "open" && deal.ownerId === owner.id);
        const openQ = openAll.filter((deal) => deal.period === periodKey);
        const gap = Math.max(0, quota - wonAmount);
        const forecast = weighted(openQ);
        const coverage = gap ? forecast / gap : 99;
        const ticket = won.length ? wonAmount / won.length : openQ.length ? sum(openQ, (d) => d.amountValue) / openQ.length : 0;
        const ranked = [...openQ].sort((a, b) => pushScore(b) - pushScore(a));
        let running = 0;
        const plan: InsightDeal[] = [];
        for (const deal of ranked) {
          if (running >= gap) break;
          running += deal.amountValue;
          plan.push(deal);
        }
        const tone: Tone = !quota
          ? "neutral"
          : gap === 0
            ? "ok"
            : coverage >= 3
              ? "ok"
              : coverage >= 1.5
                ? "warn"
                : "bad";
        return {
          owner,
          quota,
          wonAmount,
          wonCount: won.length,
          gap,
          forecast,
          coverage,
          ticket,
          attainment: quota ? (wonAmount / quota) * 100 : 0,
          openAll,
          openQ,
          ranked,
          plan,
          dealsNeeded: gap && ticket ? Math.ceil(gap / ticket) : 0,
          tone,
        };
      }),
    [scopeOwners, quotaByOwner, report.deals, periodKey],
  );

  const focus = rows[0];
  const detail = filters.ownerId === "team" ? null : focus ?? null;

  const pickedDeals = detail ? detail.openQ.filter((deal) => picked[deal.id]) : [];
  const pickedAmount = sum(pickedDeals, (d) => d.amountValue);
  const simulated = detail ? detail.wonAmount + pickedAmount : 0;
  const simAttainment = detail && detail.quota ? (simulated / detail.quota) * 100 : 0;

  const levers: Lever[] = useMemo(() => {
    if (!detail) return [];
    const open = detail.openQ;
    return [
      {
        id: "cerrar-ya",
        label: "Cerrar ya (score alto)",
        help: "Deals con score de empuje ≥ 70: la energía aquí convierte rápido.",
        deals: open.filter((deal) => pushScore(deal) >= 70),
        tone: "ok",
      },
      {
        id: "negociar",
        label: "Negociación tardía",
        help: "Deals en E5 / E5.1: empujar contrato y firma.",
        deals: open.filter((deal) => deal.stageKey === "E5" || deal.stageKey === "E5.1"),
        tone: "ok",
      },
      {
        id: "rescatar",
        label: "Rescatar (score bajo, monto alto)",
        help: "Deals con score < 40 y monto sobre el ticket promedio: requieren plan o descarte.",
        deals: open.filter((deal) => pushScore(deal) < 40 && deal.amountValue >= detail.ticket),
        tone: "bad",
      },
      {
        id: "sin-actividad",
        label: "Sin próxima actividad",
        help: "Deals abiertos sin actividad agendada: riesgo de ghosting.",
        deals: open.filter((deal) => !deal.nextActivityValue),
        tone: "warn",
      },
      {
        id: "vencidos",
        label: "Fecha de cierre vencida",
        help: "Deals con fecha de cierre pasada: recalendarizar o cerrar.",
        deals: open.filter((deal) => deal.closeStatusValue === 1),
        tone: "warn",
      },
      {
        id: "expansion",
        label: "Expansión disponible",
        help: "Upsell y cross sell abiertos: ciclo más corto que venta nueva.",
        deals: open.filter((deal) => deal.family === "Expansión"),
        tone: "ok",
      },
    ];
  }, [detail]);

  const openDrill = (title: string, subtitle: string, deals: InsightDeal[]) =>
    setDrill({ title, subtitle, deals });

  return (
    <main className="pulse-main">
      {tabs}
      <header className="team-header">
        <div>
          <h1 className="pulse-h1">Simulador de Estrategia</h1>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            Qué falta para la cuota, cuántos deals hay que ganar y dónde conviene empujar
          </div>
        </div>
      </header>

      <CompactFilterBar
        years={report.years}
        quarters={filters.quartersAvailable}
        owners={roleOwnerOptions}
        year={filters.year}
        quarter={filters.quarter}
        ownerId={filters.ownerId}
        stages={stageFilter}
        onYear={filters.setYear}
        onQuarter={filters.setQuarter}
        onOwner={filters.setOwnerId}
        onStages={setStageFilter}
        role={role}
        onRole={(item) => {
          onRole?.(item);
          filters.setOwnerId("team");
        }}
        ago={ago}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        label="Filtros del simulador"
      />

      <SectionTitle note={`cuotas del periodo ${periodKey}`}>Mapa de esfuerzo por comercial</SectionTitle>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Comercial</th>
              <th>Cuota</th>
              <th>Ganado</th>
              <th>Cumplimiento</th>
              <th>Gap</th>
              <th>Pronóstico</th>
              <th>Cobertura</th>
              <th>Deals a ganar</th>
              <th>Pipeline Q</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.owner.id}>
                <td>
                  <button className="cell-button" type="button" onClick={() => filters.setOwnerId(row.owner.id)}>
                    {row.owner.name}
                  </button>
                </td>
                <td>{money(row.quota)}</td>
                <td>{money(row.wonAmount)}</td>
                <td>
                  <span className="status" data-tone={row.tone}>
                    {pct(row.attainment)}
                  </span>
                </td>
                <td>{money(row.gap)}</td>
                <td>{money(row.forecast)}</td>
                <td>{row.gap ? `${row.coverage.toFixed(1)}x` : "cumplida"}</td>
                <td>{row.dealsNeeded || "—"}</td>
                <td>
                  <button
                    className="cell-button"
                    type="button"
                    onClick={() => openDrill(`Pipeline Q · ${row.owner.name}`, periodKey, row.openQ)}
                  >
                    {row.openQ.length} · {money(sum(row.openQ, (d) => d.amountValue))}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!detail ? (
        <p className="eyebrow" style={{ marginTop: 20 }}>
          Elige un comercial arriba para simular su plan de cierre deal por deal.
        </p>
      ) : (
        <>
          <SectionTitle note={`${detail.owner.name} · ${periodKey}`}>Simulación de cierre</SectionTitle>
          <section className="grid-4">
            <Metric
              label="Cuota del periodo"
              value={money(detail.quota)}
              note={`ganado ${money(detail.wonAmount)} · ${detail.wonCount} deals`}
              tooltip="Cuota MRR del trimestre seleccionado según los goal targets de HubSpot."
            />
            <Metric
              label="Gap por cerrar"
              value={money(detail.gap)}
              note={`cobertura ${detail.gap ? `${detail.coverage.toFixed(1)}x` : "cumplida"}`}
              tone={detail.tone}
              tooltip="Cuota menos lo ganado. La cobertura compara el pipeline ponderado del Q contra ese gap."
            />
            <Metric
              label="Escenario simulado"
              value={money(simulated)}
              note={`${pickedDeals.length} deals marcados · ${pct(simAttainment)} de la cuota`}
              tone={simAttainment >= 100 ? "ok" : simAttainment >= 70 ? "warn" : "bad"}
              progress={simAttainment}
              tooltip="Ganado real más los deals que marcas abajo como ganables."
            />
            <Metric
              label="Plan sugerido"
              value={`${detail.plan.length} deals`}
              note={`${money(sum(detail.plan, (d) => d.amountValue))} · ticket ${money(Math.round(detail.ticket))}`}
              onClick={() => openDrill("Plan sugerido", "mejores scores hasta cubrir el gap", detail.plan)}
              tooltip="Los deals con mejor score de empuje que, sumados, cubren el gap del periodo."
            />
          </section>

          <div className="rep-chart" style={{ marginTop: 20 }}>
            <span className="metric-label">Marca los deals que crees ganables y mira el impacto</span>
            <div className="sim-list">
              {detail.ranked.map((deal) => {
                const score = pushScore(deal);
                return (
                  <label
                    key={deal.id}
                    className="sim-row"
                    data-picked={picked[deal.id] ? "" : undefined}
                    data-suggested={detail.plan.includes(deal) ? "" : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(picked[deal.id])}
                      onChange={(event) =>
                        setPicked((prev) => ({ ...prev, [deal.id]: event.target.checked }))
                      }
                    />
                    <span className="sim-name">
                      <a href={deal.url} target="_blank" rel="noreferrer">
                        {deal.name}
                      </a>
                      <em>
                        {deal.stageKey} · {deal.motion} · cierre {deal.closeDate}
                      </em>
                    </span>
                    <span className="sim-amount">{deal.amount}</span>
                    <span className="sim-score" data-tone="neutral" title="% de cierre de la etapa">
                      {deal.probability}
                    </span>
                    <span className="sim-score" data-tone={score >= 70 ? "ok" : score >= 40 ? "warn" : "bad"}>
                      {score}
                    </span>
                  </label>
                );
              })}
              {!detail.ranked.length ? (
                <div className="empty-state">Sin deals abiertos con cierre en el periodo.</div>
              ) : null}
            </div>
            <div className="sim-actions">
              <button className="tab" type="button" onClick={() => setPicked({})}>
                Limpiar selección
              </button>
              <button
                className="tab"
                type="button"
                onClick={() =>
                  setPicked(Object.fromEntries(detail.plan.map((deal) => [deal.id, true])))
                }
              >
                Cargar plan sugerido
              </button>
            </div>
          </div>

          <SectionTitle note="dónde poner la energía esta semana">Palancas de estrategia</SectionTitle>
          <div className="rep-chart">
            <HBars
              data={levers.map((lever) => ({
                key: lever.id,
                label: lever.label,
                value: sum(lever.deals, (d) => d.amountValue),
                note: `${lever.deals.length} deals`,
                tone: lever.tone,
              }))}
              onSelect={(key) => {
                const lever = levers.find((item) => item.id === key);
                if (lever) openDrill(lever.label, lever.help, lever.deals);
              }}
            />
          </div>
          <div className="grid-4" style={{ marginTop: 16 }}>
            {levers.map((lever) => (
              <Metric
                key={lever.id}
                label={lever.label}
                value={String(lever.deals.length)}
                note={money(sum(lever.deals, (d) => d.amountValue))}
                tone={lever.tone}
                onClick={() => openDrill(lever.label, lever.help, lever.deals)}
                tooltip={lever.help}
              />
            ))}
          </div>
        </>
      )}

      <DealModal payload={drill} onClose={() => setDrill(null)} initialStages={stageFilter} />
    </main>
  );
}
