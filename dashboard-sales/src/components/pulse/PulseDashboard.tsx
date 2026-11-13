import {QuotaScenarios} from './QuotaScenarios';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { wonByStage6Entry, withWonDeals, stage6AttributionDates } from "@/lib/won-result-period";
import { dealExposure } from "@/lib/deal-exposure";
import { useOverdueTasks } from "@/hooks/use-overdue-tasks";
import { OverdueTasks } from "./OverdueTasks";
import { TASK_OPEN_STAGES, overdueTaskExposure } from "@/lib/overdue-tasks";
import { ArrowUpRight } from 'lucide-react';
import { PULSE_FOCUS_PAGES, type PulseFocusView, type PulseSection } from '@/lib/report-navigation';
import { Button } from "@/components/ui/button";
import { CommissionRate } from "./CommissionRate";
import { quarterPace } from "@/lib/quarter-performance";
import { NotificationCenter } from './NotificationCenter';
import { dashboardActionGroups } from '@/lib/dashboard-action-groups';
import { CopySectionButton } from "./CopyControls";
import { DealModal } from "./DealModal";
import { WonExecutiveSummary } from "./WonExecutiveSummary";
import { WonStageChip, type WonStageDetail } from "./WonStageChip";
import { wonStageBreakdown } from "@/lib/won-stage-breakdown";
import { closeMonthKey, summarizeDealMonths } from "@/lib/deal-month-summary";
import { pipelineCoverage } from "@/lib/pipeline-coverage";
import { useLiveNow } from './AdoboIntelligence';
import { PipelineHistory } from './PipelineHistory';
type MetricChip = { label: string; value: string; tone?: Tone; onClick?: () => void; detail?: WonStageDetail };
import { MiniBars, MiniLine } from "./MiniCharts";
import { TimeToService } from "./TimeToService";
import { PlanBotWon } from "./PlanBotWon";
import { Delivery } from "./Delivery";
import { PipelineFunnel } from "./PipelineFunnel";
import { StageVelocity } from "./StageVelocity";
import { ActiveMrrCard, CompactFilterBar, STAGE_OPTIONS } from "./FilterBar";
import { useRefreshMenu } from "@/contexts/RefreshContext";
export { SingleFilterMenu, OwnerFilterMenu, StageFilterMenu } from "./FilterBar";
import type { DealDTO, Drilldown, MonthlyPulse, PeriodStats, PulseReport, RiskSummary, Tone } from "@/lib/pulse-types";
import { roleOfOwner } from "@/lib/owner-roles";
import { generationEntryDate, generationStageEntries, generationSourceRows } from "@/lib/pipeline-generation";
import { creationComparisonWindow } from "@/lib/story-metrics";
import { buildExecutiveStrip } from "@/lib/executive-strip";
import { supabase } from "@/integrations/supabase/client";
import { quotaStats, classifyQuotaDeal, pendingFromPreviousQuarters } from '@/lib/quota-eligibility';

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const firstName = (full: string) => {
  const trimmed = (full || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "sin propietario") return trimmed || "S/N";
  return trimmed.split(/\s+/)[0];
};

/** Triangulito amarillo de advertencia con exclamación, siempre dibujado igual. */
function WarnMark({ label = "Atención" }: { label?: string }) {
  return (
    <svg className="pipe-warn" viewBox="0 0 12 11" role="img" aria-label={label} focusable="false">
      <path className="pipe-warn-tri" d="M6 1.5 10.8 9.5H1.2Z" />
      <path className="pipe-warn-bang" d="M6 3.9v2.8" />
      <circle className="pipe-warn-bang" cx="6" cy="8.1" r="0.95" />
    </svg>
  );
}

const wrText = (stats: { won: number; lost: number }) => {
  const total = stats.won + stats.lost;
  return total ? `${Math.round((stats.won / total) * 100)}% (${stats.won}/${total})` : "s/n";
};

const pp = (value: number) => `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value))}pp QoQ`;


const shortPeriod = (period: string) => {
  const [year, q] = period.split("-Q");
  return `Q${q}-${year!.slice(2)}`;
};

export function Metric({
  label,
  value,
  valueSuffix,
  valueChip,
  note,
  tone = "neutral",
  onClick,
  progress,
  progressBonus,
  progressLabel,
  valuation,
  tooltip,
  trend,
  trendLabels,
  chips,
  chipAddon,
  chipsTop,
  hero,
  reference,
  chipLayout,
  footer,
}: {
  label: string;
  value: string;
  /** sufijo más pequeño junto al valor principal (ej. "(31/188)") */
  valueSuffix?: string;
  /** chip inline junto al valor (ej. vista alterna $$$) */
  valueChip?: { label: string; value: string; tone?: Tone; onClick?: () => void };
  note?: string | undefined;
  valuation?: string;
  tone?: Tone;
  onClick?: () => void;
  progress?: number;
  /** tramo extra de la barra (ej. bonus OTF/12) en puntos porcentuales */
  progressBonus?: number;
  progressLabel?: string;
  tooltip?: string;
  /** serie sutil (últimos meses); null = sin dato */
  trend?: (number | null)[];
  trendLabels?: string[];
  /** chips sutiles al pie de la tarjeta (ej. WR por segmento) */
  chips?: MetricChip[];
  chipAddon?: ReactNode;
  /** chips en la esquina superior derecha de la tarjeta */
  chipsTop?: { label: string; value: string; tone?: Tone; onClick?: () => void }[];
  /** card héroe: más grande y prominente */
  hero?: boolean;
  chipLayout?: "won";
  footer?: ReactNode;
  reference?: number | null;
}) {
  const trendPoints = (trend ?? []).filter((v): v is number => v !== null && Number.isFinite(v));
  let referenceY: number | null = null;
  let spark: string | null = null;
  let sparkDots: { x: number; y: number; label: string }[] = [];
  if (trend && trendPoints.length >= 2) {
    const min = Math.min(...trendPoints, ...(reference != null ? [reference] : []));
    const max = Math.max(...trendPoints, ...(reference != null ? [reference] : []));
    const span = max - min || 1;
    referenceY = reference != null ? 17 - ((reference - min) / span) * 14 : null;
    const step = 66 / (trend.length - 1 || 1);
    spark = trend
      .map((v, i) => {
        const x = 3 + i * step;
        const y = v === null ? 17 : 17 - ((v - min) / span) * 14;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    sparkDots = trend.map((v, i) => {
      const x = 3 + i * step;
      const y = v === null ? 17 : 17 - ((v - min) / span) * 14;
      const month = trendLabels?.[i] ?? `Mes ${i + 1}`;
      const val = v === null ? "sin dato" : v >= 1000 ? money(v) : v % 1 === 0 ? String(v) : v.toFixed(1);
      return { x, y, label: `${month}: ${val}` };
    });
  }
  const Card = chipAddon || footer ? 'div' : 'button';
  return (
    <Card
      className="metric"
      data-tone={tone}
      data-hero={hero ? "" : undefined}
      data-chip-layout={chipLayout}
      data-has-tooltip={tooltip ? "" : undefined}
      type="button"
      onClick={onClick}
    >
      {chipAddon || footer ? <button type="button" className="metric-label metric-label-action">{label}</button> : <span className="metric-label">{label}</span>}
      {chipsTop && chipsTop.length ? (
        <span className="metric-corner-chips" aria-hidden="true">
          {chipsTop.map((chip) => (
            <span
              key={chip.label}
              className="metric-chip"
              data-tone={chip.tone ?? "neutral"}
              {...(chip.onClick
                ? {
                    role: "button",
                    tabIndex: 0,
                    style: { cursor: "pointer" },
                    title: "Ver deals",
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      chip.onClick?.();
                    },
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        chip.onClick?.();
                      }
                    },
                  }
                : {})}
            >
              <span className="metric-chip-label">{chip.label}</span>
              <span className="metric-chip-value">{chip.value}</span>
            </span>
          ))}
        </span>
      ) : null}
      {tooltip ? (
        <span className="metric-info" aria-hidden="true">
          ⓘ
          <span className="metric-tooltip">{tooltip}</span>
        </span>
      ) : null}
      <strong className="metric-value">
        {value}
        {valueSuffix ? <span className="metric-value-suffix">{valueSuffix}</span> : null}
        {valueChip ? (
          <span className="metric-chip metric-value-chip" data-tone={valueChip.tone ?? "neutral"}>
            <span className="metric-chip-label">{valueChip.label}</span>
            <span className="metric-chip-value">{valueChip.value}</span>
          </span>
        ) : null}
      </strong>
      {spark ? (
        <span className="metric-trend" title="Pasa el cursor por cada punto para ver mes y monto">
          <svg viewBox="0 0 72 20" preserveAspectRatio="none">
            {referenceY != null ? <line x1="3" x2="69" y1={referenceY} y2={referenceY} stroke="currentColor" strokeWidth=".6" strokeDasharray="2 2" opacity=".5"><title>WR histórico: {reference?.toFixed(1)}%</title></line> : null}
            <polyline points={spark} />
            {sparkDots.map((dot, i) => (
              <circle key={i} className="metric-trend-dot" cx={dot.x} cy={dot.y} r={2.6}>
                <title>{dot.label}</title>
              </circle>
            ))}
          </svg>
        </span>
      ) : null}
      {valuation ? <div className="metric-exposure">{valuation}</div> : null}
      {note ? <div className="metric-note">{note}</div> : null}
      {typeof progress === "number" && Number.isFinite(progress) ? (
        (() => {
          const base = Math.max(0, progress);
          const bonus = Number.isFinite(progressBonus ?? NaN) ? Math.max(0, progressBonus!) : 0;
          const scale = Math.max(100, base + bonus);
          return (
            <div className="metric-progress" aria-hidden={progressLabel ? undefined : true} role={progressLabel ? "img" : undefined} aria-label={progressLabel}>
              <div className="metric-progress-track">
                {progressLabel ? <span className="metric-progress-label">{progressLabel}</span> : null}
                <div className="metric-progress-value" style={{ width: `${((base + bonus) / scale) * 100}%` }}>
                  <div
                    className="metric-progress-fill"
                    data-tone={tone}
                    style={{ width: `${(base / (base + bonus || 1)) * 100}%` }}
                  />
                  {bonus > 0 ? (
                    <div
                      className="metric-progress-bonus"
                      data-tone={tone}
                      style={{ width: `${(bonus / (base + bonus)) * 100}%` }}
                    />
                  ) : null}
                </div>
                <span
                  className="metric-progress-tick"
                  style={{ left: `${(100 / scale) * 100}%` }}
                />
              </div>
            </div>
          );
        })()
      ) : null}
      {chips?.length || chipAddon ? (
        <div className="metric-chips">
          {chips?.map((chip) => chip.detail ? <WonStageChip key={chip.label} label={chip.label} value={chip.value} tone={chip.tone ?? "neutral"} detail={chip.detail} /> : (
            <span
              key={chip.label}
              className="metric-chip"
              data-tone={chip.tone ?? "neutral"}
              {...(chip.onClick
                ? {
                    role: "button",
                    tabIndex: 0,
                    style: { cursor: "pointer" },
                    title: "Ver deals",
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      chip.onClick?.();
                    },
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        chip.onClick?.();
                      }
                    },
                  }
                : {})}
            >
              <span className="metric-chip-label">{chip.label}</span>
              <span className="metric-chip-value">{chip.value}</span>
            </span>
          ))}
          {chipAddon}
        </div>
      ) : null}
      {footer}
    </Card>
  );
}

const toneLabel: Record<Tone, string> = {
  ok: "En camino",
  warn: "Atención",
  bad: "En riesgo",
  neutral: "Informativo",
};

const coverageText = (coverage: number) => (coverage >= 99 ? "≥99x" : `${coverage.toFixed(1)}x`);

/** Etapas gestionables del pipeline Comercial, para filtrar los listados de deals. */

/** Cobertura mínima sana del gap de cuota con pipeline ponderado del Q. */
const COVERAGE_OK = 3;
const COVERAGE_WARN = 1.5;

const attainmentTone = (pct: number): Tone => (pct >= 100 ? "ok" : pct >= 60 ? "warn" : "bad");

const emptyRisk = {
  quota: 0,
  won: 0,
  remaining: 0,
  weightedOpen: 0,
  openQAmount: 0,
  coverage: 0,
  risk: "neutral" as Tone,
  riskReason: "sin cuota asignada",
  counts: { ok: 0, warn: 0, bad: 0, neutral: 0 },
};



/** Encabezado de tabla con explicación al pasar el mouse. */
function Th({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <th>
      <span className="th-help" title={help}>
        {children}
        <span className="th-help-icon" aria-hidden="true">
          ⓘ
        </span>
      </span>
    </th>
  );
}

const FOLD_ORDER_KEY = "pulse-fold-order-v1";
const FoldDnd = createContext<{
  order: string[];
  move: (from: string, to: string) => void;
} | null>(null);

/** Contenedor que permite reordenar los acordeones con drag & drop; el orden se guarda por navegador. */
export function FoldList({ children, storageKey = FOLD_ORDER_KEY }: { children: React.ReactNode; storageKey?: string }) {
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(saved)) setOrder(saved.map(id => id === 'Generación y activación' ? 'Generación y gestión del pipeline' : id));
    } catch {
      /* ignore */
    }
  }, []);
  const move = (from: string, to: string) => {
    if (from === to) return;
    const ids = Array.from(document.querySelectorAll<HTMLElement>(".fold-list > .fold[data-fold-id]"))
      .sort((a, b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order))
      .map((el) => el.dataset["foldId"]!);
    const next = ids.filter((id) => id !== from);
    next.splice(next.indexOf(to) + (ids.indexOf(from) < ids.indexOf(to) ? 1 : 0), 0, from);
    setOrder(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };
  return (
    <FoldDnd.Provider value={{ order, move }}>
      <div className="fold-list">{children}</div>
    </FoldDnd.Provider>
  );
}

export function Fold({
  title,
  subtitle,
  children,
  onOpenChange,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [over, setOver] = useState(false);
  const dnd = useContext(FoldDnd);
  const id = title.split(" · ")[0]!;
  const index = dnd?.order.indexOf(id) ?? -1;
  return (
    <section
      className="fold"
      data-fold-id={id}
      data-open={open || undefined}
      data-over={over || undefined}
      style={index >= 0 ? { order: index } : undefined}
      onDragOver={(e) => {
        if (!dnd) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const from = e.dataTransfer.getData("text/fold");
        if (from && dnd) dnd.move(from, id);
      }}
    >
      <Button variant="ghost" type="button" className="fold-head" aria-expanded={open} onClick={() => { onOpenChange?.(!open); setOpen(!open); }}>
        {dnd ? (
          <span
            className="fold-grip"
            draggable
            title="Arrastra para reordenar"
            aria-label={`Reordenar ${id}`}
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/fold", id);
              e.dataTransfer.effectAllowed = "move";
              const section = (e.currentTarget as HTMLElement).closest(".fold");
              if (section) e.dataTransfer.setDragImage(section, 20, 20);
            }}
          >
            ⋮⋮
          </span>
        ) : null}
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
        <span className="fold-chev" aria-hidden>›</span>
      </Button>
      {open ? <div className="fold-body">{children}</div> : null}
    </section>
  );
}

function SectionTitle({
  children,
  action,
  compact = false,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      data-section-head
      data-compact={compact || undefined}
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 24,
        margin: "64px 0 24px",
        flexWrap: "wrap",
      }}
    >
      <h2 className="pulse-h2">{children}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {action}
        <CopySectionButton />
      </div>
    </div>
  );
}

/** Subtítulo de un grupo de tarjetas. */
function QGroup({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <div className="q-group">
      <i data-tone={tone} />
      {label}
    </div>
  );
}

function useAgo(iso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `hace ${hours} h ${restMinutes} min` : `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `hace ${days} d ${restHours} h` : `hace ${days} d`;
}

export function PulseDashboard({
  report,
  onRefresh,
  isRefreshing,
  tabs,
  onSimulate,
  onNavigate,
  section = "general",
  role = "all",
  onRole,
}: {
  report: PulseReport;
  onRefresh: () => void;
  isRefreshing: boolean;
  tabs?: React.ReactNode;
  onSimulate?: (ownerId: string) => void;
  /** Overview and focused destinations share the same master filter state. */
  section?: PulseSection;
  onNavigate?: (view: PulseFocusView) => void;
  /** rol comercial: todos (predeterminado), AE o KAM */
  role?: "all" | "AE" | "KAM";
  onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const projectsOnly = section === "proyectos";
  useEffect(() => {
    setModalKey(null);
    setPeriodPayload(null);
    setGapInitialMonth(null);
    setGapScenario(false);
    document.querySelector<HTMLElement>('.pulse-focus-heading h2')?.focus({ preventScroll: true });
  }, [section]);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [gapInitialMonth, setGapInitialMonth] = useState<string | null>(null);
  const [gapScenario, setGapScenario] = useState(false);
  const [resultDateBasis, setResultDateBasis] = useState<"close" | "stage6">("close");
  const [periodPayload, setPeriodPayload] = useState<(Drilldown & { presentation?: "won" | "stage-entry" }) | null>(null);
  const [dense, setDense] = useState(true);
  const [year, setYear] = useState(report.currentPeriod.split("-Q")[0]!);
  const [quarter, setQuarter] = useState<string>(report.currentPeriod.split("-Q")[1]!);
  const { activeMrr: headerMrr } = useRefreshMenu();
  const [ownerFilter, setOwnerFilter] = useState<string>("team");
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  /** Tipo de deal: todo (predeterminado), inbound, outbound, upsell o cross sell. */
  const [dealType, setDealType] = useState<string>("all");
  const ownerDefaultApplied = useRef(false);
  const ago = useAgo(report.generatedAt);

  const handleRole = (item: "all" | "AE" | "KAM") => {
    onRole?.(item);
    // Al cambiar de rol, el comercial vuelve siempre a Equipo.
    setOwnerFilter("team");
  };


  const payload = periodPayload ?? (modalKey ? report.drilldowns[modalKey] ?? null : null);
  const closeModal = () => {
    setGapScenario(false);
    setGapInitialMonth(null);
    setModalKey(null);
    setPeriodPayload(null);
  };

  const scope = report.quality.find((item) => item.id === ownerFilter) ?? report.quality.find((item) => item.id === "team") ?? report.quality[0]!;
  const trackRaw =
    report.tracking?.find((item) => item.id === ownerFilter) ?? report.tracking?.find((item) => item.id === "team") ?? report.tracking?.[0] ?? null;
  const track = trackRaw ? { ...trackRaw, deals: trackRaw.deals ?? [] } : null;
  const closeRaw =
    report.closeHygiene?.find((item) => item.id === ownerFilter) ?? report.closeHygiene?.find((item) => item.id === "team") ?? report.closeHygiene?.[0] ?? null;
  const closeData = closeRaw ? { ...closeRaw, deals: closeRaw.deals ?? [] } : null;
  const monthWithoutMrr = closeData ? (report.drilldowns[closeData.monthModal]?.deals ?? []).filter(deal => deal.amountValue <= 0).length : 0;
  const monthUnvalued = Boolean(closeData && closeData.monthCount > 0 && closeData.monthAmount === 0);

  const isAllYear = quarter === "all";
  const selectedPeriod = isAllYear ? `${year}-QALL` : `${year}-Q${quarter}`;
  const risk = report.risk ?? emptyRisk;

  const quarters = useMemo(() => ["1", "2", "3", "4"], []);

  const yearPeriods = useMemo(
    () => quarters.map((q) => `${year}-Q${q}`),
    [quarters, year],
  );

  const selectedPeriods = useMemo(
    () => (isAllYear ? yearPeriods : [selectedPeriod]),
    [isAllYear, yearPeriods, selectedPeriod],
  );

  const rangeLabel = isAllYear ? `Año ${year}` : shortPeriod(selectedPeriod);

  // Filtro de tipo de deal (todo / inbound / outbound / upsell / cross sell) aplicado a los deals del periodo.
  const matchesType = useMemo(() => {
    if (dealType === "all") return () => true;
    const targets: Record<string, string> = {
      inbound: "Inbound",
      outbound: "Outbound",
      upsell: "Upsell",
      crossSell: "Cross sell",
    };
    const target = targets[dealType];
    if (!target) return () => true;
    return (deal: DealDTO) => deal.segment === target;
  }, [dealType]);

  // Top of funnel: deals creados, etapa 0 y avisos de +10 días (desde los recorridos por etapa).
  const funnelTop = useMemo(() => {
    const DAY = 86_400_000;
    const nowMs = Date.now();
    const E0 = "1144383754";
    const OPEN = new Set([E0, "171385863", "171385864", "173996363", "1181334581", "171385866", "171385867", "1245768029"]);
    const scoped = (report.stageJourneys ?? []).filter(
      (j) => (ownerFilter === "team" || j.deal.ownerId === ownerFilter) && (role === "all" || roleOfOwner(j.deal.ownerId) === role) && matchesType(j.deal),
    );
    const stageEntries = generationStageEntries(scoped, selectedPeriods);
    const created = stageEntries.generated;
    const comparisonWindow = creationComparisonWindow(Number(year), quarter, nowMs);
    const previousCreated = scoped.filter((j) => {
      const date = Date.parse(generationEntryDate(j));
      return date >= comparisonWindow.previousStart && date < comparisonWindow.previousEnd;
    });
    const periodEndMonth = quarter === "all" ? 11 : Number(quarter) * 3 - 1;
    const periodEnd = Date.UTC(Number(year), periodEndMonth, 1);
    const currentMonth = new Date(nowMs);
    const trendEnd = Math.min(periodEnd, Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth(), 1));
    const anchor = new Date(trendEnd);
    const trendMonths = Array.from({ length: 6 }, (_, index) =>
      new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 5 + index, 1)),
    );
    const createdTrend = trendMonths.map((month) => {
      const start = month.getTime();
      const end = Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1);
      return scoped.filter((j) => {
        const timestamp = Date.parse(generationEntryDate(j));
        return timestamp >= start && timestamp < end;
      }).length;
    });
    const createdTrendLabels = trendMonths.map((month) =>
      month.toLocaleDateString("es", { month: "short", year: "2-digit", timeZone: "UTC" }),
    );
    const LOST_ID = "171385869";
    const e0ToE1 = stageEntries.activated;
    const pendingValNow = scoped.filter(j => j.deal.stageId === "171385864");
    const pendingValPeriod = created.filter(j => !j.entered["E4"] && j.deal.stageId !== LOST_ID && !j.entered["LOST"]);
    const valuedList = stageEntries.valued;
    const lostAfterActivation = stageEntries.lost;
    const lostFromE1 = stageEntries.lostFromE1;
    const e0Stuck = scoped.filter((j) => {
      if (j.deal.stageId !== E0) return false;
      const since = Date.parse(j.entered["E0"] || j.createdAt);
      return Number.isFinite(since) && nowMs - since > 10 * DAY;
    });
    const noSales = scoped.filter((j) => {
      if (!OPEN.has(j.deal.stageId)) return false;
      const last = Date.parse(j.deal.lastContacted || "");
      const created = Date.parse(j.createdAt);
      return Number.isFinite(last)
        ? nowMs - last > 10 * DAY
        : Number.isFinite(created) && nowMs - created > 10 * DAY;
    });
    const openNow = scoped.filter((j) => OPEN.has(j.deal.stageId));
    const acts = openNow.map((j) => j.deal.activities).filter((v): v is number => typeof v === "number");
    const avgActs = acts.length ? acts.reduce((a, b) => a + b, 0) / acts.length : null;
    const deals = (list: typeof scoped) => list.map((j) => j.deal);
    return {
      created: deals(created),
      createdTrend,
      createdTrendLabels,
      createdAmount: created.reduce((sum, j) => sum + (j.deal.amountValue || 0), 0),
      valued: deals(valuedList),
      valuedAmount: valuedList.reduce((sum, j) => sum + (j.deal.amountValue || 0), 0),
      pendingValNow: deals(pendingValNow),
      pendingValPeriod: deals(pendingValPeriod),
      previousCreatedCount: previousCreated.length,
      comparisonPartial: comparisonWindow.partial,
      comparisonFuture: comparisonWindow.future,
      e0ToE1: deals(e0ToE1),
      lostAfterActivation: deals(lostAfterActivation),
      lostFromE1: deals(lostFromE1),
      e0Stuck: deals(e0Stuck),
      noSales: deals(noSales),
      openCount: openNow.length,
      openDeals: deals(openNow),
      avgActs,
    };
  }, [report.stageJourneys, ownerFilter, role, matchesType, selectedPeriods, year, quarter, isAllYear]);
  const openList = (
    title: string,
    subtitle: string,
    deals: DealDTO[],
    notActivatedIds?: string[],
    /** orden inicial del popup; ej. { key: "closeDate", dir: "desc" } para ver lo más reciente primero */
    initialSort?: { key: string; dir: "asc" | "desc" },
  ) => setPeriodPayload({ title, subtitle, deals, notActivatedIds, initialSort } as Drilldown);

  // Agrega los buckets de periodo (team + owners) para los periodos seleccionados.
  const closePeriodData = useMemo(() => {
    const buckets = selectedPeriods
      .map((p) => report.periods.data[p])
      .filter((b): b is { team: PeriodStats; owners: Record<string, PeriodStats> } => Boolean(b));
    if (buckets.length === 0) return undefined;
    // Cuando hay filtro de tipo, los totales se recalculan desde los deals filtrados.
    const scoped = (stats: PeriodStats): PeriodStats => {
      if (dealType === "all") return stats;
      const wonDeals = stats.wonDeals.filter(matchesType);
      const lostDeals = stats.lostDeals.filter(matchesType);
      return {
        won: wonDeals.length,
        lost: lostDeals.length,
        wonAmount: wonDeals.reduce((sum, d) => sum + (d.amountValue || 0), 0),
        lostAmount: lostDeals.reduce((sum, d) => sum + (d.amountValue || 0), 0),
        wonOtf: wonDeals.reduce((sum, d) => sum + (d.otfValue || 0), 0),
        wonDeals,
        lostDeals,
      };
    };
    const ownerIds = new Set<string>();
    for (const b of buckets) for (const id of Object.keys(b.owners)) ownerIds.add(id);
    const aggOwner = (id: string): PeriodStats => {
      const acc = { won: 0, lost: 0, wonAmount: 0, lostAmount: 0, wonOtf: 0, wonDeals: [] as DealDTO[], lostDeals: [] as DealDTO[] };
      for (const b of buckets) {
        const raw = b.owners[id];
        if (!raw) continue;
        const o = scoped(raw);
        acc.won += o.won;
        acc.lost += o.lost;
        acc.wonAmount += o.wonAmount;
        acc.lostAmount += o.lostAmount;
        acc.wonOtf += o.wonOtf;
        acc.wonDeals.push(...o.wonDeals);
        acc.lostDeals.push(...o.lostDeals);
      }
      return acc;
    };
    const teamAcc = { won: 0, lost: 0, wonAmount: 0, lostAmount: 0, wonOtf: 0, wonDeals: [] as DealDTO[], lostDeals: [] as DealDTO[] };
    for (const bucket of buckets) {
      const b = scoped(bucket.team);
      teamAcc.won += b.won;
      teamAcc.lost += b.lost;
      teamAcc.wonAmount += b.wonAmount;
      teamAcc.lostAmount += b.lostAmount;
      teamAcc.wonOtf += b.wonOtf;
      teamAcc.wonDeals.push(...b.wonDeals);
      teamAcc.lostDeals.push(...b.lostDeals);
    }
    return { team: teamAcc, owners: Object.fromEntries([...ownerIds].map((id) => [id, aggOwner(id)])) };
  }, [report.periods.data, selectedPeriods, dealType, matchesType]);

  const useStage6Results = section === "general" && resultDateBasis === "stage6";
  const resultsDateLabel = useStage6Results ? "Entrada a ganado · E6" : "Fecha de cierre";
  const stage6EntryDates = useMemo(() => stage6AttributionDates(report.stageJourneys ?? []), [report.stageJourneys]);
  const periodData = useMemo(() => {
    if (!useStage6Results) return closePeriodData;
    const won = wonByStage6Entry((report.stageJourneys ?? []).filter(row => matchesType(row.deal) && (role === "all" || roleOfOwner(row.deal.ownerId) === role)), selectedPeriods);
    const owners = new Set([...Object.keys(closePeriodData?.owners ?? {}),...won.map(deal=>deal.ownerId)]);
    return {team:withWonDeals(closePeriodData?.team,won),owners:Object.fromEntries([...owners].map(owner=>[owner,withWonDeals(closePeriodData?.owners[owner],won.filter(deal=>deal.ownerId===owner))]))};
  }, [useStage6Results,closePeriodData,report.stageJourneys,matchesType,role,selectedPeriods]);

  // Abre un popup con los deals ganados/perdidos de los periodos seleccionados.
  const openPeriods = (ownerId: string | null, outcome: "won" | "lost") => {
    const buckets = selectedPeriods
      .map((p) => report.periods.data[p])
      .filter((b): b is { team: PeriodStats; owners: Record<string, PeriodStats> } => Boolean(b));
    if (buckets.length === 0) return;
    const deals: DealDTO[] = [];
    for (const b of buckets) {
      const stats = ownerId ? b.owners[ownerId] : b.team;
      if (!stats) continue;
      deals.push(...(outcome === "lost" ? stats.lostDeals : stats.wonDeals).filter(matchesType));
    }
    setPeriodPayload({
      title: `${ownerId ? report.periods.owners[ownerId] : "Equipo"} · ${
        outcome === "lost" ? "Perdidos" : "Ganados"
      } ${rangeLabel}`,
      subtitle: `Deals ${outcome === "lost" ? "perdidos" : "ganados"} del periodo`,
      deals,
    });
  };

  const openPeriod = (period: string, ownerId: string | null, outcome: "won" | "lost") => {
    const bucket = report.periods.data[period];
    if (!bucket) return;
    const stats = ownerId ? bucket.owners[ownerId] : bucket.team;
    if (!stats) return;
    setPeriodPayload({
      title: `${ownerId ? report.periods.owners[ownerId] : "Equipo"} · ${
        outcome === "lost" ? "Perdidos" : "Ganados"
      } ${period}`,
      subtitle: `Deals ${outcome === "lost" ? "perdidos" : "ganados"} del periodo`,
      deals: outcome === "lost" ? stats.lostDeals : stats.wonDeals,
    });
  };

  // ---------- Valores scopeados por comercial ----------
  const isTeam = ownerFilter === "team";
  const taskData =
    (report.taskHygiene ?? []).find((item) => item.id === (isTeam ? "team" : ownerFilter)) ??
    (report.taskHygiene ?? [])[0] ??
    null;
  const ownerRow = isTeam ? null : report.ownerRows.find((r) => r.id === ownerFilter) ?? null;
  const quotaRow = isTeam ? null : report.quotaRows.find((r) => r.id === ownerFilter) ?? null;
  const ownerName = isTeam ? "Equipo" : report.periods.owners[ownerFilter] ?? "Comercial";
  const scopeId = isTeam ? "team" : ownerFilter;
  const warningScope =
    (report.warnings ?? []).find((item) => item.id === (isTeam ? "team" : ownerFilter)) ?? null;
  const rampDevScope =
    (report.rampDev ?? []).find((item) => item.id === scopeId) ?? (report.rampDev ?? [])[0] ?? null;
  const planBotScope =
    (report.planBot ?? []).find((item) => item.id === scopeId) ?? (report.planBot ?? [])[0] ?? null;
  const deliveryScope =
    (report.delivery ?? []).find((item) => item.id === scopeId) ?? (report.delivery ?? [])[0] ?? null;

  // Snapshot de pipeline abierto (siempre la foto actual, independiente del año/Q).
  const openAmount = isTeam ? report.team.openAmount : ownerRow?.openAmount ?? 0;
  const openCount = isTeam ? report.team.openCount : ownerRow?.openCount ?? 0;
  const weightedOpen = isTeam ? report.team.weightedQ : ownerRow?.weightedQ ?? 0;
  const openModalKey = isTeam ? "team-open" : `owner-${ownerFilter}-open`;
  const qOpenModalKey = isTeam ? "team-q-open" : `owner-${ownerFilter}-q-open`;

  // Ganado/perdido del periodo seleccionado (año + Q + comercial).
  // Todos los ganados (WR, ticket) vs. población elegible para la cuota (SALES-85/86).
  const periodAllWonAmount = isTeam
    ? periodData?.team.wonAmount ?? 0
    : periodData?.owners[ownerFilter]?.wonAmount ?? 0;
  const periodAllWonCount = isTeam
    ? periodData?.team.won ?? 0
    : periodData?.owners[ownerFilter]?.won ?? 0;
  const quotaPeriod = useMemo(
    () => quotaStats((isTeam ? periodData?.team.wonDeals : periodData?.owners[ownerFilter]?.wonDeals) ?? []),
    [periodData, isTeam, ownerFilter],
  );
  const quotaScopeName = isTeam ? "Equipo" : report.periods.owners[ownerFilter] ?? "Comercial";
  const openQuotaWon = () =>
    setPeriodPayload({
      title: `${quotaScopeName} · Ganados que suman a la cuota ${rangeLabel}`,
      subtitle: `${resultsDateLabel} · ${quotaPeriod.won} elegibles · fuera de cuota: ${quotaPeriod.excluded.length} (renovación, contracción o billetera)`,
      deals: quotaPeriod.eligible,
      presentation: "won",
    });
  const quotaOutByKind = (kinds: string[]) => quotaPeriod.excluded.filter((d) => kinds.includes(classifyQuotaDeal(d).kind));
  // SALES-85 propuesta (no aplicada): entrados a E6 en un Q anterior que aún no llegan a 6.2.
  const stage6Proposal = useMemo(() => {
    const journeys = (report.stageJourneys ?? []).filter(
      (j) => (isTeam || j.deal.ownerId === ownerFilter) && (role === "all" || roleOfOwner(j.deal.ownerId) === role) && matchesType(j.deal),
    );
    return pendingFromPreviousQuarters(journeys, report.currentPeriod);
  }, [report.stageJourneys, report.currentPeriod, isTeam, ownerFilter, role, matchesType]);
  const periodWonAmount = quotaPeriod.wonAmount;
  const periodWonCount = quotaPeriod.won;
  const periodLostAmount = isTeam
    ? periodData?.team.lostAmount ?? 0
    : periodData?.owners[ownerFilter]?.lostAmount ?? 0;
  const periodLostCount = isTeam
    ? periodData?.team.lost ?? 0
    : periodData?.owners[ownerFilter]?.lost ?? 0;
  const periodQuota = useMemo(() => {
    const sum = (ownerId: string | null) =>
      selectedPeriods.reduce((acc, p) => {
        const q = report.periods.quotas[p];
        if (!q) return acc;
        return acc + (ownerId ? q[ownerId] ?? 0 : Object.values(q).reduce((s, v) => s + v, 0));
      }, 0);
    return isTeam ? sum(null) : sum(ownerFilter);
  }, [report.periods.quotas, selectedPeriods, isTeam, ownerFilter]);
  // Cuota del período por nombre de comercial (para el popup de ganados en vista equipo).
  const ownerQuotaByName = useMemo(() => {
    if (!isTeam) return null;
    const map: Record<string, number> = {};
    for (const [ownerId, name] of Object.entries(report.periods.owners)) {
      map[name] = selectedPeriods.reduce(
        (acc, p) => acc + (report.periods.quotas[p]?.[ownerId] ?? 0),
        0,
      );
    }
    return map;
  }, [isTeam, report.periods.owners, report.periods.quotas, selectedPeriods]);
  const performanceNow = useLiveNow(Date.parse(report.generatedAt));
  const pace = selectedPeriods.length===1 ? quarterPace(selectedPeriods[0]!, periodQuota, periodWonAmount + (quotaPeriod.wonOtf ?? 0)/12, performanceNow) : null;
  const historicalClosed = Object.values(report.periods.data).flatMap(bucket => {
    const stats = isTeam ? bucket.team : bucket.owners[ownerFilter];
    return stats ? [...stats.wonDeals.map(deal=>({deal,won:true})),...stats.lostDeals.map(deal=>({deal,won:false}))] : [];
  }).filter(({deal})=>deal.amountValue>0 && matchesType(deal) && (role==='all'||roleOfOwner(deal.ownerId)===role));
  const historicalUnique = [...new Map(historicalClosed.map(row=>[row.deal.id,row])).values()];
  const historicalWr = historicalUnique.length ? historicalUnique.filter(row=>row.won).length/historicalUnique.length*100 : null;
  const periodQuotaPct = periodQuota ? (periodWonAmount / periodQuota) * 100 : 0;
  // Win rate y ticket solo consideran deals con monto > $0 para que los $0 no distorsionen.
  const periodWonPositive = (isTeam ? closePeriodData?.team.wonDeals : closePeriodData?.owners[ownerFilter]?.wonDeals ?? [])
    ?.filter((d) => (d.amountValue || 0) > 0).length ?? 0;
  const periodLostPositive = (isTeam ? closePeriodData?.team.lostDeals : closePeriodData?.owners[ownerFilter]?.lostDeals ?? [])
    ?.filter((d) => (d.amountValue || 0) > 0).length ?? 0;
  const periodWr = { won: periodWonPositive, lost: periodLostPositive };
  const executiveDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Coyhaique", year: "numeric", month: "2-digit", day: "2-digit" }).format(performanceNow);
  // Commercial Adereso pipeline is enforced upstream; only commercial filters scope the strip.
  const executive = useMemo(() => buildExecutiveStrip(
    report.stageJourneys ?? [],
    report.executiveStrip?.onTrack ?? {
      yes: report.drilldowns[report.tracking?.find(t => t.id === "team")?.onTrackYesModal ?? ""]?.deals ?? [],
      no: report.drilldowns[report.tracking?.find(t => t.id === "team")?.onTrackNoModal ?? ""]?.deals ?? [],
    }, Date.parse(report.generatedAt), { owner: ownerFilter, role, matchesType }, performanceNow), [report, ownerFilter, role, matchesType, executiveDay]);
  const operationalTasks = useMemo(() => dashboardActionGroups(report, { owner: ownerFilter, role, stages: stageFilter, matchesType }, performanceNow), [report, ownerFilter, role, stageFilter, matchesType, executiveDay]);
  const overdueDealIds = useMemo(() => [...new Set((report.stageJourneys ?? []).map(row => row.deal).filter(deal => TASK_OPEN_STAGES[deal.stageId] && (ownerFilter === 'team' || deal.ownerId === ownerFilter) && (role === 'all' || roleOfOwner(deal.ownerId) === role) && matchesType(deal) && (!stageFilter.length || stageFilter.includes(deal.stage))).map(deal => deal.id))].sort(), [report.stageJourneys, ownerFilter, role, matchesType, stageFilter]);
  const overdueTasks = useOverdueTasks(overdueDealIds, {owner:ownerFilter,role,type:dealType,stages:stageFilter}, report.generatedAt, executiveDay, section === 'general' || section === 'forecast', onRefresh);
  const overdueExposure = overdueTasks.data ? overdueTaskExposure(overdueTasks.data) : null;
  const { openPipe, wonJourney } = executive;
  const executiveRange = shortPeriod(executive.period);
  const wonComparison = useMemo(() => {
    const amountFor = (periodsToSum: string[]) => {
      if (useStage6Results) return quotaStats(wonByStage6Entry((report.stageJourneys ?? []).filter(row => (isTeam || row.deal.ownerId === ownerFilter) && (role === "all" || roleOfOwner(row.deal.ownerId) === role) && matchesType(row.deal)), periodsToSum)).wonAmount;
      const buckets = periodsToSum.map((period) => report.periods.data[period]).filter(Boolean);
      return buckets.reduce((sum, bucket) => {
        if (!bucket) return sum;
        const stats = isTeam ? bucket.team : bucket.owners[ownerFilter];
        if (!stats) return sum;
        return (
          sum +
          quotaStats(stats.wonDeals.filter(matchesType)).wonAmount
        );
      }, 0);
    };
    if (isAllYear) {
      const previous = amountFor(["1", "2", "3", "4"].map((q) => `${Number(year) - 1}-Q${q}`));
      return { label: "YoY", value: previous ? ((periodWonAmount - previous) / previous) * 100 : null };
    }
    const currentQ = Number(quarter);
    const previousPeriod = currentQ === 1 ? `${Number(year) - 1}-Q4` : `${year}-Q${currentQ - 1}`;
    const previous = amountFor([previousPeriod]);
    return { label: "QoQ", value: previous ? ((periodWonAmount - previous) / previous) * 100 : null };
  }, [isAllYear, isTeam, matchesType, ownerFilter, periodWonAmount, quarter, report.periods.data, year, useStage6Results, report.stageJourneys, role]);

  // ---------- Chips del cuadrito de ganado ----------
  // Debajo de la barra de cuota: comparación y monto real.
  const wonChips = useMemo<MetricChip[]>(() => {
    const deals = quotaPeriod.eligible;
    const chips: MetricChip[] = [
      {
        label: wonComparison.label,
        value:
          wonComparison.value === null
            ? "s/n"
            : `${wonComparison.value >= 0 ? "+" : ""}${wonComparison.value.toFixed(1)}%`,
        tone: wonComparison.value === null ? "neutral" : wonComparison.value >= 0 ? "ok" : "bad",
      },
    ];
    // Partition only the won deals already included in this period's eligible amount.
    for (const group of wonStageBreakdown(deals, periodQuota)) {
      chips.push({
        label: group.label,
        value: `${money(group.mrr)} · ${group.percentage === null ? "s/n" : `${group.percentage.toFixed(1)}%`} · ${group.deals.length}`,
        tone: group.tone,
        detail: { deals: group.deals, description: group.description, period: rangeLabel, quota: periodQuota, mrr: group.mrr, otfMonthly: group.otfMonthly, countsOfficially: group.key === 'real' },
      });
    }
    const wallets = quotaOutByKind(["wallet"]);
    const renewals = quotaOutByKind(["renewal", "contraction"]);
    const show = (title: string, subtitle: string, list: DealDTO[]) => () =>
      setPeriodPayload({ title: `${quotaScopeName} · ${title} ${rangeLabel}`, subtitle, deals: list } as Drilldown);
    if (renewals.length) chips.push({ label: "Renov./contr. fuera", value: String(renewals.length), tone: "neutral", onClick: show("Renovaciones y contracciones", "No suman a la cuota", renewals) });
    if (wallets.length) chips.push({ label: "Billeteras vendidas", value: String(wallets.length), tone: "neutral", onClick: show("Billeteras vendidas", "Fuera de la cuota; su monto no es MRR", wallets) });
    if (quotaPeriod.review.length) chips.push({ label: "Revisar clasificación", value: String(quotaPeriod.review.length), tone: "warn", onClick: show("Clasificación a revisar", "Mixtos o sin dato de tipo/producto: hoy suman a la cuota", quotaPeriod.review) });
    const previousDeals = stage6Proposal.pending.map(r => r.deal);
    chips.push({ label: "PEND. Q ANT.", value: String(previousDeals.length), tone: "warn", detail: {
      deals: previousDeals, period: "Q ANTERIORES", quota: 0, historical: true,
      description: "Ganados atribuidos a un trimestre anterior por su entrada a E6 y que todavía no llegan a E6.2. Propuesta por validar; no suman al cumplimiento del período seleccionado.",
      mrr: previousDeals.reduce((sum, d) => sum + (d.amountValue || 0), 0),
      otfMonthly: previousDeals.reduce((sum, d) => sum + (d.otfValue || 0) / 12, 0),
    } });
    return chips;
  }, [periodQuota, wonComparison, quotaPeriod, stage6Proposal, quotaScopeName, rangeLabel]);

  // ---------- WR por segmento (chips al pie del cuadrito de WR) ----------
  const wrSegmentChips = useMemo<{ label: string; value: string; tone?: Tone; onClick?: () => void }[]>(() => {
    const chipFor = (label: string, stats: { won: number; lost: number } | undefined) => {
      const s = stats ?? { won: 0, lost: 0 };
      const total = s.won + s.lost;
      const pct = total ? Math.round((s.won / total) * 100) : null;
      const tone: Tone = pct === null ? "neutral" : pct >= 50 ? "ok" : pct >= 30 ? "warn" : "bad";
      return {
        label,
        value: pct === null ? "s/n" : `${pct}%`,
        tone,
      };
    };
    if (isTeam) {
      // Agregar por segmento a partir de los quotaRows del equipo.
      const agg = { inbound: { won: 0, lost: 0 }, outbound: { won: 0, lost: 0 }, upsell: { won: 0, lost: 0 }, crossSell: { won: 0, lost: 0 } };
      for (const row of report.quotaRows) {
        const seg = row.wrBySegment ?? {};
        if (seg.inbound) { agg.inbound.won += seg.inbound.won; agg.inbound.lost += seg.inbound.lost; }
        if (seg.outbound) { agg.outbound.won += seg.outbound.won; agg.outbound.lost += seg.outbound.lost; }
        if (seg.upsell) { agg.upsell.won += seg.upsell.won; agg.upsell.lost += seg.upsell.lost; }
        if (seg.crossSell) { agg.crossSell.won += seg.crossSell.won; agg.crossSell.lost += seg.crossSell.lost; }
      }
      return [
        chipFor("Inb", agg.inbound),
        chipFor("Out", agg.outbound),
        chipFor("Up", agg.upsell),
        chipFor("Cross", agg.crossSell),
      ];
    }
    if (!quotaRow) return [];
    const seg = quotaRow.wrBySegment ?? {};
    const isAE = quotaRow.role ? quotaRow.role === "AE" : ["82596016", "331766554", "373167468"].includes(quotaRow.id);
    return isAE
      ? [chipFor("Inb", seg.inbound), chipFor("Out", seg.outbound)]
      : [chipFor("Up", seg.upsell), chipFor("Cross", seg.crossSell)];
  }, [isTeam, report.quotaRows, quotaRow]);


  // OTF (pago único): ganado del periodo filtrado y activo en pipeline (foto actual).
  const periodOtfWon = quotaPeriod.wonOtf;
  // Bonus OTF/12 expresado como puntos de cuota y cumplimiento total (MRR + bonus).
  const otfBonusPct = periodQuota ? (periodOtfWon / 12 / periodQuota) * 100 : 0;
  const totalAttainmentPct = periodQuotaPct + otfBonusPct;
  const wonAttainmentTone: Tone = periodQuota <= 0 ? "neutral" : totalAttainmentPct <= 40 ? "bad" : totalAttainmentPct <= 80 ? "warn" : "ok";
  const periodWonWithOtf = periodWonAmount + periodOtfWon / 12;
  const periodGap = Math.max(0, periodQuota - periodWonWithOtf);
  const gapPreviewDeals = (report.drilldowns[qOpenModalKey]?.deals ?? []).filter(d => !stageFilter.length || stageFilter.includes(d.stage));
  const gapMonthSummary = summarizeDealMonths(gapPreviewDeals, performanceNow);
  const gapMonths = Array.from({ length: 3 }, (_, index) => {
    const month = (gapMonthSummary.quarter - 1) * 3 + index;
    const key = `${gapMonthSummary.year}-${String(month + 1).padStart(2, "0")}`;
    const bucket = gapMonthSummary.quarterMonths.find(m => m.key === key);
    return { key, label: new Date(Date.UTC(gapMonthSummary.year, month, 1)).toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" }).replace(".", "").toUpperCase(), amount: bucket?.amount ?? 0, count: bucket?.count ?? 0 };
  });
  const gapQuarterMonths = new Set(gapMonths.map(month => month.key));
  const gapQuarterDeals = gapPreviewDeals.filter(deal => {
    const key = closeMonthKey(deal.closeDateValue);
    return key !== null && gapQuarterMonths.has(key);
  });
  const gapCoverage = pipelineCoverage(gapQuarterDeals, periodQuota, periodGap);
  const gapCoverageSamePeriod = selectedPeriods.length === 1 && selectedPeriods[0] === `${gapMonthSummary.year}-Q${gapMonthSummary.quarter}`;
  const gapCoverageValue = !gapCoverageSamePeriod ? "—" : periodQuota <= 0 ? "SIN CUOTA" : periodGap <= 0 ? "CUMPLIDA" : gapCoverage.coverage === null ? "S/D" : `${gapCoverage.coverage.toFixed(1)}×`;
  const gapCoverageInfo = !gapCoverageSamePeriod
    ? "La cobertura requiere seleccionar el mismo trimestre que el pipeline mostrado."
    : `Cobertura ponderada = suma de MRR × probabilidad de cada negocio del trimestre ÷ falta para la cuota (MRR ganado + OTF/12 ya descontados). Pipeline ponderado: ${gapCoverage.weighted === null ? "sin datos completos de probabilidad" : money(gapCoverage.weighted)}. Faltante: ${money(periodGap)}.`;
  const openGapDeals = (summaryDate: string | null = null) => {
    setGapScenario(true);
    setGapInitialMonth(summaryDate);
    setPeriodPayload(null);
    setModalKey(qOpenModalKey);
  };
  const selectionQuotaForOwner=(selectionOwner:string)=>{
  const selectionWon=quotaStats((selectionOwner==='team' ? periodData?.team.wonDeals : periodData?.owners[selectionOwner]?.wonDeals)??[]);
  return {
    quota:selectionOwner==='team' ? periodQuota : selectedPeriods.reduce((sum,period)=>sum+(report.periods.quotas[period]?.[selectionOwner]??0),0),
    won:selectionWon.wonAmount+selectionWon.wonOtf/12,
    label:`${selectionOwner==='team'?'Equipo':report.periods.owners[selectionOwner]??ownerName} · ${rangeLabel}`,
    periods:selectedPeriods,
    wonIds:selectionWon.eligible.map(deal=>deal.id),
    openIds:openPipe.stages.flatMap(stage=>stage.deals.map(deal=>deal.id)),
  };};
  const selectionQuota=selectionQuotaForOwner(ownerFilter);
  // Snapshots antiguos en caché pueden no traer la sección mensual.
  const monthly: MonthlyPulse = report.monthly ?? {
    months: [],
    open: { team: [], byOwner: {} },
    won: [],
    wonDeals: [],
    adoboAvg: [],
  };
  const pipelineTrend = isTeam
    ? monthly.open.team
    : (monthly.open.byOwner[ownerFilter] ?? null);
  const weightedTrend = isTeam
    ? monthly.weighted?.team
    : monthly.weighted?.byOwner[ownerFilter];
  const lostTrend = isTeam ? monthly.lost : monthly.lostByOwner?.[ownerFilter];
  const wrTrend = isTeam ? monthly.winRate?.team : monthly.winRate?.byOwner[ownerFilter];
  const ticketTrend = isTeam ? monthly.avgWonTicket?.team : monthly.avgWonTicket?.byOwner[ownerFilter];

  // Riesgo de cumplimiento del Q en curso (siempre trimestre actual) scopeado por comercial.
  const scopedRisk = useMemo<RiskSummary>(() => {
    if (isTeam) return risk;
    if (!quotaRow) return emptyRisk;
    return {
      quota: quotaRow.quota,
      won: quotaRow.wonQAmount,
      remaining: quotaRow.remaining,
      weightedOpen: quotaRow.weightedOpenQ,
      openQAmount: quotaRow.weightedOpenQ,
      coverage: quotaRow.coverage,
      risk: quotaRow.risk,
      riskReason: quotaRow.riskReason,
      counts: { ok: 0, warn: 0, bad: 0, neutral: 0 },
    };
  }, [isTeam, risk, quotaRow]);

  const scopedAlerts = useMemo(
    () =>
      isTeam
        ? report.alerts
        : report.alerts.filter((a) => a.owner === report.periods.owners[ownerFilter]),
    [report.alerts, report.periods.owners, isTeam, ownerFilter],
  );

  const exposureLabel = (deals: readonly { id: string; amountValue: number }[] | undefined) => {
    if (!deals) return "MRR no disponible";
    const { mrr, unvalued } = dealExposure(deals);
    return `${money(mrr)} MRR involucrado${unvalued ? ` · ${unvalued} sin MRR` : ""}`;
  };
  const modalExposure = (key: string | undefined) => exposureLabel(key ? report.drilldowns[key]?.deals : undefined);

  const highProbabilityCard = scope.cards.find(card => card.label === "Alta probabilidad");
  const forecastSignals = [
    {id:"high-probability",title:"Oportunidades con 70%+ de cierre",note:`${rangeLabel} · revisar qué oportunidad empujar.`,deals:report.drilldowns[highProbabilityCard?.modal ?? ""]?.deals},
    {id:"e0",title:"Reuniones sin concretar · E0 +10 días",note:"Revalidar la reunión agendada y definir el próximo paso.",deals:funnelTop.e0Stuck},
    {id:"activity",title:"Sin actividad de venta +10 días",note:"Retomar gestión o confirmar si la oportunidad sigue vigente.",deals:funnelTop.noSales},
    {id:"e5",title:"Negociaciones estancadas · E5 +60 días",note:"Acordar una decisión o un siguiente paso concreto.",deals:report.drilldowns[closeData?.stale5Modal ?? ""]?.deals},
    {id:"e2",title:"Deals estancados · E2 +40 días",note:"Confirmar si corresponde avanzar la oportunidad.",deals:report.drilldowns[closeData?.stale2Modal ?? ""]?.deals},
    {id:"no-date",title:"Sin fecha de cierre",note:"Registrar una fecha respaldada por el cliente.",deals:report.drilldowns[closeData?.noDateModal ?? ""]?.deals},
    {id:"poc",title:"PoC vencida · E5.1",note:"Revisar el resultado del piloto y su fecha de término.",deals:report.drilldowns[closeData?.pocOverdueModal ?? ""]?.deals},
    {id:"pinzas",title:"Seguimiento con pinzas",note:"Revisar las cuentas marcadas para seguimiento especial.",deals:report.drilldowns[track?.allModal ?? ""]?.deals},
  ].flatMap(row => {
    const deals = [...new Map((row.deals ?? []).map(deal => [deal.id, deal])).values()];
    return deals.length ? [{...row,deals}] : [];
  });

  // Lista de comerciales recortada al rol elegido (AE o KAM) para el selector.
  const ownerOptions = (
    Object.entries(report.periods.owners) as [string, string][]
  ).filter(([id]) => role === "all" || roleOfOwner(id) === role);

  const createdDelta = !funnelTop.comparisonFuture && funnelTop.previousCreatedCount
    ? ((funnelTop.created.length - funnelTop.previousCreatedCount) / funnelTop.previousCreatedCount) * 100
    : null;
  const openGenerationList = (title: string, subtitle: string, deals: DealDTO[]) => setPeriodPayload({ title, subtitle, deals, presentation: "stage-entry" });
  const generationSourceRole = ownerFilter === "team" ? role : roleOfOwner(ownerFilter) ?? role;
  const generationSourceChips = (deals: DealDTO[], title: string): MetricChip[] => generationSourceRows(deals, generationSourceRole).map(row => ({
    label: row.label,
    value: String(row.deals.length),
    onClick: () => openGenerationList(`${title} · ${row.label} · ${rangeLabel}`, "Fuente de creación del deal · misma entrada a etapa y filtros de la tarjeta. SDR incluye prospección y formulario inbound de Adereso.", row.deals),
  }));
  const mainRisk = [...scopedAlerts].sort((a, b) => b.amount - a.amount)[0];
  const openRisk = () => {
    if (!mainRisk) return;
    const ids = new Set(scopedAlerts.filter((a) => a.reason === mainRisk.reason).map((a) => a.id));
    const deals = (report.stageJourneys ?? []).map((j) => j.deal).filter((d) => ids.has(d.id));
    openList(`Riesgo · ${mainRisk.reason}`, `${deals.length} deals afectados`, deals);
  };

  return (
    <main className="pulse-main">
      {tabs ? <div className="dashboard-tabs-wrap">{tabs}</div> : null}

      <CompactFilterBar
        years={report.periods.years}
        quarters={quarters}
        owners={ownerOptions}
        year={year}
        quarter={quarter}
        ownerId={ownerFilter}
        stages={stageFilter}
        showStages={false}
        onYear={(item) => {
          setYear(item);
          if (quarter !== "all" && !["1", "2", "3", "4"].includes(quarter)) setQuarter("all");
        }}
        onQuarter={setQuarter}
        onOwner={setOwnerFilter}
        onStages={setStageFilter}
        role={role}
        onRole={handleRole}
        dealType={dealType}
        onDealType={setDealType}
        ago={ago}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        label="Filtros del pipeline comercial"
        actions={<NotificationCenter scope={{owner:ownerFilter,role,type:dealType,stages:stageFilter}} groups={operationalTasks} onReview={(group) => {
          const reason = group.reasons.length ? group.reasons.map(r => `${r.label}: ${r.deals.length}`).join(" · ") : group.description;
          openList(group.title, reason + " · foto actual, sin filtro de período", group.deals, undefined, group.id === "overdue" ? { key: "closeDate", dir: "asc" } : undefined);
        }} generatedAt={report.generatedAt}/>}
      />

      {projectsOnly ? (
        <>
          {deliveryScope ? (
            <Delivery
              scope={deliveryScope}
              rangeLabel={rangeLabel}
              selectedPeriods={selectedPeriods}
              onModal={setModalKey}
            />
          ) : null}

          {rampDevScope ? (
            <TimeToService
              scope={rampDevScope}
              rangeLabel={rangeLabel}
              selectedPeriods={selectedPeriods}
              yearPeriods={yearPeriods}
              onModal={setModalKey}
              title="De propuesta firmada a proyecto en desarrollo"
              note={`${ownerName} · etapa 6 → 6.2`}
              fromLabel="etapa 6"
              toLabel="etapa 6.2"
              thresholds={[15, 30]}
            />
          ) : null}

          {planBotScope ? (
            <PlanBotWon
              scope={planBotScope}
              rangeLabel={rangeLabel}
              selectedPeriods={selectedPeriods}
              yearPeriods={yearPeriods}
              onModal={setModalKey}
            />
          ) : null}
        </>
      ) : section === "embudo" ? (
        <>
          <SectionTitle>{`Generación de pipeline · escenarios · ${ownerName} · ${rangeLabel}`}</SectionTitle>
          <PipelineFunnel
            report={report}
            ownerFilter={ownerFilter}
            ownerName={ownerName}
            rangeLabel={rangeLabel}
            periodData={periodData ?? null}
            quota={periodQuota}
            onDrill={setPeriodPayload}
            onModal={setModalKey}
          />
        </>
      ) : (
        <>
      {headerMrr ? (
        <section className="adereso-global-metrics" hidden={section !== "general"} aria-label="Métricas generales Adereso">
          <SectionTitle compact>Métricas generales Adereso</SectionTitle>
          <ActiveMrrCard data={headerMrr} year={year} quarter={quarter} snapshotKey={report.generatedAt} />
        </section>
      ) : null}

      {section === "general" ? <>
      {/* ===================== RESUMEN EJECUTIVO ===================== */}
      <SectionTitle compact>
        {`Resumen ejecutivo · ${ownerName} · ${executiveRange} / histórico`}
      </SectionTitle>

      <section className="executive-story" aria-label="Lectura ejecutiva">
        <div className="exec-pipeline-column">
        <div className="exec-generation"
          role="button"
          tabIndex={0}
          data-clickable
          title="Ver deals creados · primero los que faltan por activar"
          onClick={() =>
            openList(
              `Deals creados · ${executiveRange}`,
              "Deals con fecha de creación en el período · se muestran primero los que faltan por activar",
              executive.generation.created,
              executive.generation.notActivatedIds,
            )
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openList(
                `Deals creados · ${executiveRange}`,
                "Deals con fecha de creación en el período · se muestran primero los que faltan por activar",
                executive.generation.created,
                executive.generation.notActivatedIds,
              );
            }
          }}
        >
          <span>Generación · {executiveRange} · {ownerName}</span>
          <strong>{executive.generation.created.length} creados · {executive.generation.activationPct == null ? "activación s/d" : `${executive.generation.activationPct}% activados`}</strong>
          <small title={executive.generation.createdDelta == null ? undefined : `Comparado con el período anterior${executive.generation.comparisonPartial ? " con el mismo tiempo transcurrido" : ""}`}>{executive.generation.createdDelta == null ? "sin período comparable" : `${executive.generation.createdDelta >= 0 ? "▲" : "▼"} ${Math.abs(executive.generation.createdDelta).toFixed(0)}% vs. período anterior${executive.generation.comparisonPartial ? " · parcial" : ""}`}</small>
          <span className="exec-sub-label">Pipeline activo · hoy</span>
          {openPipe.total ? (
            <div className="won-bar pipe-bar" role="group" aria-label="Pipeline abierto por etapa">
              {openPipe.stages.filter((st) => st.deals.length).map((st, i) => (
                <button key={st.key} type="button" data-shade={[0, 3, 1, 4, 2][i] ?? i} style={{ flexGrow: st.deals.length }}
                  title={`${st.key}: ${st.deals.length} deals hoy${st.hint ? ` · ${st.hint}` : ""}`}
                  onClick={(e) => { e.stopPropagation(); openList(`Pipeline abierto · ${st.key}`, st.hint ? `Deals que hoy ${st.hint} · sin filtro de fecha` : "Deals que hoy están en esta etapa · sin filtro de fecha", st.deals); }}>
                  {(st.key === "Sin activar" || st.key === "E4") && <WarnMark />}
                  {st.deals.length}
                </button>
              ))}
            </div>
          ) : null}
          <small className="ex-chips">
            {openPipe.stages.filter((st) => st.deals.length).map((st, i) => (
              <i key={st.key} data-shade={[0, 3, 1, 4, 2][i] ?? i} title={st.hint || undefined}>{st.key}</i>
            ))}
            {openPipe.aged.length ? (
              <button type="button" className="ex-chip" data-tone="warn"
                title="Deals activados, aún abiertos, creados hace más de 60 días"
                onClick={(e) => { e.stopPropagation(); openList("Activados +60 días", "Deals abiertos creados hace más de 60 días · revisar si siguen vivos", openPipe.aged); }}>
                +60 días {openPipe.aged.length}
              </button>
            ) : null}
          </small>
        </div>
        </div>
        <div className="exec-won-column">
        <div className="exec-won">
          <span>Ganados → servicio</span>
          <strong>
            <button type="button" className="ex-link" onClick={() => openList(`Ganados en servicio · E8 · histórico`, "Todos los negocios con servicio iniciado (E8), incluidos los de monto cero · filtros del informe · sin filtro de fecha", wonJourney.service, undefined, { key: "closeDate", dir: "desc" })}>
              {wonJourney.service.length} en servicio
            </button>
            {" · "}
            <button type="button" className="ex-link ex-warn" onClick={() => openList(`Ganados por iniciar servicio · histórico`, "Ganados históricos con monto > $0 en E6, E6.1 o E6.2", wonJourney.pending)}>
              {wonJourney.pending.length} por iniciar
            </button>
          </strong>
          <small>Foto actual · sin filtro de fecha</small>
          <span className="exec-sub-label">Por iniciar → en servicio</span>
          {wonJourney.total ? (
            <div className="won-bar exec-service-bar" role="group" aria-label="Ganados por etapa actual">
              {wonJourney.stages.filter((st) => st.deals.length).map((st) => (
                <button key={st.key} type="button" data-tone={st.tone} data-service={st.key === "e8"} style={{ flexGrow: st.key === "e8" ? 0 : st.deals.length }}
                  title={`${st.label}: ${st.deals.length} · ${st.hint}`}
                  onClick={() => openList(`Ganados · ${st.label} · histórico`, st.key === "e8" ? "Todos los negocios con servicio iniciado (E8), incluidos los de monto cero · filtros del informe · sin filtro de fecha" : `Ganados históricos con monto > $0 · ${st.hint}`, st.deals, undefined, st.key === "e8" ? { key: "closeDate", dir: "desc" } : undefined)}>
                  {st.key === "e61" && <WarnMark label="Warning E6.1" />}
                  {st.deals.length}
                </button>
              ))}
            </div>
          ) : null}
          <small className="ex-chips">
            {wonJourney.total
              ? wonJourney.stages.filter((st) => st.deals.length).map((st) => (
                  <i key={st.key} data-tone={st.tone} title={st.hint}>{st.key === "e8" ? "En servicio" : st.key === "e6" ? "E6 · Sin kick off" : st.key === "e61" ? "E6.1 · Warning" : "E6.2 · Desarrollo"}</i>
                ))
              : "sin ganados históricos con monto"}
          </small>
        </div>
        </div>
        <div className="exec-pipeline-health" data-overdue={openPipe.overdue.length > 0} data-tasks={Boolean(overdueExposure?.tasks || overdueTasks.error)}>
          {(() => {
            const yes = executive.onTrack.yes.length;
            const no = executive.onTrack.no.length;
            const total = yes + no;
            const C = 2 * Math.PI * 14;
            const yesLen = total ? (yes / total) * C : 0;
            const pct = total ? Math.round(yes / total * 100) : 0;
            return <div className="exec-ontrack exec-health-widget">
              <div>
                <span>On track</span>
                <strong>
                  <button type="button" className="ot-yes" onClick={() => openList(`On Track: Sí · ${ownerName}`, "Pipeline activo marcado Sí · foto de hoy, sin filtro de fecha", executive.onTrack.yes)}>Sí {yes}</button>
                  {" · "}
                  <button type="button" className="ot-no" onClick={() => openList(`On Track: No · ${ownerName}`, "Pipeline activo marcado No · foto de hoy, sin filtro de fecha", executive.onTrack.no)}>No {no}</button>
                </strong>
                <small title="MRR on track Sí / MRR on track No">{total ? `${pct}% · ${money(executive.onTrack.yes.reduce((sum, d) => sum + d.amountValue, 0))} / ${money(executive.onTrack.no.reduce((sum, d) => sum + d.amountValue, 0))}` : "sin deals marcados"}</small>
              </div>
              <svg viewBox="0 0 36 36" width="30" height="30" aria-hidden="true">
                <circle cx="18" cy="18" r="14" fill="none" className="ot-ring-no" strokeWidth="5" />
                {yesLen > 0 && <circle cx="18" cy="18" r="14" fill="none" className="ot-ring-yes" strokeWidth="5" strokeDasharray={`${yesLen} ${C}`} transform="rotate(-90 18 18)" />}
              </svg>
            </div>;
          })()}
          {openPipe.overdue.length > 0 && <button type="button" className="exec-health-widget exec-overdue"
            title="Deals del pipeline activo con fecha de cierre anterior a hoy. Ver los más antiguos primero."
            onClick={() => openList(`Cierres vencidos · ${ownerName}`, "Pipeline activo · fecha de cierre anterior a hoy · sin filtro de período · más antiguos primero", openPipe.overdue, undefined, { key: "closeDate", dir: "asc" })}>
            <span>Cierres vencidos</span>
            <strong>{openPipe.overdue.length}<ArrowUpRight aria-hidden="true" /></strong>
            <small>{money(openPipe.overdue.reduce((sum, d) => sum + d.amountValue, 0))} MRR · revisar fechas</small>
          </button>}
          <OverdueTasks controller={overdueTasks} />
                <div className="exec-won exec-contract-widget exec-health-widget">
          <span>Contratos por firmar</span>
          <strong>
            <button type="button" className="ex-link ex-warn" onClick={() => openList(`Contratos por firmar · ${ownerName} · histórico`, "Ganados del pipeline comercial Adereso con monto > $0 y contrato no firmado · sin filtro de fecha", wonJourney.contracts)}>
              {wonJourney.contracts.length} pendientes
            </button>
            {wonJourney.historicTotal ? <em className="ex-muted"> de {wonJourney.historicTotal} ganados · histórico</em> : null}
          </strong>
          <small className="ex-chips">
            {([["Sin iniciar", wonJourney.cBlank], ["Borrador listo", wonJourney.cDraft], ["Enviado al cliente", wonJourney.cSent]] as const)
              .filter(([, d]) => d.length)
              .map(([label, d]) => (
                <button key={label} type="button" className="ex-chip" onClick={() => openList(`Contratos · ${label} · ${ownerName} · histórico`, "Ganados del pipeline comercial Adereso con monto > $0 · sin filtro de fecha", [...d])}>
                  {label} {d.length}
                </button>
              ))}
            {!wonJourney.contracts.length ? "todos los contratos firmados" : null}
          </small>
        </div>
        </div>
      </section>

      <div className="story-divider">
        <div><strong>Resultados del período</strong></div>
        <div className="results-date-controls">
          <span>{rangeLabel}</span>
          <div className="service-period-toggle" role="group" aria-label="Fecha para resultados del período">
            <button type="button" aria-pressed={resultDateBasis === "close"} onClick={() => {closeModal();setResultDateBasis("close");}}>Fecha de cierre</button>
            <button type="button" aria-pressed={resultDateBasis === "stage6"} title="Solo entradas registradas a E6 dentro del año y trimestre seleccionados; sin usar la fecha de cierre como reemplazo." onClick={() => {closeModal();setResultDateBasis("stage6");}}>Entrada a ganado · E6</button>
          </div>
        </div>
      </div>

      {/* Fila 1 — Cuota / Ganado (héroe) / Falta */}
      <section className="grid-hero commercial-results">
        <Metric
          label={`Cuota · ${rangeLabel}`}
          value={money(periodQuota)}
          note={`${isTeam ? "suma de cuotas del equipo" : `cuota de ${ownerName}`}${pace ? ` · ${pace.state} del ritmo lineal` : ""}`}
          chips={pace ? [{label:"Ritmo Q",value:`${pace.state} · ${pace.achieved.toFixed(1)}% / ${pace.expected.toFixed(1)}% esperado`,tone:pace.state==="Bajo"?"warn":"ok"}] : []}
          tooltip={`Meta de MRR del período seleccionado. ${pace ? `Ritmo lineal con ${pace.elapsed}/${pace.days} días calendario, incluyendo hoy. Real ${pace.achieved.toFixed(1)}% vs. esperado ${pace.expected.toFixed(1)}%. En línea: coinciden al redondear a un decimal. No es forecast.` : "Selecciona un trimestre con cuota para ver el ritmo."}`}
        />
        <Metric
          hero
          label={`Ganado ${rangeLabel} / cuota`}
          value={money(periodWonAmount + periodOtfWon / 12)}
          note={
            periodOtfWon > 0
              ? `${periodWonCount} deals · ${money(periodWonAmount)} MRR + ${money(
                  periodOtfWon / 12,
                )} OTF/12`
              : `${periodWonCount} deals · ${money(periodWonAmount)} MRR`
          }
          tone={wonAttainmentTone}
          progress={periodQuotaPct}
          progressLabel={periodQuota > 0 ? `${Math.round(totalAttainmentPct)}%` : "SIN CUOTA"}
          progressBonus={otfBonusPct}
          onClick={openQuotaWon}
          tooltip={`${resultsDateLabel}. Solo ganados elegibles: excluye renovaciones, contracciones y billeteras puras (se ven en «Fuera de la cuota»). Cumplimiento = MRR ganado del periodo + el OTF (pago único) ganado dividido en 12 meses. La barra clara es el MRR y el tramo rayado es el bonus OTF/12; la marca vertical es el 100% de la cuota.`}
          chipLayout="won"
          chips={["E6 POR MOVER", "E6.1 WARNING", "6.2 EN DESARROLLO", "PEND. Q ANT."].flatMap(label => wonChips.filter(chip => chip.label === label))}
          chipAddon={<CommissionRate chipLabel="FACTOR COM." attainment={selectedPeriods.length === 1 && periodQuota > 0 ? totalAttainmentPct : null} scope={ownerFilter} />}
        />
        <Metric
          label="Falta para la cuota"
          value={money(periodGap)}
          note={periodGap ? undefined : "cuota cumplida"}
          tone={periodGap ? "warn" : "ok"}
          onClick={() => openGapDeals()}
          footer={<div className="quota-close-preview" aria-label="Previsualización de cierres por mes del trimestre actual">
            <span className="quota-close-preview-label">PIPELINE Q{gapMonthSummary.quarter} {gapMonthSummary.year} (MRR)</span>
            <div className="quota-close-preview-months">{gapMonths.map(month => <button type="button" className="quota-close-month" key={month.key} aria-label={`Ver deals con cierre en ${month.label} ${gapMonthSummary.year}`} onClick={event => { event.stopPropagation(); openGapDeals(month.key); }}>
              <span>{month.label}</span><strong>{money(month.amount)}</strong><small>{month.count} deals</small>
            </button>)}</div>
            <div className="quota-close-total-row">
              <button type="button" className="quota-close-total" aria-label={`Ver todos los deals con cierre en Q${gapMonthSummary.quarter} ${gapMonthSummary.year}`} onClick={event => { event.stopPropagation(); openGapDeals("quarter"); }}><span>TOTAL Q</span><strong>{money(gapMonthSummary.total.amount)}</strong></button>
              <span className="quota-pipeline-coverage" title={gapCoverageInfo} aria-label={`Cobertura ponderada del pipeline: ${gapCoverageValue}`}><span>COB. POND.</span><strong>{gapCoverageValue}</strong></span>
            </div>
            <small className="quota-close-preview-hint">{gapMonthSummary.total.count} deals · total MRR sin ponderar</small>
          </div>}
          tooltip="Cuota del período menos MRR ganado y OTF/12. Selecciona negocios abiertos para ver su aporte al cumplimiento del período seleccionado."
        />
      </section>

      <nav className="overview-deep-links" aria-label="Profundizar en el informe">
        <span>Explorar en detalle</span>
        {PULSE_FOCUS_PAGES.filter(page=>page.id!=="scenarios").map(page => <button key={page.id} type="button" onClick={() => { onNavigate?.(page.id); window.scrollTo({ top: 0, behavior: 'instant' }); }}>
          <strong>{page.title}</strong><small>{page.description}</small><ArrowUpRight aria-hidden="true" />
        </button>)}
      </nav>
      </> : <header className="pulse-focus-heading" data-section-head>
        <div><h2 className="pulse-h2" tabIndex={-1}>{PULSE_FOCUS_PAGES.find(page => page.id === section)?.title}</h2>
          <p>{PULSE_FOCUS_PAGES.find(page => page.id === section)?.description} <span>{ownerName} · {rangeLabel}</span></p>
        </div><CopySectionButton />
      </header>}

      {section !== "general" && <div className="pulse-focused-content"><FoldList key={section} storageKey={`pulse-fold-order-${section}-v2`}>
      {section === "scenarios" && <QuotaScenarios report={report} owner={ownerFilter} role={role} />}
      {section === "conversion" && <>
      <Fold defaultOpen title="WR (Win Rate)" subtitle={`Conversión, ticket promedio y pérdidas · ${rangeLabel}`}>
      {/* Fila 3 — Win rate / Ticket prom / Perdido */}
      <section className="grid-3" style={{ marginTop: 16 }}>
        <Metric
          label="Win rate (cantidad)"
          value={(() => {
            const total = periodWr.won + periodWr.lost;
            return total ? `${Math.round((periodWr.won / total) * 100)}%` : "s/n";
          })()}
          valueSuffix={(() => {
            const total = periodWr.won + periodWr.lost;
            return total ? `(${periodWr.won}/${total})` : "";
          })()}
          valueChip={{
            label: "$$$",
            value:
              periodAllWonAmount + periodLostAmount
                ? `${Math.round((periodAllWonAmount / (periodAllWonAmount + periodLostAmount)) * 100)}%`
                : "s/n",
            tone: (() => {
              const total = periodAllWonAmount + periodLostAmount;
              if (!total) return "neutral" as Tone;
              const pct = (periodAllWonAmount / total) * 100;
              return (pct >= 50 ? "ok" : pct >= 30 ? "warn" : "bad") as Tone;
            })(),
          }}
          note={`${periodWr.won} ganados · ${periodWr.lost} perdidos · en $$$ ${
            periodAllWonAmount + periodLostAmount
              ? `${money(periodAllWonAmount)} / ${money(periodAllWonAmount + periodLostAmount)}`
              : "s/n"
          }`}
          tone={
            periodWr.won + periodWr.lost
              ? periodWr.won / (periodWr.won + periodWr.lost) >= 0.5
                ? "ok"
                : "warn"
              : "neutral"
          }
          onClick={() => openPeriods(isTeam ? null : ownerFilter, "won")}
          tooltip="Win rate por cantidad: ganados / (ganados + perdidos), considerando solo deals con monto mayor a $0. El chip $$$ muestra el win rate en dinero: MRR ganado / (MRR ganado + MRR perdido) del mismo periodo. Los demás chips desagregan el WR por segmento según el rol."
          {...(wrTrend?.length ? { trend: wrTrend, trendLabels: monthly.months } : {})}
          reference={historicalWr}
          chips={[...wrSegmentChips,{label:"WR histórico",value:historicalWr==null?"Sin cerrados":`${historicalWr.toFixed(1)}% · ${historicalUnique.length} cerrados` }]}
        />
        <Metric
          label="Ticket promedio ganado"
          value={money(periodWonPositive ? periodAllWonAmount / periodWonPositive : 0)}
          note={periodWonPositive ? `${periodWonPositive} deals con monto > $0${periodAllWonCount > periodWonPositive ? ` · ${periodAllWonCount - periodWonPositive} en $0 excluidos` : ""}` : "sin deals ganados con monto"}
          onClick={() => openPeriods(isTeam ? null : ownerFilter, "won")}
          tooltip="MRR ganado promedio por deal ganado con monto mayor a $0 en el periodo seleccionado."
          {...(ticketTrend?.length ? { trend: ticketTrend, trendLabels: monthly.months } : {})}
        />
        <Metric
          label="Perdido"
          value={money(periodLostAmount)}
          note={`${periodLostCount} deals`}
          tone={periodLostCount ? "warn" : "neutral"}
          onClick={() => openPeriods(isTeam ? null : ownerFilter, "lost")}
          tooltip="MRR de deals perdidos (closed lost) con fecha de cierre dentro del periodo seleccionado."
          {...(lostTrend?.length ? { trend: lostTrend, trendLabels: monthly.months } : {})}
        />
      </section>
      </Fold>
      </>}
      {section === "pipeline" && <>
      <Fold defaultOpen title="Generación y gestión del pipeline" subtitle={`Creación, valorización, activación y pérdidas · ${rangeLabel}`}>
      <div className="pipeline-history-access"><span>Por fecha de entrada a etapa · período y filtros principales</span><PipelineHistory journeys={(report.stageJourneys ?? []).filter(row => (ownerFilter === 'team' || row.deal.ownerId === ownerFilter) && matchesType(row.deal))} scopeLabel={`${isTeam ? 'Equipo' : ownerRow?.name ?? 'Comercial seleccionado'} · ${role === 'all' ? 'Todos los roles' : role} · ${dealType === 'all' ? 'Todos los tipos' : dealType}`}  /></div>
      <section className="grid-4 generation-entry-cards" style={{ marginTop: 16 }}>
        <Metric
          label={`Deals ingresados · E0/E1 · ${rangeLabel}`}
          value={String(funnelTop.created.length)}
          trend={funnelTop.createdTrend}
          trendLabels={funnelTop.createdTrendLabels}
          note={`${money(funnelTop.createdAmount)} ingresados en el período`}
          chips={[
            ...generationSourceChips(funnelTop.created, "Deals ingresados · E0/E1"),
            {
              label: funnelTop.comparisonPartial ? "vs. previo · parcial" : isAllYear ? "YoY" : "vs. previo",
              value: createdDelta == null ? "s/n" : `${createdDelta >= 0 ? "▲" : "▼"} ${Math.abs(createdDelta).toFixed(0)}%`,
              tone: createdDelta == null ? "neutral" : createdDelta >= 0 ? "ok" : "bad",
            },
          ]}
          onClick={() => openGenerationList(`Deals ingresados · E0/E1 · ${rangeLabel}`, "Primera entrada registrada a E0 o E1 dentro del período, sin usar creación ni cierre", funnelTop.created)}
          tooltip="Cuenta cada deal una vez por su primera entrada registrada a E0 o E1. La creación y el cierre no sustituyen fechas faltantes. Tendencia y comparación usan la misma fecha de entrada; el período abierto compara el mismo tiempo transcurrido. Chips por fuente de creación del deal."
        />
        <Metric
          label="Deals valorizados"
          value={String(funnelTop.valued.length)}
          note={`${money(funnelTop.valuedAmount)} · entraron a E4 con monto > $0`}
          onClick={() => openGenerationList(`Deals valorizados · ${rangeLabel}`, "Deals que entraron a E4 en el período con monto mayor a $0", funnelTop.valued)}
          tooltip="Deals que entraron a E4 (valorización) dentro del período seleccionado y tienen monto mayor a $0, sin importar en qué trimestre se crearon."
          chips={[
            ...generationSourceChips(funnelTop.valued, "Deals valorizados · E4"),
            {
              label: "En E2 hoy",
              value: String(funnelTop.pendingValNow.length),
              ...(funnelTop.pendingValNow.length ? { tone: "warn" as const } : {}),
              onClick: () => openGenerationList(`Por valorizar · en E2 · ${rangeLabel}`, "Deals abiertos que siguen en etapa 2, sin importar cuándo se crearon", funnelTop.pendingValNow),
            },
            {
              label: "Pendientes del período",
              value: String(funnelTop.pendingValPeriod.length),
              ...(funnelTop.pendingValPeriod.length ? { tone: "warn" as const } : {}),
              onClick: () => openGenerationList(`Pendientes de valorizar · ${rangeLabel}`, "Deals ingresados a E0/E1 en el período que todavía no entran a E4", funnelTop.pendingValPeriod),
            },
          ]}
        />
        <Metric
          label={generationSourceRole === "KAM" ? "Activados · E0→E1" : "Activados · E1"}
          value={String(funnelTop.e0ToE1.length)}
          note="Entrada registrada a E1 en el período"
          chips={generationSourceChips(funnelTop.e0ToE1, "Deals activados · E1")}
          onClick={() => openGenerationList(`Activados · E1 · ${rangeLabel}`, "Entrada a E1 dentro del período; para KAM, con paso anterior registrado por E0", funnelTop.e0ToE1)}
          tooltip="Deals con entrada registrada a E1 en el período, aunque hayan ingresado al pipeline antes. Para KAM exige E0 anterior o simultáneo. No se infiere activación por la etapa actual. Cada tarjeta mide eventos distintos: no se divide este total por las entradas del período. Chips por fuente de creación."
        />
        <Metric
          label="Perdidos tras activarse"
          value={String(funnelTop.lostAfterActivation.length)}
          note="entraron a perdido en el período"
          tone={funnelTop.lostAfterActivation.length ? "warn" : "ok"}
          chips={[
            ...generationSourceChips(funnelTop.lostAfterActivation, "Perdidos tras activarse"),
            {
              label: "Desde E1",
              value: String(funnelTop.lostFromE1.length),
              tone: funnelTop.lostFromE1.length ? "warn" : "neutral",
              onClick: () => openGenerationList(`Perdidos desde E1 · ${rangeLabel}`, "Deals que entraron a perdido en el período estando en E1", funnelTop.lostFromE1),
            },
          ]}
          onClick={() => openGenerationList(`Perdidos tras activarse · ${rangeLabel}`, "Deals activados que entraron a perdido dentro del período", funnelTop.lostAfterActivation)}
          tooltip="Deals con entrada registrada a perdido en el período y entrada previa o simultánea a E1; KAM requiere E0→E1. Sin sustituir fechas por cierre ni exigir que sigan perdidos hoy. «Desde E1» no registra etapas posteriores antes de perderse. Chips por fuente de creación; sin porcentaje entre cohortes distintas."
        />
      </section>
      <StageVelocity
        journeys={report.stageJourneys ?? []}
        ownerId={ownerFilter}
        dealType={dealType}
        selectedPeriods={selectedPeriods}
        quarter={quarter}
      />
      </Fold>
      </>}
      {section === "forecast" && <>
      <section className="forecast-today" aria-labelledby="forecast-today-title">
        <header><div><h3 id="forecast-today-title">Resolver hoy</h3><p>Situación actual · empieza por lo que requiere revisión.</p></div><span className="forecast-time-chip">Hoy</span></header>
        <div className="forecast-action-list">
          {["overdue", "warning", "lost-candidate", "off-track", "kickoff", "drafts", "signature"].flatMap(id => operationalTasks.filter(group => group.id === id)).map((group, index) => {
            const titles: Record<string, string> = { overdue: "Corregir fechas vencidas", warning: "Resolver warnings", "lost-candidate": "Revisar candidatos a perdido", "off-track": "Contactar deals On Track No", kickoff: "Empujar kick off", drafts: "Enviar borradores de contrato", signature: "Conseguir firmas" };
            const reason = group.reasons.length ? group.reasons.map(item => `${item.label}: ${item.deals.length}`).join(" · ") : group.description;
            return <button type="button" className="forecast-action-row" data-kind={group.id} key={group.id} onClick={() => openList(titles[group.id] ?? group.title, reason + " · foto actual, sin filtro de período", group.deals, undefined, group.id === "overdue" ? { key: "closeDate", dir: "asc" } : undefined)}>
              <span className="forecast-action-order">{index + 1}</span>
              <span className="forecast-action-text"><strong>{titles[group.id] ?? group.title}</strong><small>{reason}</small></span>
              <span className="forecast-action-count">{group.deals.length}<small>{group.deals.length === 1 ? "deal" : "deals"}</small></span>
              <span className="forecast-action-amount">{money(group.deals.reduce((sum, deal) => sum + deal.amountValue, 0))}<small>MRR</small></span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>;
          })}
          {!operationalTasks.length ? <p className="forecast-clear-state">Sin pendientes en estos grupos para el alcance seleccionado.</p> : null}
        </div>
        {((taskData && (taskData.todayTaskCount > 0 || taskData.noActivityCount > 0)) || overdueExposure?.tasks || overdueTasks.error) ? <div className="forecast-task-shortcuts" aria-label="Agenda y tareas registradas">
          <span>Tu agenda</span>
          <OverdueTasks controller={overdueTasks} compact />
          {taskData && taskData.todayTaskCount > 0 ? <button type="button" onClick={() => setModalKey(taskData.todayTaskModal)}>Tareas para hoy <b>{taskData.todayTaskCount} deals</b><small>{modalExposure(taskData.todayTaskModal)}</small></button> : null}
          {taskData && taskData.noActivityCount > 0 ? <button type="button" onClick={() => setModalKey(taskData.noActivityModal)}>Sin próxima actividad <b>{taskData.noActivityCount} deals</b><small>{modalExposure(taskData.noActivityModal)}</small></button> : null}
        </div> : null}
        <p className="forecast-scope-note">Un deal puede necesitar más de una acción; los grupos no se suman.</p>
      </section>
      {forecastSignals.length ? <section className="forecast-signals" aria-labelledby="forecast-signals-title">
        <header><div><h3 id="forecast-signals-title">Señales para revisar</h3><p>Gestión reciente, estancamiento y fechas por completar.</p></div></header>
        <div className="forecast-signal-list">
          {forecastSignals.map(signal => <button type="button" key={signal.id} onClick={() => openList(signal.title, signal.note + (signal.id === "high-probability" ? " · período y filtros del informe" : " · foto actual, sin filtro de período"), signal.deals)}>
            <span><strong>{signal.title}</strong><small>{signal.note}</small></span>
            <span className="forecast-signal-count">{signal.deals.length}<small>{signal.deals.length === 1 ? "deal" : "deals"}</small></span>
            <span className="forecast-signal-value">{exposureLabel(signal.deals)}</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>)}
        </div>
      </section> : null}

      {/* ===================== TABLA UNIFICADA POR COMERCIAL ===================== */}
      </>}
      {section === "conversion" && <>
      <Fold title="Detalle por comercial" subtitle="Hoy / Q en curso · todos los tipos de deal">
      <div className="tabs" style={{ margin: "0 0 16px", justifyContent: "flex-end" }}>
        <button className="tab" type="button" data-active={dense} onClick={() => setDense(true)}>
          Compacto
        </button>
        <button className="tab" type="button" data-active={!dense} onClick={() => setDense(false)}>
          Completo
        </button>
      </div>
      <div className="table-wrap">
        <table className="pulse-table" data-dense={dense ? "true" : "false"}>
          <thead>
            <tr>
              <th>Comercial</th>
              <Th help="Semáforo de riesgo: compara el pipeline ponderado del Q contra lo que falta para la cuota.">Estado</Th>
              <Th help="Meta de MRR del trimestre según los goal targets de HubSpot.">Cuota Q</Th>
              <Th help="MRR de deals ganados con fecha de cierre dentro del trimestre. La mini barra muestra la evolución trimestre a trimestre.">MRR ganado Q</Th>
              {!dense ? (
                <>
                  <Th help="Cantidad de deals ganados en el trimestre. Clic para verlos.">Deals g.</Th>
                  <Th help="Cantidad de deals perdidos en el trimestre. Clic para verlos.">Perdidos</Th>
                  <Th help="MRR de deals perdidos en el trimestre.">Monto perd.</Th>
                </>
              ) : null}
              <Th help="Win rate del trimestre en curso (ganados / (ganados + perdidos)) y su variación vs el trimestre anterior.">WR QTD + QoQ</Th>
              {!dense ? (
                <Th help="Win rate histórico: ganados / (ganados + perdidos) desde el primer periodo registrado.">WR Hist.</Th>
              ) : null}
              <Th help="WR por segmento del Q según el rol: AE (Holly, Gonza, Gio) muestra Inbound vs Outbound; KAM (Felipe, Naty) muestra Upsell vs Cross sell.">WR por segmento</Th>
              {!dense ? (
                <Th help="OTF (pago único) de los deals ganados del Q. El chip muestra ese OTF dividido en 12 meses: ese monto mensual suma a la cuota.">OTF Q</Th>
              ) : null}
              <Th help="MRR real del Q más el bonus OTF/12. Es el número que se compara contra la cuota.">MRR c/OTF</Th>
              <Th help="Cuota menos el MRR del Q con OTF. Es exactamente cuánto falta cerrar para llegar a la meta.">Falta</Th>
              <Th help="Porcentaje de la cuota logrado. La barra clara muestra solo MRR; el tramo destacado es el aporte del bonus OTF/12.">Cumpl.</Th>
              <Th help="Pronóstico del trimestre: suma del pipeline abierto con cierre en el Q multiplicado por la probabilidad de su etapa.">Forecast Q</Th>
              <Th help="Monto total de deals abiertos (foto actual). Clic para verlos.">Pipeline</Th>
              {!dense ? (
                <>
                  <Th help="Deals abiertos en el pipeline (foto actual).">Abiertos</Th>
                  <Th help="Pipeline abierto del Q ponderado por probabilidad de etapa.">Pond Q</Th>
                  <Th help="Probabilidad promedio de cierre de los deals abiertos.">% cierre</Th>
                  <Th help="Adobo score promedio de los deals abiertos con score registrado.">Adobo</Th>
                  <Th help="Deals con close date en los próximos 7 días.">7d</Th>
                  <Th help="Deals con close date dentro del mes en curso.">Mes</Th>
                  <Th help="Deals con close date vencida (fecha pasada sin cerrar).">Venc.</Th>
                  <Th help="Deals sin close date registrada.">S/fecha</Th>
                  <Th help="Deals sin próxima actividad agendada.">S/prox</Th>
                  <Th help="Deals estancados más de 14 días sin actividad.">14+d</Th>
                </>
              ) : null}
              <Th help="Abre el Simulador de Estrategia filtrado por este comercial.">↗</Th>
            </tr>
          </thead>
          <tbody>
            {(isTeam ? report.quotaRows : report.quotaRows.filter((r) => r.id === ownerFilter)).map((row) => {
              const ownerRowData = report.ownerRows.find((o) => o.id === row.id);
              const mrrWithOtf = row.wonQAmount + row.otfBonus;
              const missing = Math.max(0, row.quota - mrrWithOtf);
              const isAE = row.role ? row.role === "AE" : ["82596016", "331766554", "373167468"].includes(row.id);
              const seg = row.wrBySegment ?? {
                inbound: { won: 0, lost: 0 },
                outbound: { won: 0, lost: 0 },
                upsell: { won: 0, lost: 0 },
                crossSell: { won: 0, lost: 0 },
              };
              const segA = { label: isAE ? "Inb" : "Up", stats: (isAE ? seg.inbound : seg.upsell) ?? { won: 0, lost: 0 } };
              const segB = { label: isAE ? "Out" : "Cross", stats: (isAE ? seg.outbound : seg.crossSell) ?? { won: 0, lost: 0 } };
              const cell = (value: number, key: string, formatted?: string) =>
                value ? (
                  <button className="cell-button" type="button" onClick={() => setModalKey(key)}>
                    {formatted ?? value}
                  </button>
                ) : (
                  <span style={{ color: "var(--muted)" }}>{formatted ?? 0}</span>
                );
              return (
                <tr key={row.id}>
                  <th>{row.name}</th>
                  <td>
                    <span className="status" data-tone={row.risk}>{row.statusLabel}</span>
                  </td>
                  <td>{money(row.quota)}</td>
                  <td>
                    <div className="trend-cell">
                      <strong>
                        <button className="cell-button" type="button" onClick={() => setModalKey(`owner-${row.id}-won-q`)}>
                          {money(row.wonQAmount)}
                        </button>
                      </strong>
                      <MiniBars
                        data={row.wonTrend}
                        onSelect={(period) => {
                          const full = report.periods.periods.find((p) => shortPeriod(p) === period);
                          if (full) openPeriod(full, row.id, "won");
                        }}
                      />
                    </div>
                  </td>
                  {!dense ? (
                    <>
                      <td>
                        <button className="cell-button" type="button" onClick={() => setModalKey(`owner-${row.id}-won-q`)}>
                          {row.wonQCount}
                        </button>
                      </td>
                      <td>
                        <button className="cell-button" type="button" onClick={() => openPeriod(report.currentPeriod, row.id, "lost")}>
                          {report.periods.data[report.currentPeriod]?.owners[row.id]?.lost ?? 0}
                        </button>
                      </td>
                      <td>{money(report.periods.data[report.currentPeriod]?.owners[row.id]?.lostAmount ?? 0)}</td>
                    </>
                  ) : null}
                  <td>
                    <div className="trend-cell">
                      <strong>{wrText(row.wrQtd)}</strong>
                      <span className="trend-delta">{pp(row.wrQoQ)}</span>
                      <MiniLine data={row.wrTrend} reference={ownerRowData && ownerRowData.wrHist.won+ownerRowData.wrHist.lost>0 ? ownerRowData.wrHist.won/(ownerRowData.wrHist.won+ownerRowData.wrHist.lost)*100 : null}/>
                    </div>
                  </td>
                  {!dense ? <td>{wrText(ownerRowData?.wrHist ?? { won: 0, lost: 0 })}</td> : null}
                  <td>
                    <span className="seg-wr">
                      <span className="otf-chip" title={`${isAE ? "Inbound" : "Upsell"}: ${segA.stats.won} ganados / ${segA.stats.lost} perdidos`}>
                        {segA.label} {wrText(segA.stats)}
                      </span>
                      <span className="otf-chip" title={`${isAE ? "Outbound" : "Cross sell"}: ${segB.stats.won} ganados / ${segB.stats.lost} perdidos`}>
                        {segB.label} {wrText(segB.stats)}
                      </span>
                      <span className="role-tag">{isAE ? "AE" : "KAM"}</span>
                    </span>
                  </td>
                  {!dense ? (
                    <td>
                      {money(row.otfWonQ)}
                      {row.otfBonus > 0 ? (
                        <span className="otf-chip" title="OTF ganado / 12 meses: bonus que suma a la cuota">
                          +{money(row.otfBonus)}/mes
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                  <td><strong>{money(mrrWithOtf)}</strong></td>
                  <td><strong>{missing ? money(missing) : "Cumplida"}</strong></td>
                  <td>
                    {Math.round(row.attainment * 10) / 10}%
                    {row.otfBonus > 0 && row.quota > 0 ? (
                      <span className="otf-chip" title="Cumplimiento incluyendo el bonus OTF/12">
                        {Math.round(row.attainmentBonus * 10) / 10}% c/OTF
                      </span>
                    ) : null}
                    <span className="progress" data-tone={row.risk}>
                      <span style={{ width: `${Math.min(100, Math.max(0, row.attainment))}%` }} />
                      <span
                        className="progress-bonus"
                        style={{
                          left: `${Math.min(100, Math.max(0, row.attainment))}%`,
                          width: `${Math.min(100 - Math.min(100, Math.max(0, row.attainment)), Math.max(0, row.attainmentBonus - row.attainment))}%`,
                        }}
                      />
                    </span>
                  </td>
                  <td>
                    <button className="cell-button" type="button"
                      title="Pipeline abierto del Q ponderado por probabilidad de etapa."
                      onClick={() => setModalKey(`owner-${row.id}-q-open`)}>
                      {money(row.forecast)} ({Math.round(row.forecastPct)}%)
                    </button>
                  </td>
                  <td>{cell(ownerRowData?.openAmount ?? 0, `owner-${row.id}-open`, money(ownerRowData?.openAmount ?? 0))}</td>
                  {!dense ? (
                    <>
                      <td>{cell(ownerRowData?.openCount ?? 0, `owner-${row.id}-open`)}</td>
                      <td>{cell(ownerRowData?.weightedQ ?? 0, `owner-${row.id}-q-open`, money(ownerRowData?.weightedQ ?? 0))}</td>
                      <td>{Math.round((ownerRowData?.avgProbability ?? 0) * 100)}%</td>
                      <td>{Math.round(ownerRowData?.avgScore ?? 0)}%</td>
                      <td>{cell(ownerRowData?.closing7d ?? 0, `owner-${row.id}-closing-7d`)}</td>
                      <td>{cell(ownerRowData?.closingMonth ?? 0, `owner-${row.id}-closing-month`)}</td>
                      <td>{cell(ownerRowData?.overdue ?? 0, `owner-${row.id}-overdue`)}</td>
                      <td>{cell(ownerRowData?.noCloseDate ?? 0, `owner-${row.id}-no-close-date`)}</td>
                      <td>{cell(ownerRowData?.noNextActivity ?? 0, `owner-${row.id}-no-next`)}</td>
                      <td>{cell(ownerRowData?.stale ?? 0, `owner-${row.id}-stale`)}</td>
                    </>
                  ) : null}
                  <td>
                    <button className="sim-link" type="button" title={`Simular escenarios de ${row.name}`}
                      onClick={() => onSimulate?.(row.id)}>
                      <span aria-hidden="true">↗</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </Fold>
      </>}
      </FoldList></div>}





        </>
      )}

      <DealModal
        payload={payload}
        hideCloseSummary={periodPayload?.presentation === "stage-entry"}
        onClose={closeModal}
        initialSummaryDate={modalKey === qOpenModalKey && !periodPayload ? gapInitialMonth : null}
        executiveSummary={periodPayload?.presentation === "won" ? ({ selectedOwner, onOwnerSelect }) => <WonExecutiveSummary
          rangeLabel={rangeLabel}
          attributionDates={useStage6Results ? stage6EntryDates : undefined}
          dateBasisLabel={resultsDateLabel}
          periodWr={periodWr}
          showOwners={isTeam}
          ownerQuotas={ownerQuotaByName ?? {}}
          selectedOwner={selectedOwner}
          onOwnerSelect={onOwnerSelect}
          ownerPeriodWr={Object.fromEntries(Object.entries(closePeriodData?.owners ?? {}).map(([id, stats]) => [report.periods.owners[id] ?? 'Sin comercial', { won: stats.wonDeals.filter(deal => deal.amountValue > 0).length, lost: stats.lostDeals.filter(deal => deal.amountValue > 0).length }]))}
          deals={quotaPeriod.eligible} periods={selectedPeriods}

        /> : undefined}
        fix={
          periodPayload
            ? null
            : modalKey && modalKey === taskData?.noActivityModal
              ? { problem: "Sin próxima actividad agendada", mode: "task" as const }
              : modalKey && modalKey === taskData?.overdueTaskModal
                ? { problem: "Con tareas vencidas sin resolver", mode: "task" as const }
                : modalKey && track && modalKey === track.allModal
                  ? {
                      problem: "Deal marcado con pinzas por Adobo (score bajo o estancado)",
                      mode: "task" as const,
                    }
                  : modalKey && track && modalKey === track.onTrackNoModal
                    ? { problem: "On track = No: el deal requiere seguimiento", mode: "fup" as const }
                    : null
        }

        ownerBreakdown={isTeam && !!periodPayload && periodPayload.title.startsWith("Equipo · ")}
        ownerQuotas={ownerQuotaByName}
        initialStages={stageFilter}
        pipelineTrend={
          modalKey === openModalKey && !periodPayload && pipelineTrend?.length
            ? { labels: monthly.months, values: pipelineTrend }
            : null
        }
        scenarioScope={gapScenario && modalKey===qOpenModalKey && !periodPayload ? {owner:ownerFilter,role,type:dealType,periods:selectedPeriods,basis:useStage6Results?'stage6':'close'} : undefined}
        scenarioReport={report}
        onViewScenarios={()=>{closeModal();onNavigate?.("scenarios");}}
        selectionQuotaForOwner={selectionQuotaForOwner}
        selectionQuota={gapScenario && modalKey === qOpenModalKey && !periodPayload ? selectionQuota : null}
      />
    </main>
  );
}
