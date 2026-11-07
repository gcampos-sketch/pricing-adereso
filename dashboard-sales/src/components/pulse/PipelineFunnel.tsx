import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Info, Minus, Plus, RotateCcw, Save, SlidersHorizontal, Wand2, X } from "lucide-react";
import type { DealDTO, Drilldown, PeriodStats, PulseReport, Tone } from "@/lib/pulse-types";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const signedMoney = (value: number) => `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;

const pctDiff = (value: number, base: number) => (base ? Math.round((value / base - 1) * 100) : 0);

const firstName = (full: string) => {
  const trimmed = (full || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "sin propietario") return trimmed || "S/N";
  return trimmed.split(/\s+/)[0] ?? "S/N";
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type Knobs = { gen: number; valor: number; wr: number; wrCount: number; ticket: number };
type ScenarioKind = "pesimista" | "neutro" | "optimista";

type SavedScenario = {
  id: string;
  name: string;
  kind: ScenarioKind;
  note: string;
  createdAt: number;
  knobs: Knobs;
  won: number;
  valorized: number;
  generated: number;
  baseWon: number;
  baseValorized: number;
  baseGenerated: number;
};

const STORE_KEY = "pipeline-scenarios-v1";

const KIND_LABEL: Record<ScenarioKind, string> = {
  pesimista: "Pesimista",
  neutro: "Neutro",
  optimista: "Optimista",
};

/** Perilla: slider liquid glass con valor, baseline y ajuste fino. */
function Knob({
  label,
  help,
  value,
  min,
  max,
  step,
  suffix,
  baseline,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  baseline: number;
  onChange: (value: number) => void;
}) {
  const moved = Math.abs(value - baseline) > 0.001;
  const nudge = (delta: number) => onChange(clamp(Math.round(value + delta), min, max));
  return (
    <div className="knob" data-moved={moved || undefined}>
      <span className="knob-head">
        <span className="knob-label">
          {label}
          <span className="knob-help" title={help} aria-label={help}>
            <Info size={12} aria-hidden="true" />
          </span>
        </span>
        <span className="knob-value">
          {value > 0 && suffix === "%" && label.startsWith("Pipe") ? "+" : ""}
          {Math.round(value)}
          {suffix}
        </span>
      </span>
      <div className="knob-row">
        <button type="button" className="knob-step" onClick={() => nudge(-1)} aria-label={`Bajar ${label}`}>
          <Minus size={12} aria-hidden="true" />
        </button>
        <input
          type="range"
          className="knob-range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
        />
        <button type="button" className="knob-step" onClick={() => nudge(1)} aria-label={`Subir ${label}`}>
          <Plus size={12} aria-hidden="true" />
        </button>
      </div>
      <span className="knob-note">
        actual {Math.round(baseline)}
        {suffix}
      </span>
    </div>
  );
}

type Stage = {
  key: string;
  label: string;
  note: string;
  amount: number;
  simAmount: number;
  share: number;
  simShare: number;
  tone: Tone;
  chips: { label: string; value: string; tone: Tone }[];
  deals: DealDTO[] | null;
  drillTitle: string;
  showDelta: boolean;
};

export function PipelineFunnel({
  report,
  ownerFilter,
  ownerName,
  rangeLabel,
  periodData,
  quota,
  onDrill,
}: {
  report: PulseReport;
  ownerFilter: string;
  ownerName: string;
  rangeLabel: string;
  periodData: { team: PeriodStats; owners: Record<string, PeriodStats> } | null;
  quota: number;
  onDrill: (payload: Drilldown) => void;
  onModal?: (key: string) => void;
}) {
  const isTeam = ownerFilter === "team";

  /** Generación por comercial: ganado + perdido + pipeline abierto del corte. */
  const genRows = useMemo(() => {
    const rows = Object.entries(report.periods.owners).map(([id, name]) => {
      const stats = periodData?.owners[id];
      const ownerRow = report.ownerRows.find((row) => row.id === id);
      const won = stats?.wonAmount ?? 0;
      const lost = stats?.lostAmount ?? 0;
      const open = ownerRow?.openAmount ?? 0;
      return {
        id,
        name: firstName(name),
        won,
        lost,
        open,
        weighted: ownerRow?.weightedQ ?? 0,
        wonCount: stats?.won ?? 0,
        lostCount: stats?.lost ?? 0,
        openCount: ownerRow?.openCount ?? 0,
        generated: won + lost + open,
      };
    });
    const total = rows.reduce((acc, row) => acc + row.generated, 0) || 1;
    return rows
      .map((row) => ({ ...row, share: (row.generated / total) * 100 }))
      .sort((a, b) => b.generated - a.generated);
  }, [report.periods.owners, report.ownerRows, periodData]);

  const scopeRows = isTeam ? genRows : genRows.filter((row) => row.id === ownerFilter);

  const totals = useMemo(() => {
    const acc = { generated: 0, won: 0, lost: 0, open: 0, weighted: 0, wonCount: 0, lostCount: 0, openCount: 0 };
    for (const row of scopeRows) {
      acc.generated += row.generated;
      acc.won += row.won;
      acc.lost += row.lost;
      acc.open += row.open;
      acc.weighted += row.weighted;
      acc.wonCount += row.wonCount;
      acc.lostCount += row.lostCount;
      acc.openCount += row.openCount;
    }
    return acc;
  }, [scopeRows]);

  const valorized = totals.weighted + totals.won;
  const baseValor = totals.generated ? (valorized / totals.generated) * 100 : 0;
  const baseWr = valorized ? (totals.won / valorized) * 100 : 0;
  const closedCount = totals.wonCount + totals.lostCount;
  const baseWrCount = closedCount ? (totals.wonCount / closedCount) * 100 : 0;

  const baseline: Knobs = { gen: 0, valor: baseValor, wr: baseWr, wrCount: baseWrCount, ticket: 0 };
  const [knobs, setKnobs] = useState<Knobs>(baseline);
  const [live, setLive] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saved, setSaved] = useState<SavedScenario[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) setSaved(JSON.parse(raw) as SavedScenario[]);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (rows: SavedScenario[]) => {
    setSaved(rows);
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(rows));
    } catch {
      /* ignore */
    }
  };

  const active = live ? knobs : baseline;
  const set = (patch: Partial<Knobs>) => {
    setKnobs((prev) => ({ ...(live ? prev : baseline), ...patch }));
    setLive(true);
  };
  const reset = () => {
    setKnobs(baseline);
    setLive(false);
    setSaveOpen(false);
  };

  const simGenerated = totals.generated * (1 + active.gen / 100);
  const simValorized = simGenerated * (active.valor / 100);
  const simWon = simValorized * (active.wr / 100) * (1 + active.ticket / 100);
  const simLost = Math.max(0, simValorized - simWon);
  const simWonCount = Math.round(closedCount * (active.wrCount / 100));
  const simLostShare = simGenerated ? (simLost / simGenerated) * 100 : 0;
  const baseLostShare = totals.generated ? (totals.lost / totals.generated) * 100 : 0;
  const wonOtf = (isTeam ? periodData?.team.wonOtf : periodData?.owners[ownerFilter]?.wonOtf) ?? 0;
  const otfBonus = wonOtf / 12;
  const currentAttainment = quota > 0 ? ((totals.won + otfBonus) / quota) * 100 : null;
  const scenarioAttainment = quota > 0 ? ((simWon + otfBonus) / quota) * 100 : null;
  const attainment = live ? scenarioAttainment : currentAttainment;
  const attainmentDelta = scenarioAttainment !== null && currentAttainment !== null ? scenarioAttainment - currentAttainment : 0;
  const formatPercent = (value: number) => `${value.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;

  /** WR por segmento agregado del scope. */
  const wrChips = useMemo<{ label: string; value: string; tone: Tone }[]>(() => {
    const rows = isTeam ? report.quotaRows : report.quotaRows.filter((row) => row.id === ownerFilter);
    const agg = {
      inbound: { won: 0, lost: 0 },
      outbound: { won: 0, lost: 0 },
      upsell: { won: 0, lost: 0 },
      crossSell: { won: 0, lost: 0 },
    };
    for (const row of rows) {
      const seg = row.wrBySegment ?? {};
      for (const key of ["inbound", "outbound", "upsell", "crossSell"] as const) {
        const stats = seg[key];
        if (stats) {
          agg[key].won += stats.won;
          agg[key].lost += stats.lost;
        }
      }
    }
    const chip = (label: string, stats: { won: number; lost: number }) => {
      const total = stats.won + stats.lost;
      const pct = total ? Math.round((stats.won / total) * 100) : null;
      const tone: Tone = pct === null ? "neutral" : pct >= 50 ? "ok" : pct >= 30 ? "warn" : "bad";
      return { label, value: pct === null ? "Sin cierres" : `${pct}% · ${stats.won}/${total}`, tone };
    };
    const all = [
      chip("Outbound", agg.outbound),
      chip("Inbound", agg.inbound),
      chip("Upsell", agg.upsell),
      chip("Cross sell", agg.crossSell),
    ];
    return all;
  }, [isTeam, report.quotaRows, ownerFilter]);

  /** Motivos principales de pérdida del corte. */
  const lostDeals = useMemo<DealDTO[]>(() => {
    if (!periodData) return [];
    if (isTeam) return periodData.team.lostDeals ?? [];
    return periodData.owners[ownerFilter]?.lostDeals ?? [];
  }, [periodData, isTeam, ownerFilter]);

  const wonDeals = useMemo<DealDTO[]>(() => {
    if (!periodData) return [];
    if (isTeam) return periodData.team.wonDeals ?? [];
    return periodData.owners[ownerFilter]?.wonDeals ?? [];
  }, [periodData, isTeam, ownerFilter]);

  const lostChips = useMemo(() => {
    const groups = new Map<string, { count: number; amount: number; deals: DealDTO[] }>();
    for (const deal of lostDeals) {
      const key = (deal.lostReason || "Sin motivo registrado").trim();
      const bucket = groups.get(key) ?? { count: 0, amount: 0, deals: [] };
      bucket.count += 1;
      bucket.amount += deal.amountValue;
      bucket.deals.push(deal);
      groups.set(key, bucket);
    }
    return [...groups.entries()]
      .map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.amount - a.amount || b.count - a.count)
      .slice(0, 3);
  }, [lostDeals]);

  const stages: Stage[] = [
    {
      key: "generado",
      label: "Generado",
      note: `${totals.wonCount + totals.lostCount + totals.openCount} deals · ganado + perdido + abierto`,
      amount: totals.generated,
      simAmount: simGenerated,
      share: 100,
      simShare: 100,
      tone: "neutral",
      chips: scopeRows.map((row) => ({
        label: row.name,
        value: `${Math.round(row.share)}%`,
        tone: "neutral" as Tone,
      })),
      deals: null,
      drillTitle: "",
      showDelta: true,
    },
    {
      key: "valorizado",
      label: "Valorizado",
      note: `Ponderado ${money(totals.weighted)} + ganado`,
      amount: valorized,
      simAmount: simValorized,
      share: totals.generated ? (valorized / totals.generated) * 100 : 0,
      simShare: simGenerated ? (simValorized / simGenerated) * 100 : 0,
      tone: baseValor >= 50 ? "ok" : baseValor >= 30 ? "warn" : "bad",
      chips: scopeRows.map((row) => ({
        label: row.name,
        value: row.generated ? `${Math.round(((row.weighted + row.won) / row.generated) * 100)}%` : "s/d",
        tone: "neutral" as Tone,
      })),
      deals: null,
      drillTitle: "",
      showDelta: true,
    },
    {
      key: "ganado",
      label: "Ganado",
      note: `${live ? simWonCount : totals.wonCount} deals ganados`,
      amount: totals.won,
      simAmount: simWon,
      share: totals.generated ? (totals.won / totals.generated) * 100 : 0,
      simShare: simGenerated ? (simWon / simGenerated) * 100 : 0,
      tone: baseWr >= 40 ? "ok" : baseWr >= 20 ? "warn" : "bad",
      chips: wrChips,
      deals: wonDeals,
      drillTitle: `Ganados ${rangeLabel}`,
      showDelta: true,
    },
    {
      key: "perdido",
      label: "Perdido",
      note: `${totals.lostCount} deals · principales motivos`,
      amount: totals.lost,
      simAmount: totals.lost,
      share: baseLostShare,
      simShare: baseLostShare,
      tone: totals.lostCount ? "warn" : "ok",
      chips: lostChips.map((item) => ({
        label: item.label,
        value: `${item.count} ${item.count === 1 ? "deal" : "deals"} · ${money(item.amount)}`,
        tone: "bad" as Tone,
      })),
      deals: lostDeals,
      drillTitle: `Perdidos ${rangeLabel}`,
      showDelta: false,
    },
  ];

  const delta = simWon - totals.won;

  const movedList = useMemo(() => {
    if (!live) return [] as string[];
    const items: string[] = [];
    if (Math.abs(active.gen) > 0.001) items.push(`Pipe generado ${active.gen > 0 ? "+" : ""}${Math.round(active.gen)}%`);
    if (Math.abs(active.ticket) > 0.001) items.push(`Ticket ${active.ticket > 0 ? "+" : ""}${Math.round(active.ticket)}%`);
    if (Math.abs(active.valor - baseValor) > 0.5) items.push(`Valorización ${Math.round(active.valor)}%`);
    if (Math.abs(active.wr - baseWr) > 0.5) items.push(`WR $$$ ${Math.round(active.wr)}%`);
    if (Math.abs(active.wrCount - baseWrCount) > 0.5) items.push(`WR cantidad ${Math.round(active.wrCount)}%`);
    return items;
  }, [live, active, baseValor, baseWr, baseWrCount]);

  const controlsFor = (stageKey: string) => {
    if (stageKey === "generado") {
      return (
        <>
          <Knob
            label="Pipe generado"
            help="Cuánto más o menos pipeline se genera respecto de hoy."
            value={active.gen}
            min={-50}
            max={100}
            step={1}
            suffix="%"
            baseline={0}
            onChange={(value) => set({ gen: value })}
          />
          <Knob
            label="Ticket promedio"
            help="Variación del monto promedio de los deals ganados."
            value={active.ticket}
            min={-30}
            max={60}
            step={1}
            suffix="%"
            baseline={0}
            onChange={(value) => set({ ticket: value })}
          />
        </>
      );
    }
    if (stageKey === "valorizado") {
      return (
        <Knob
          label="Valorización"
          help="Qué parte del pipeline generado se sostiene con valor ponderado o ganado."
          value={active.valor}
          min={0}
          max={100}
          step={1}
          suffix="%"
          baseline={baseValor}
          onChange={(value) => set({ valor: value })}
        />
      );
    }
    if (stageKey === "ganado") {
      return (
        <>
          <Knob
            label="Win rate ($$$)"
            help="Qué parte del monto valorizado termina ganada."
            value={active.wr}
            min={0}
            max={100}
            step={1}
            suffix="%"
            baseline={baseWr}
            onChange={(value) => set({ wr: value })}
          />
          <Knob
            label="Win rate (cant.)"
            help="Ganados ÷ deals cerrados (ganados + perdidos). Cambia la cantidad simulada, no el monto ni el cumplimiento de cuota."
            value={active.wrCount}
            min={0}
            max={100}
            step={1}
            suffix="%"
            baseline={baseWrCount}
            onChange={(value) => set({ wrCount: value })}
          />
        </>
      );
    }
    return null;
  };

  const saveScenario = (name: string, kind: ScenarioKind, note: string) => {
    const row: SavedScenario = {
      id: `${Date.now()}`,
      name: name.trim() || "Escenario sin nombre",
      kind,
      note: note.trim(),
      createdAt: Date.now(),
      knobs: { ...active },
      won: simWon,
      valorized: simValorized,
      generated: simGenerated,
      baseWon: totals.won,
      baseValorized: valorized,
      baseGenerated: totals.generated,
    };
    persist([row, ...saved]);
    setSaveOpen(false);
  };

  return (
    <div className="funnel">
      <div className="funnel-head">
        <div>
          <span className="eyebrow">
            {ownerName} · {rangeLabel} · generado → valorizado → ganado → perdido
          </span>
          <div className="funnel-delta" data-tone={delta > 0 ? "ok" : delta < 0 ? "bad" : "neutral"}>
            {live
              ? `Escenario: ${money(simWon)} ganado de ${money(simGenerated)} generado · ${signedMoney(delta)} vs actual`
              : `Actual: ${money(totals.won)} ganado de ${money(totals.generated)} generado`}
          </div>
        </div>
        <button className="funnel-reset" type="button" onClick={reset} disabled={!live}>
          <RotateCcw size={13} aria-hidden="true" />
          <span>Volver a lo actual</span>
        </button>
      </div>

      <div className="funnel-stages">
        {stages.map((stage, index) => {
          const stageDelta = stage.simAmount - stage.amount;
          const showChip = live && stage.showDelta && Math.abs(stageDelta) > 1;
          return (
            <div className="funnel-stage-wrap" key={stage.key}>
              <article className="funnel-stage" data-tone={stage.tone} style={{ animationDelay: `${index * 70}ms` }}>
                <div className="funnel-stage-summary">
                  <div className="funnel-stage-head">
                    <span className="funnel-stage-label"><i aria-hidden="true" />{stage.label}</span>
                    <span className="funnel-stage-metrics">
                      <span className="funnel-stage-share" title="Monto de esta etapa dividido por el pipeline generado; no es cumplimiento de cuota.">{Math.round(live ? stage.simShare : stage.share)}% del generado</span>
                      {showChip ? (
                        <span className="funnel-stage-diff" data-tone={stageDelta > 0 ? "ok" : "bad"}>
                          {signedMoney(stageDelta)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <strong className="funnel-stage-amount">{money(live ? stage.simAmount : stage.amount)}</strong>
                  <div className="funnel-track">
                    <div
                      className="funnel-fill"
                      data-tone={stage.tone}
                      style={{ width: `${clamp(live ? stage.simShare : stage.share, 2, 100)}%` }}
                    >
                      <span className="funnel-flow" aria-hidden="true" />
                    </div>
                    {live ? (
                      <span className="funnel-ghost" aria-hidden="true" style={{ width: `${clamp(stage.share, 2, 100)}%` }} />
                    ) : null}
                  </div>
                  <p className="funnel-stage-note">{stage.note}</p>
                  {stage.key === "ganado" ? (
                    <div className="funnel-attainment" data-tone={attainment === null ? "neutral" : attainment >= 100 ? "ok" : attainment >= 60 ? "warn" : "bad"} aria-live="polite">
                      <div className="funnel-attainment-head">
                        <span>{live ? "Cumplimiento simulado" : "Cumplimiento de cuota"}</span>
                        <strong>{attainment === null ? "Sin cuota" : formatPercent(attainment)}</strong>
                      </div>
                      {attainment !== null ? (
                        <>
                          <progress className="funnel-quota-progress" max={100} value={clamp(attainment, 0, 100)} aria-label="Cumplimiento de cuota" />
                          <span className="funnel-attainment-note">Meta {money(quota)} · {rangeLabel}</span>
                          <span className="funnel-attainment-note">MRR {money(live ? simWon : totals.won)} + OTF/12 {money(otfBonus)}{live ? " fijo" : ""}</span>
                          {live && currentAttainment !== null ? <span className="funnel-attainment-change" title="Variación en puntos porcentuales de cumplimiento frente a lo actual.">Actual {formatPercent(currentAttainment)} → {formatPercent(attainment)} · {attainmentDelta >= 0 ? "+" : "−"}{Math.abs(attainmentDelta).toLocaleString("es-CL", { maximumFractionDigits: 1 })} pp</span> : null}
                        </>
                      ) : <span className="funnel-attainment-note">Sin meta registrada para este período.</span>}
                    </div>
                  ) : null}
                  <span className="funnel-chip-caption">{stage.key === "generado" ? "Participación del generado del equipo" : stage.key === "valorizado" ? "% valorizado por comercial" : stage.key === "ganado" ? "WR actual · ganados/cerrados" : "Motivos de pérdida · deals y monto"}</span>
                  <div className="funnel-chips">
                    {stage.chips.map((chip) => (
                      <span className="funnel-chip" key={`${stage.key}-${chip.label}`} data-tone={chip.tone} title={stage.key === "ganado" ? `${chip.label}: win rate actual por cantidad; ganados dividido por ganados + perdidos. No cambia con la simulación.` : `${chip.label}: ${chip.value}`}>
                        <i>{chip.label}</i>
                        <b>{chip.value}</b>
                      </span>
                    ))}
                  </div>
                  {stage.deals && stage.deals.length ? (
                    <button
                      className="funnel-stage-open"
                      type="button"
                      onClick={() =>
                        onDrill({
                          title: `${ownerName} · ${stage.drillTitle}`,
                          subtitle: `${stage.deals?.length ?? 0} deals del corte`,
                          deals: stage.deals ?? [],
                        })
                      }
                    >
                      Ver los {stage.deals.length} deals
                    </button>
                  ) : null}
                </div>
                <div className="funnel-stage-controls">
                  {controlsFor(stage.key) ? (
                    <><span className="funnel-sim-label"><SlidersHorizontal size={13} aria-hidden="true" /> Simular</span>{controlsFor(stage.key)}</>
                  ) : <span className="funnel-no-control">Pérdidas reales · sin cambios</span>}
                </div>
              </article>
              {index < stages.length - 1 ? <span className="funnel-arrow" aria-hidden="true"><ArrowRight size={16} /></span> : null}
            </div>
          );
        })}
      </div>

      {live ? (
        <section className="scn-bar">
          <div className="scn-bar-head">
            <span className="scn-bar-title">
              <i className="scn-pulse" aria-hidden="true" />
              Escenario sin guardar
              {movedList.length ? <em> · moviste: {movedList.join(" · ")}</em> : null}
            </span>
            <button type="button" className="scn-save" onClick={() => setSaveOpen(true)}>
              <Save size={14} aria-hidden="true" />
              <span>Guardar escenario</span>
            </button>
          </div>
          <div className="scn-bar-grid">
            <p>
              <b>Generado</b> {money(simGenerated)} ·{" "}
              {Math.abs(simGenerated - totals.generated) < 1 ? "sin cambio" : signedMoney(simGenerated - totals.generated)}
            </p>
            <p>
              <b>Valorizado</b> {money(simValorized)} · {signedMoney(simValorized - valorized)} ·{" "}
              {Math.round(active.valor)}% del generado
            </p>
            <p>
              <b>Ganado</b> · WR $$$ {Math.round(active.wr)}% {money(simWon)} · {signedMoney(delta)}
            </p>
            <p>
              <b>WR cantidad</b> {Math.round(active.wrCount)}% → {simWonCount} de {closedCount} deals
            </p>
            <p><b>Cumplimiento de cuota</b> {attainment === null ? "Sin cuota" : `${formatPercent(attainment)} · meta ${money(quota)}`}</p>
            <p>
              <b>Perdido</b> {money(totals.lost)} fijo · de {Math.round(baseLostShare)}% → {Math.round(simLostShare)}% del generado
            </p>
          </div>
        </section>
      ) : null}

      <section className="scn-vault">
        <div className="scn-vault-head">
          <h3>
            Escenarios guardados {saved.length ? <span>({saved.length})</span> : null}
          </h3>
          <span className="scn-vault-note">
            Δ medido vs. la foto actual · ganado {money(totals.won)} · generado {money(totals.generated)}
          </span>
        </div>
        {saved.length ? (
          <div className="scn-grid">
            {saved.map((row) => (
              <article className="scn-card" key={row.id} data-kind={row.kind}>
                <header className="scn-card-head">
                  <span className="scn-kind">{KIND_LABEL[row.kind]}</span>
                  <strong>{row.name}</strong>
                  <button
                    type="button"
                    className="scn-del"
                    onClick={() => persist(saved.filter((item) => item.id !== row.id))}
                    aria-label="Eliminar escenario"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </header>
                <dl className="scn-rows">
                  {(
                    [
                      ["Ganado", row.won, row.baseWon],
                      ["Valorizado", row.valorized, row.baseValorized],
                      ["Generado", row.generated, row.baseGenerated],
                    ] as const
                  ).map(([label, value, base]) => {
                    const diff = value - base;
                    return (
                      <div className="scn-row" key={label}>
                        <dt>{label}</dt>
                        <dd className="scn-row-value">{money(value)}</dd>
                        <dd className="scn-row-diff" data-tone={diff > 0 ? "ok" : diff < 0 ? "bad" : "neutral"}>
                          {signedMoney(diff)} ({pctDiff(value, base) >= 0 ? "+" : ""}
                          {pctDiff(value, base)}%)
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                <div className="scn-knobs">
                  <span>Pipe <b>{Math.round(row.knobs.gen)}%</b></span>
                  <span>Ticket <b>{Math.round(row.knobs.ticket)}%</b></span>
                  <span>Valo <b>{Math.round(row.knobs.valor)}%</b></span>
                  <span>WR$ <b>{Math.round(row.knobs.wr)}%</b></span>
                  <span>WRcant <b>{Math.round(row.knobs.wrCount)}%</b></span>
                </div>
                {row.note ? <p className="scn-note">{row.note}</p> : null}
                <footer className="scn-card-foot">
                  <time>{new Date(row.createdAt).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                  <button
                    type="button"
                    className="scn-apply"
                    onClick={() => {
                      setKnobs(row.knobs);
                      setLive(true);
                    }}
                  >
                    <Wand2 size={13} aria-hidden="true" />
                    Aplicar al modelo
                  </button>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="scn-empty">
            Aún no guardas escenarios. Mueve las perillas y usa <b>Guardar escenario</b> para comparar estrategias.
          </div>
        )}
      </section>

      {saveOpen ? (
        <SaveDialog
          projectedWon={simWon}
          baseWon={totals.won}
          onClose={() => setSaveOpen(false)}
          onSave={saveScenario}
        />
      ) : null}
    </div>
  );
}

function SaveDialog({
  projectedWon,
  baseWon,
  onClose,
  onSave,
}: {
  projectedWon: number;
  baseWon: number;
  onClose: () => void;
  onSave: (name: string, kind: ScenarioKind, note: string) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ScenarioKind>("neutro");
  const [note, setNote] = useState("");
  const diff = projectedWon - baseWon;

  return (
    <div className="scn-modal" role="dialog" aria-modal="true" aria-label="Guardar escenario">
      <button type="button" className="scn-modal-backdrop" onClick={onClose} aria-label="Cerrar" />
      <form
        className="scn-modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name, kind, note);
        }}
      >
        <h4>Guardar escenario</h4>
        <label className="scn-field">
          <span>Nombre del escenario</span>
          <input
            className="scn-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej. Subir ticket + más pipe"
            autoFocus
          />
        </label>
        <div className="scn-field">
          <span>¿Cómo lo consideras?</span>
          <div className="scn-kinds">
            {(["pesimista", "neutro", "optimista"] as ScenarioKind[]).map((option) => (
              <button
                key={option}
                type="button"
                className="scn-kind-chip"
                data-kind={option}
                data-active={kind === option || undefined}
                onClick={() => setKind(option)}
              >
                {KIND_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
        <label className="scn-field">
          <span>Nota / hipótesis <em>opcional</em></span>
          <textarea
            className="scn-input scn-textarea"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="¿Qué palanca estás probando y por qué?"
            rows={3}
          />
        </label>
        <p className="scn-preview">
          Proyecta <b>{money(projectedWon)}</b> ganado · <span data-tone={diff >= 0 ? "ok" : "bad"}>{signedMoney(diff)} ({pctDiff(projectedWon, baseWon) >= 0 ? "+" : ""}{pctDiff(projectedWon, baseWon)}%)</span> vs. la foto actual ({money(baseWon)}).
        </p>
        <div className="scn-modal-foot">
          <button type="button" className="scn-cancel" onClick={onClose}>Cancelar</button>
          <button type="submit" className="scn-save">
            <Save size={14} aria-hidden="true" />
            Guardar escenario
          </button>
        </div>
      </form>
    </div>
  );
}
