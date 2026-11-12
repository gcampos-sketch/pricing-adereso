import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, GitCompareArrows, X } from "lucide-react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { DealDTO, StageJourney } from "@/lib/pulse-types";
import { flowStageDate, journeyInPeriods, stageInPeriods, type FlowDateBasis } from '@/lib/stage-date-scope';

type StageKey = "E0" | "E1" | "E2" | "E4" | "E5" | "E5.1" | "E6" | "E6.1" | "E6.2" | "E8";
type FlowKind = "advance" | "won" | "warning" | "lost" | "lostDev" | "anomaly";

const STAGES: { key: StageKey; name: string; role: string; level: number; x: number; y: number; milestone?: string }[] = [
  { key: "E0", name: "Reunión agendada", role: "agendada", level: 0, x: 80, y: 220 },
  { key: "E1", name: "Reunión comercial", role: "Reunión", level: 1, x: 245, y: 220 },
  { key: "E2", name: "Bajada de requerimientos", role: "opcional", level: 2, x: 425, y: 110 },
  { key: "E4", name: "Elaboración de propuesta", role: "obligatoria", level: 2, x: 425, y: 220 },
  { key: "E5", name: "Negociación", role: "Negociación", level: 3, x: 620, y: 220 },
  { key: "E5.1", name: "PoC / Demo", role: "PoC / Demo", level: 4, x: 800, y: 220 },
  { key: "E6", name: "Propuesta firmada", role: "★ gana", level: 5, x: 980, y: 220, milestone: "Ganado" },
  { key: "E6.1", name: "Deal Warning", role: "warning", level: 6, x: 1160, y: 110 },
  { key: "E6.2", name: "Proyecto en desarrollo", role: "✓ cuenta", level: 6, x: 1160, y: 220, milestone: "Cuenta para la meta" },
  { key: "E8", name: "Servicio iniciado", role: "$ comisión", level: 7, x: 1335, y: 220, milestone: "Comisiona" },
];

const STAGE_INDEX = new Map(STAGES.map((stage, index) => [stage.key, index]));
const SALES_LOST = new Set(["171385869"]);
const DEV_LOST = new Set(["1372234925", "213417520", "178228041"]);

type Flow = {
  dateBasis?: FlowDateBasis;
  id: string;
  from: StageKey;
  to: StageKey | "Perdido" | "Perdido desarrollo";
  kind: FlowKind;
  title?: string;
  description?: string;
  summary?: boolean;
  deals: StageJourney[];
  count: number;
  percent: number;
  path: string;
  labelX: number;
  labelY: number;
};

const quarterIndex = (period: string) => {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : null;
};

const quarterFromIndex = (index: number) => `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] ?? 0 : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const diffDays = (from?: string, to?: string) => {
  if (!from || !to) return 0;
  const value = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  return Number.isFinite(value) && value >= 0 ? value : 0;
};

function buildPath(from: StageKey, to: StageKey | "Perdido" | "Perdido desarrollo", anomaly = false) {
  const a = STAGES.find((stage) => stage.key === from);
  if (!a) return "";
  if (to === "Perdido" || to === "Perdido desarrollo") return `M ${a.x} ${a.y + 25} L ${a.x} 350`;
  const b = STAGES.find((stage) => stage.key === to);
  if (!b) return "";
  if (anomaly) {
    const top = to === "E8" ? 25 : 62;
    return `M ${a.x} ${a.y} C ${a.x + 210} ${top}, ${b.x - 210} ${top}, ${b.x} ${b.y}`;
  }
  return `M ${a.x} ${a.y} C ${a.x + (b.x - a.x) * 0.42} ${a.y}, ${b.x - (b.x - a.x) * 0.42} ${b.y}, ${b.x} ${b.y}`;
}

function flowContext(flow: Flow) {
  if (flow.description) return flow.description;
  if (flow.kind === "lost") return "Deals perdidos en venta en esta etapa";
  if (flow.kind === "lostDev") return "Deals ganados que se cayeron en desarrollo";
  if (flow.kind === "anomaly") return "⚠ Transición inválida — salta E4 obligatoria";
  if (flow.kind === "warning") return "Deals firmados que entraron en warning";
  return flow.dateBasis === 'entry' ? `${flow.percent}% de las salidas registradas desde ${flow.from} en el período · fecha de entrada a destino` : `Avanzaron a la siguiente etapa · ${flow.percent}% de ${flow.from} · cohorte por cierre`;
}

function dealDays(journey: StageJourney, stage: StageKey) {
  return journey.days[stage] ?? 0;
}

function TrendChip({ delta }: { delta: number | null }) {
  if (delta === null) return <em className="time-trend" data-direction="none">sin comparación</em>;
  const rounded = Math.abs(delta) < 0.05 ? 0 : Math.round(Math.abs(delta) * 10) / 10;
  const direction = delta < 0 ? "better" : delta > 0 ? "worse" : "same";
  return <em className="time-trend" data-direction={direction}>{delta < 0 ? "▼" : delta > 0 ? "▲" : "—"} {rounded}d</em>;
}

function countComparison(current: number, previous: number) {
  const delta = current - previous;
  const percent = previous > 0 ? Math.round((delta / previous) * 100) : current > 0 ? 100 : 0;
  return { delta, percent };
}

function comparisonLabel(current: number, previous: number) {
  const { delta, percent } = countComparison(current, previous);
  return `${delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} ${Math.abs(percent)}% · ${delta > 0 ? "+" : ""}${delta}`;
}

export function StageVelocity({
  journeys,
  ownerId,
  dealType,
  selectedPeriods,
  quarter = "all",
}: {
  journeys: StageJourney[];
  ownerId: string;
  dealType: string;
  selectedPeriods: string[];
  quarter?: string;
}) {
  const detailAnchor = useRef<HTMLElement | SVGElement | null>(null);
  const [detail, setDetail] = useState<StageKey | "velocity" | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const openDetail = (target: HTMLElement | SVGElement, key: StageKey | "velocity") => {
    detailAnchor.current = target;
    setDetail(key);
    setDetailOpen(true);
  };
  const [activeFlow, setActiveFlow] = useState<Flow | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [dateBasis, setDateBasis] = useState<FlowDateBasis>('entry');
  const [compareMode, setCompareMode] = useState<"prev" | "yoy">("prev");
  const isQuarterFiltered = Boolean(quarter && quarter !== "all");
  const effectiveCompareMode = isQuarterFiltered ? compareMode : "prev";
  const periodKey = selectedPeriods.join(",");
  useEffect(() => { setActiveFlow(null); setDetailOpen(false); }, [journeys, ownerId, dealType, periodKey, dateBasis, effectiveCompareMode]);

  const TYPE_SEGMENT: Record<string, string> = {
    inbound: "Inbound",
    outbound: "Outbound",
    upsell: "Upsell",
    crossSell: "Cross sell",
  };
  const ownerAndTypeScoped = useMemo(() => journeys.filter((journey) => {
    if (ownerId !== "team" && journey.deal.ownerId !== ownerId) return false;
    const target = TYPE_SEGMENT[dealType];
    return dealType === "all" || !target || journey.deal.segment === target;
  }), [journeys, ownerId, dealType]);

  const comparisonPeriods = useMemo(() => {
    const indices = selectedPeriods.map(quarterIndex).filter((value): value is number => value !== null).sort((a, b) => a - b);
    const shift = effectiveCompareMode === "yoy" ? 4 : Math.max(1, indices.length);
    return new Set(indices.map((index) => quarterFromIndex(index - shift)));
  }, [selectedPeriods, effectiveCompareMode]);

  const scoped = useMemo(() => {
    const periods = new Set(selectedPeriods);
    return ownerAndTypeScoped.filter(journey => journeyInPeriods(journey, periods, dateBasis));
  }, [ownerAndTypeScoped, selectedPeriods, dateBasis]);

  const previousScoped = useMemo(() => ownerAndTypeScoped.filter(journey => journeyInPeriods(journey, comparisonPeriods, dateBasis)), [comparisonPeriods, ownerAndTypeScoped, dateBasis]);

  const previousCounts = useMemo(() => {
    const stages = new Map<StageKey, number>(STAGES.map((stage) => [stage.key, 0]));
    const losses = new Map<string, number>();
    for (const journey of previousScoped) {
      const visited = STAGES.filter((stage) => journey.entered[stage.key]);
      for (const stage of visited) if (stageInPeriods(journey, stage.key, comparisonPeriods, dateBasis)) stages.set(stage.key, (stages.get(stage.key) ?? 0) + 1);
      const last = visited[visited.length - 1];
      if (!last) continue;
      if (SALES_LOST.has(journey.deal.stageId) && stageInPeriods(journey, 'Perdido', comparisonPeriods, dateBasis)) losses.set(`${last.key}->Perdido`, (losses.get(`${last.key}->Perdido`) ?? 0) + 1);
      if (DEV_LOST.has(journey.deal.stageId) && stageInPeriods(journey, 'Perdido desarrollo', comparisonPeriods, dateBasis)) losses.set(`${last.key}->Perdido desarrollo`, (losses.get(`${last.key}->Perdido desarrollo`) ?? 0) + 1);
    }
    return { stages, losses };
  }, [previousScoped, comparisonPeriods, dateBasis]);

  const periodDurations = useMemo(() => {
    const currentPeriods = new Set(selectedPeriods);
    const current = new Map<StageKey, number[]>();
    const previous = new Map<StageKey, number[]>();
    for (const stage of STAGES) {
      current.set(stage.key, []);
      previous.set(stage.key, []);
    }
    for (const journey of ownerAndTypeScoped) {
      const visited = STAGES.filter((stage) => journey.entered[stage.key]);
      for (let index = 0; index < visited.length - 1; index += 1) {
        const from = visited[index];
        const to = visited[index + 1];
        if (!from || !to) continue;
        const duration = journey.days[from.key] ?? diffDays(journey.entered[from.key], journey.entered[to.key]);
        if (duration <= 0) continue;
        if (stageInPeriods(journey, to.key, currentPeriods, dateBasis)) current.get(from.key)?.push(duration);
        if (stageInPeriods(journey, to.key, comparisonPeriods, dateBasis)) previous.get(from.key)?.push(duration);
      }
    }
    return { current, previous };
  }, [comparisonPeriods, ownerAndTypeScoped, selectedPeriods, dateBasis]);

  const model = useMemo(() => {
    const periods = new Set(selectedPeriods);
    const entries = new Map<StageKey, StageJourney[]>();
    const exitedDays = new Map<StageKey, number[]>();
    const monthlyDays = new Map<StageKey, Map<string, number[]>>();
    const flowDeals = new Map<string, Map<string, StageJourney>>();
    for (const stage of STAGES) {
      entries.set(stage.key, []);
      exitedDays.set(stage.key, []);
      monthlyDays.set(stage.key, new Map());
    }
    const pushFlow = (from: StageKey, to: StageKey | "Perdido" | "Perdido desarrollo", item: StageJourney) => {
      if (!stageInPeriods(item, to, periods, dateBasis)) return;
      const key = `${from}->${to}`;
      const list = flowDeals.get(key) ?? new Map<string, StageJourney>();
      list.set(item.deal.id, item);
      flowDeals.set(key, list);
    };

    for (const journey of scoped) {
      // HubSpot entrega la última entrada a cada etapa. Para evitar regresiones y
      // reingresos duplicados, el río sigue el orden canónico de las etapas visitadas.
      const visited = STAGES.filter((stage) => journey.entered[stage.key]);
      for (const stage of visited) if (stageInPeriods(journey, stage.key, periods, dateBasis)) entries.get(stage.key)?.push(journey);
      for (let index = 0; index < visited.length - 1; index += 1) {
        const from = visited[index];
        const to = visited[index + 1];
        if (!from || !to) continue;
        pushFlow(from.key, to.key, journey);
        const duration = journey.days[from.key] ?? diffDays(journey.entered[from.key], journey.entered[to.key]);
        if (duration > 0 && stageInPeriods(journey, to.key, periods, dateBasis)) {
          exitedDays.get(from.key)?.push(duration);
          const month = journey.entered[to.key]?.slice(0, 7) ?? "";
          const bucket = monthlyDays.get(from.key)?.get(month) ?? [];
          bucket.push(duration);
          monthlyDays.get(from.key)?.set(month, bucket);
        }
      }
      const last = visited[visited.length - 1];
      if (last && SALES_LOST.has(journey.deal.stageId)) pushFlow(last.key, "Perdido", journey);
      if (last && DEV_LOST.has(journey.deal.stageId)) pushFlow(last.key, "Perdido desarrollo", journey);
    }

    const originTotals = new Map<StageKey, number>();
    for (const [key, list] of flowDeals) {
      const from = key.split("->")[0] as StageKey;
      if (dateBasis === 'close') originTotals.set(from, entries.get(from)?.length ?? list.size);
      else originTotals.set(from, (originTotals.get(from) ?? 0) + list.size);
    }
    const flows: Flow[] = [...flowDeals.entries()].map(([id, dealMap]) => {
      const deals = [...dealMap.values()];
      const [fromRaw, toRaw] = id.split("->");
      const from = fromRaw as StageKey;
      const to = toRaw as StageKey | "Perdido" | "Perdido desarrollo";
      const fromIndex = STAGE_INDEX.get(from) ?? 0;
      const toIndex = STAGE_INDEX.get(to as StageKey) ?? fromIndex;
      const anomaly = to !== "Perdido" && to !== "Perdido desarrollo" && fromIndex >= 1 && fromIndex < 3 && toIndex > 3 && !deals[0]?.entered["E4"];
      const kind: FlowKind = anomaly
        ? "anomaly"
        : to === "Perdido"
          ? "lost"
          : to === "Perdido desarrollo"
            ? "lostDev"
            : to === "E6.1"
              ? "warning"
              : fromIndex >= 6
                ? "won"
                : "advance";
      const a = STAGES.find((stage) => stage.key === from);
      const b = STAGES.find((stage) => stage.key === to);
      const verticalLabel = from === "E2" && to === "E4" || from === "E6.1" && to === "E6.2";
      const mainlineLabel = from === "E4" && to === "E5";
      return {
        id,
        dateBasis,
        from,
        to,
        kind,
        deals,
        count: deals.length,
        percent: Math.min(100, Math.round((deals.length / Math.max(1, originTotals.get(from) ?? 1)) * 100)),
        path: buildPath(from, to, anomaly),
        labelX: b && a ? (a.x + b.x) / 2 + (verticalLabel ? 28 : 0) : (a?.x ?? 0),
        labelY: b && a ? (a.y + b.y) / 2 - (mainlineLabel ? 20 : 8) : 372,
      };
    });

    const stageStats = STAGES.map((stage) => {
      const stageDeals = entries.get(stage.key) ?? [];
      const series = [...(monthlyDays.get(stage.key)?.entries() ?? [])]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([, values]) => median(values));
      return {
        ...stage,
        count: stageDeals.length,
        amount: stageDeals.reduce((sum, item) => sum + item.deal.amountValue, 0),
        days: median(periodDurations.current.get(stage.key) ?? []),
        previousDays: median(periodDurations.previous.get(stage.key) ?? []),
        series,
        sampleCount: periodDurations.current.get(stage.key)?.length ?? 0,
        months: [...(monthlyDays.get(stage.key)?.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, days: median(values), count: values.length })),
      };
    });
    return { flows, stageStats };
  }, [periodDurations, scoped, selectedPeriods, dateBasis]);

  const cycle = (from: StageKey, to: StageKey, periods: Set<string>) => median(ownerAndTypeScoped
    .filter((item) => stageInPeriods(item, to, periods, dateBasis))
    .map((item) => diffDays(item.entered[from], item.entered[to]))
    .filter((value) => value > 0));
  const currentPeriods = new Set(selectedPeriods);
  const salesCycle = cycle("E1", "E6", currentPeriods);
  const developmentCycle = cycle("E6", "E8", currentPeriods);
  const totalCycle = cycle("E1", "E8", currentPeriods);
  const previousSalesCycle = cycle("E1", "E6", comparisonPeriods);
  const previousDevelopmentCycle = cycle("E6", "E8", comparisonPeriods);
  const previousTotalCycle = cycle("E1", "E8", comparisonPeriods);
  const won = scoped.filter((item) => Boolean(item.entered["E6"]) && stageInPeriods(item, 'E6', currentPeriods, dateBasis));
  const lost = scoped.filter((item) => SALES_LOST.has(item.deal.stageId) && stageInPeriods(item, 'Perdido', currentPeriods, dateBasis));
  const lostDevelopment = scoped.filter((item) => DEV_LOST.has(item.deal.stageId) && stageInPeriods(item, 'Perdido desarrollo', currentPeriods, dateBasis));
  const commissioned = scoped.filter((item) => Boolean(item.entered["E8"]) && stageInPeriods(item, 'E8', currentPeriods, dateBasis));
  const previousWon = previousScoped.filter((item) => Boolean(item.entered["E6"]) && stageInPeriods(item, 'E6', comparisonPeriods, dateBasis));
  const previousLost = previousScoped.filter((item) => SALES_LOST.has(item.deal.stageId) && stageInPeriods(item, 'Perdido', comparisonPeriods, dateBasis));
  const previousLostDevelopment = previousScoped.filter((item) => DEV_LOST.has(item.deal.stageId) && stageInPeriods(item, 'Perdido desarrollo', comparisonPeriods, dateBasis));
  const previousCommissioned = previousScoped.filter((item) => Boolean(item.entered["E8"]) && stageInPeriods(item, 'E8', comparisonPeriods, dateBasis));
  const opportunities = model.stageStats.find((stage) => stage.key === "E1")?.count ?? scoped.length;
  const winRate = won.length + lost.length ? won.length / (won.length + lost.length) : 0;
  const ticket = won.length ? won.reduce((sum, item) => sum + item.deal.amountValue, 0) / won.length : 0;
  const velocityCycle = totalCycle || salesCycle;
  const velocity = velocityCycle ? (opportunities * winRate * ticket) / velocityCycle : null;
  const previousWinRate = previousWon.length + previousLost.length ? previousWon.length / (previousWon.length + previousLost.length) : 0;
  const previousTicket = previousWon.length ? previousWon.reduce((sum, item) => sum + item.deal.amountValue, 0) / previousWon.length : 0;
  const previousVelocityCycle = previousTotalCycle || previousSalesCycle;
  const previousVelocity = previousVelocityCycle ? ((previousCounts.stages.get("E1") ?? 0) * previousWinRate * previousTicket) / previousVelocityCycle : null;
  // Compare only like-for-like cycle definitions; E1→E6 is not E1→E8.
  const velocityDelta = velocity !== null && previousVelocity !== null && previousVelocity > 0 && Boolean(totalCycle) === Boolean(previousTotalCycle)
    ? (velocity / previousVelocity - 1) * 100 : null;
  const detailStage = model.stageStats.find(stage => stage.key === detail);

  const summaryFlow = (
    id: string,
    title: string,
    description: string,
    kind: FlowKind,
    deals: StageJourney[],
    from: StageKey,
    to: Flow["to"],
  ): Flow => ({
    id,
    dateBasis,
    title,
    description,
    summary: true,
    kind,
    deals,
    from,
    to,
    count: deals.length,
    percent: 0,
    path: "",
    labelX: 0,
    labelY: 0,
  });

  useEffect(() => {
    if (!activeFlow || detailOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activeFlow) setActiveFlow(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeFlow, detailOpen]);

  return (
    <>
          <section className="stage-flow-modal stage-flow-panel" aria-label="Pipeline animado por niveles">
            <header><div><h2>Pipeline animado por niveles</h2><p>Izquierda → derecha · grosor = cantidad · % = {dateBasis === 'entry' ? 'distribución de salidas' : 'avance de la cohorte'} · anomalías saltan E4</p></div></header>
              <div className="stage-flow-filters">
                <div className="stage-date-toggle" role="group" aria-label="Filtrar pipeline por fecha">
                  <button type="button" aria-pressed={dateBasis === 'entry'} onClick={() => { setDateBasis('entry'); setActiveFlow(null); }}>Entrada a etapa</button>
                  <button type="button" aria-pressed={dateBasis === 'close'} onClick={() => { setDateBasis('close'); setActiveFlow(null); }}>Cierre del deal</button>
                </div>
                <Button
                  className="stage-comparison-toggle"
                  type="button"
                  variant="outline"
                  size="sm"
                  data-active={showComparison || undefined}
                  aria-pressed={showComparison}
                  onClick={() => setShowComparison((current) => !current)}
                >
                  <GitCompareArrows aria-hidden="true" />
                  {showComparison ? "Ocultar comparación" : "Ver comparación"}
                </Button>
                {showComparison && isQuarterFiltered ? (
                  <div className="stage-compare-mode" role="group" aria-label="Período de comparación">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-active={compareMode === "prev" || undefined}
                      aria-pressed={compareMode === "prev"}
                      onClick={() => setCompareMode("prev")}
                    >
                      Q anterior
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-active={compareMode === "yoy" || undefined}
                      aria-pressed={compareMode === "yoy"}
                      onClick={() => setCompareMode("yoy")}
                    >
                      Mismo Q año pasado
                    </Button>
                  </div>
                ) : null}
                <span className="stage-flow-filters-hint">{showComparison ? (effectiveCompareMode === "yoy" ? "vs. mismo trimestre del año pasado" : "vs. período anterior equivalente") : "Usa los filtros principales del informe"}</span>
              </div>
            <div className="stage-flow-body" data-drawer={activeFlow ? "open" : undefined}>
              <div className="stage-flow-main">
                <div className="flow-legend"><span data-kind="advance">Avance</span><span data-kind="won">Ganado / desarrollo</span><span data-kind="lost">Perdido</span><span data-kind="anomaly">Anomalía · salta E4</span></div>
                <p className="flow-explainer"><strong>El grosor de cada corriente es proporcional a la cantidad de deals.</strong> Haz clic en cualquier río para revisar sus deals en HubSpot.</p>
                <p className="stage-date-explainer">{dateBasis === 'entry' ? 'Cada nodo usa su propia fecha de entrada; cada río usa la entrada a su destino. No exige que el deal se haya creado o cerrado en el período. Los conteos por etapa no forman una misma cohorte.' : 'Solo deals con fecha de cierre en el período elegido. Se muestra su recorrido registrado completo, aunque hayan entrado a las etapas en otros períodos.'} Fechas ausentes no se sustituyen por otra fecha.
                {dateBasis === 'entry' && ownerAndTypeScoped.some(row => DEV_LOST.has(row.deal.stageId) && !row.outcomeEntered?.[row.deal.stageId]) ? ' Hay pérdidas en desarrollo sin fecha de entrada disponible en este reporte; quedan fuera de este modo.' : null}</p>
                <div className="stage-svg-scroll">
                  <svg className="stage-flow-svg" viewBox="0 0 1415 410" role="img" aria-label="Flujo real de deals por etapas">
                    <rect className="won-zone" x="920" y="50" width="475" height="300" rx="18" />
                    <text className="won-zone-label" x="940" y="72">ZONA GANADA</text>
                    {[0,1,2,3,4,5,6,7].map((level) => {
                      const stage = STAGES.find((item) => item.level === level);
                      return stage ? <g key={level}><text className="level-label" x={stage.x} y="25" textAnchor="middle">NIVEL {level}</text><line className="level-guide" x1={stage.x} x2={stage.x} y1="34" y2="354" /></g> : null;
                    })}
                    {model.flows.map((flow, index) => {
                      const width = Math.max(2, Math.min(38, flow.count * 0.28));
                      const isLoss = flow.to === "Perdido" || flow.to === "Perdido desarrollo";
                      const previousCount = previousCounts.losses.get(flow.id) ?? 0;
                      const comparison = countComparison(flow.count, previousCount);
                      const label = isLoss
                        ? showComparison
                          ? `−${flow.count} · ${comparisonLabel(flow.count, previousCount)}`
                          : `−${flow.count}`
                        : `${flow.percent}%`;
                      const labelWidth = showComparison && isLoss ? 112 : 40;
                      return <g className="flow-hit" data-kind={flow.kind} key={flow.id} onClick={() => setActiveFlow(flow)}>
                        <title>{`${flow.from} → ${flow.to} · ${flow.count} deals · clic para ver`}</title>
                        <path className="flow-base" d={flow.path} style={{ strokeWidth: width }} />
                        <path className="flow-shimmer" d={flow.path} style={{ strokeWidth: Math.max(2, width * 0.45), animationDelay: `${index * -0.34}s` }} />
                        <path className="flow-click-target" d={flow.path} />
                        <rect className="flow-percent-bg" x={flow.labelX - labelWidth / 2} y={flow.labelY - 13} width={labelWidth} height="18" rx="8" />
                        <text className="flow-percent" data-comparison={showComparison && isLoss ? (comparison.delta > 0 ? "worse" : comparison.delta < 0 ? "better" : "same") : undefined} x={flow.labelX} y={flow.labelY} textAnchor="middle">{label}</text>
                      </g>;
                    })}
                    {model.stageStats.map((stage) => {
                      const previousCount = previousCounts.stages.get(stage.key) ?? 0;
                      const comparison = countComparison(stage.count, previousCount);
                      return (
                      <g className="stage-node" role="button" tabIndex={0} aria-label={`Ver tiempo de ${stage.key} · ${stage.name}`} onClick={event => openDetail(event.currentTarget, stage.key)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(event.currentTarget, stage.key); } }} data-comparing={showComparison || undefined} data-kind={stage.key === "E6.1" ? "warning" : (STAGE_INDEX.get(stage.key) ?? 0) >= 6 ? "won" : "open"} key={stage.key}>
                        <title>{`${stage.key} · ${stage.name}\n${stage.count} deals · ${money(stage.amount)} MRR\n${stage.days ? `${stage.days.toFixed(1)} d de mediana` : "sin mediana"}${stage.milestone ? `\n${stage.milestone}` : ""}`}</title>
                        {stage.key === "E4" ? <rect className="mandatory-ring" x={stage.x - 49} y={stage.y - (showComparison ? 34 : 30)} width="98" height={showComparison ? 68 : 60} rx="13" /> : null}
                        <rect x={stage.x - 44} y={stage.y - (showComparison ? 29 : 25)} width="88" height={showComparison ? 58 : 50} rx="11" />
                        <text className="node-key" x={stage.x} y={stage.y - (showComparison ? 7 : 3)} textAnchor="middle">{stage.key}</text>
                        <text className="node-count" x={stage.x} y={stage.y + (showComparison ? 10 : 16)} textAnchor="middle">{stage.count} deals</text>
                        {showComparison ? <text className="node-comparison" data-comparison={comparison.delta > 0 ? "better" : comparison.delta < 0 ? "worse" : "same"} x={stage.x} y={stage.y + 23} textAnchor="middle">{comparisonLabel(stage.count, previousCount)}</text> : null}
                        <text className="node-role" x={stage.x} y={stage.y + 44} textAnchor="middle">{stage.role}</text>
                        <text className="node-duration" x={stage.x} y={stage.y + 61} textAnchor="middle">{stage.sampleCount ? `${stage.days.toFixed(1)} d · mediana` : "Sin salidas con dato"}</text>
                      </g>
                    )})}
                  </svg>
                </div>
                <p className="pipeline-time-caption">Tiempos en días · mediana de quienes ya salieron de cada etapa. Pincha una etapa para ver evolución y muestra.</p>
                <div className="pipeline-velocity-widgets" aria-label="Ciclos y velocidad comercial">
                  {[
                    { label: "Venta", path: "E1 → E6", value: salesCycle, previous: previousSalesCycle },
                    { label: "Desarrollo", path: "E6 → E8", value: developmentCycle, previous: previousDevelopmentCycle },
                    { label: "Ciclo total", path: "E1 → E8", value: totalCycle, previous: previousTotalCycle },
                  ].map(item => <div className="pipeline-cycle-widget" key={item.label} title={`Mediana · variación vs. ${effectiveCompareMode === "yoy" ? "mismo trimestre del año anterior" : "período anterior equivalente"}`}>
                    <span>{item.label} <small>{item.path}</small></span>
                    <strong>{item.value ? `${Math.round(item.value)} d` : "—"}</strong>
                    <TrendChip delta={item.value && item.previous ? item.value - item.previous : null} />
                  </div>)}
                  <button type="button" className="pipeline-speed-widget" onClick={event => openDetail(event.currentTarget, "velocity")} aria-label="Ver cálculo de Deal Velocity">
                    <span>Velocidad comercial <KpiArrow /></span>
                    <strong>{velocity === null ? "—" : money(velocity)} <small>MRR/día estimados</small></strong>
                    <em>{velocityDelta === null ? "Sin comparación equivalente" : `${velocityDelta > 0 ? "▲" : velocityDelta < 0 ? "▼" : "—"} ${Math.abs(velocityDelta).toFixed(1)}% vs. ${effectiveCompareMode === "yoy" ? "mismo Q año anterior" : "período anterior"}`}</em>
                  </button>
                </div>
                <div className="flow-kpis">
                  <Button variant="ghost" title="Clic para ver los deals" aria-label="Ver los deals ganados (E6)" onClick={() => setActiveFlow(summaryFlow("summary-won", "Ganados (E6)", "Deals que alcanzaron la etapa de propuesta firmada", "won", won, "E6", "E6"))}><span>Ganados (E6)</span><strong>{won.length} · {Math.round(winRate * 100)}%</strong>{showComparison ? <KpiComparison current={won.length} previous={previousWon.length} /> : null}<KpiArrow /></Button>
                  <Button variant="ghost" data-kind="lost" title="Clic para ver los deals" aria-label="Ver los deals perdidos en ventas" onClick={() => setActiveFlow(summaryFlow("summary-lost", "Perdidos en ventas", "Deals cerrados como perdidos durante el proceso comercial", "lost", lost, "E1", "Perdido"))}><span>Perdidos en ventas</span><strong>{lost.length}</strong>{showComparison ? <KpiComparison current={lost.length} previous={previousLost.length} inverse /> : null}<KpiArrow /></Button>
                  <Button variant="ghost" data-kind="lostDev" title="Clic para ver los deals" aria-label="Ver los deals perdidos en desarrollo" onClick={() => setActiveFlow(summaryFlow("summary-lost-dev", "Perdidos en desarrollo", "Deals ganados que se cayeron durante el desarrollo", "lostDev", lostDevelopment, "E6", "Perdido desarrollo"))}><span>Perdidos en desarrollo</span><strong>{lostDevelopment.length}</strong>{showComparison ? <KpiComparison current={lostDevelopment.length} previous={previousLostDevelopment.length} inverse /> : null}<KpiArrow /></Button>
                  <Button variant="ghost" title="Clic para ver los deals" aria-label="Ver los deals que comisionan (E8)" onClick={() => setActiveFlow(summaryFlow("summary-commissioned", "Comisionan (E8)", "Deals que alcanzaron servicio iniciado y comisionan", "won", commissioned, "E8", "E8"))}><span>Comisionan (E8)</span><strong>{commissioned.length}</strong>{showComparison ? <KpiComparison current={commissioned.length} previous={previousCommissioned.length} /> : null}<KpiArrow /></Button>
                </div>
              </div>
              {activeFlow ? <FlowDrawer flow={activeFlow} onClose={() => setActiveFlow(null)} /> : null}
            </div>
          </section>
          <Popover open={detailOpen} onOpenChange={setDetailOpen}>
            <PopoverAnchor virtualRef={detailAnchor} />
            <PopoverContent className="pipeline-detail-popover won-mix-popover" side="top" align="center" sideOffset={10} collisionPadding={12} onCloseAutoFocus={event => { event.preventDefault(); detailAnchor.current?.focus({ preventScroll: true }); }}>
              <header><h4>{detail === "velocity" ? "Deal Velocity · estimación" : `${detailStage?.key} · ${detailStage?.name}`}</h4><button type="button" aria-label="Cerrar detalle del pipeline" onClick={() => setDetailOpen(false)}><X size={16} /></button></header>
              {detail === "velocity" ? <>
                <div className="pipeline-formula-result"><strong>{velocity === null ? "—" : money(velocity)}</strong><span>MRR/día estimados</span></div>
                <div className="pipeline-formula-rows">
                  <div><span>Oportunidades · entrada E1</span><strong>{opportunities}</strong></div>
                  <div><span>× Win rate · ganados / cerrados</span><strong>{(winRate * 100).toFixed(1)}%</strong></div>
                  <div><span>× Ticket promedio · MRR ganado</span><strong>{money(ticket)}</strong></div>
                  <div><span>÷ Ciclo · E1 → {totalCycle ? "E8" : "E6"}</span><strong>{velocityCycle ? `${velocityCycle.toFixed(1)} d` : "Sin dato"}</strong></div>
                </div>
                <p>Estimación del período filtrado; no representa MRR realmente generado cada día. {totalCycle ? "El ciclo incluye venta y desarrollo hasta inicio de servicio." : "Sin ciclo total disponible: se utiliza el ciclo de venta hasta propuesta firmada."} Las entradas y cierres del período pueden corresponder a deals distintos.</p>
              </> : detailStage ? <>
                <div className="pipeline-timing-summary"><strong>{detailStage.sampleCount ? `${detailStage.days.toFixed(1)} d` : "—"}</strong><span>{detailStage.sampleCount} salidas con dato</span><TrendChip delta={detailStage.days && detailStage.previousDays ? detailStage.days - detailStage.previousDays : null} /></div>
                <p>Mediana de permanencia de quienes salieron hacia otra etapa registrada; no es la antigüedad de los deals actuales. {dateBasis === "entry" ? "Salidas registradas en el período filtrado." : "Deals con cierre en el período filtrado."} Comparación: {effectiveCompareMode === "yoy" ? "mismo Q del año pasado" : "período anterior equivalente"}.</p>
                <div className="pipeline-timing-months" aria-label="Evolución mensual del tiempo en etapa">
                  {detailStage.months.length ? detailStage.months.map(month => <div key={month.month}><span>{new Date(`${month.month}-01T12:00:00Z`).toLocaleDateString("es-CL", { month: "short", year: "numeric", timeZone: "UTC" })}</span><i><b style={{ width: `${Math.max(2, month.days / Math.max(...detailStage.months.map(item => item.days), .001) * 100)}%` }} /></i><strong>{month.days.toFixed(1)} d</strong><small>{month.count} salidas</small></div>) : <p>Sin salidas con duración válida en este corte.</p>}
                </div>
                <small>Evolución por mes de entrada a la siguiente etapa registrada. Fechas ausentes no se sustituyen.</small>
              </> : null}
            </PopoverContent>
          </Popover>
    </>
  );
}

function FlowDrawer({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const visible = flow.deals.slice(0, 20);
  const copyAllDeals = async () => {
    const rows = flow.deals.map((journey) => `${journey.deal.name} · ID ${journey.deal.id}`);
    await navigator.clipboard.writeText(rows.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };
  return <aside className="flow-drawer" data-kind={flow.kind}>
    <header><div><h3>{flow.title ?? `${flow.from} → ${flow.to}`} <span>{flow.count} deals</span></h3><p>{flowContext(flow)}</p></div><Button variant="ghost" size="icon" aria-label="Cerrar detalle" onClick={onClose}><X /></Button></header>
    {flow.kind === "anomaly" ? <div className="flow-alert">Transición sin registro de E4. Validar propuesta antes de contabilizar o comisionar.</div> : null}
    {flow.kind === "warning" ? <div className="flow-alert">Deals firmados que entraron en warning por atraso de pago o kickoff.</div> : null}
    <div className="flow-drawer-actions">
      <Button variant="outline" size="sm" onClick={() => void copyAllDeals()} disabled={!flow.deals.length}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copiados" : "Copiar todo"}
      </Button>
      <span>{copied ? `${flow.deals.length} deals copiados para pegar en Codex` : "Nombre e ID de todos los deals"}</span>
    </div>
    <div className="flow-deal-list">
      {visible.map((journey) => <DealLink key={journey.deal.id} deal={journey.deal} days={flow.summary ? 0 : dealDays(journey, flow.from)} lost={flow.kind === "lost" || flow.kind === "lostDev"} filterDate={flow.dateBasis === 'close' ? journey.deal.closeDateValue : flowStageDate(journey, flow.to)} dateLabel={flow.dateBasis === 'close' ? 'Cierre' : 'Entrada a destino'} />)}
      {flow.deals.length > visible.length ? <p className="flow-more">+ {flow.deals.length - visible.length} deals más en este flujo</p> : null}
    </div>
  </aside>;
}

function KpiArrow() {
  return (
    <svg className="flow-kpi-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h13" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function KpiComparison({ current, previous, inverse = false }: { current: number; previous: number; inverse?: boolean }) {
  const comparison = countComparison(current, previous);
  const direction = comparison.delta > 0 ? "up" : comparison.delta < 0 ? "down" : "same";
  const tone = comparison.delta === 0 ? "same" : (comparison.delta > 0) !== inverse ? "better" : "worse";
  return <small className="flow-kpi-comparison" data-direction={direction} data-tone={tone}>{comparisonLabel(current, previous)}</small>;
}

function DealLink({ deal, days, lost, filterDate, dateLabel }: { deal: DealDTO; days: number; lost: boolean; filterDate: string; dateLabel: string }) {
  return <a className="flow-deal" href={deal.url} target="_blank" rel="noopener noreferrer">
    <span><strong>{deal.name}</strong><small>#{deal.id} · MRR {lost ? "perdido" : "potencial"}</small><small>{dateLabel}: {filterDate ? filterDate.slice(0,10).split('-').reverse().join('-') : 'sin fecha registrada'}</small><em>Abrir en HubSpot <ExternalLink /></em></span>
    <span><strong>{lost ? "−" : ""}{deal.amount}</strong><small>{days ? `${lost ? "perdido tras" : ""} ${Math.round(days)} d` : "sin tiempo registrado"}</small></span>
  </a>;
}
