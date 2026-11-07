import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { AdoboRiskHygiene } from "./AdoboRiskHygiene";
import { CommissionRate } from "./CommissionRate";
import { quarterPace } from "@/lib/quarter-performance";
import { NotificationCenter } from './NotificationCenter';
import { dashboardTasks } from '@/lib/dashboard-tasks';
import { CopySectionButton } from "./CopyControls";
import { DealModal } from "./DealModal";
import { AdoboIntelligence, useLiveNow } from './AdoboIntelligence';
import { adoboPeriodDeals } from '@/lib/adobo-period';
import { intelligenceDeals } from '@/lib/adobo-intelligence';
import type { RoleFilter as AdoboRole } from '@/lib/owner-roles';
import { verifiedContactAggregate } from '@/lib/contact-aggregate';
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
import { creationComparisonWindow, hasOrderedActivation } from "@/lib/story-metrics";
import { buildExecutiveStrip } from "@/lib/executive-strip";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from '@tanstack/react-query';
import { getAdoboHistory } from '@/lib/pulse.functions';
import { quotaStats, classifyQuotaDeal, pendingFromPreviousQuarters } from '@/lib/quota-eligibility';
import type { PropertyHistoryV1 } from '@/lib/adobo-intelligence';

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

/** Etapas 6.2 en adelante: el monto que realmente se incorpora como ganado. */
const STAGE_62_PLUS = new Set(["1086544542", "213244763", "171385868", "173990327"]);

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
  tooltip,
  trend,
  trendLabels,
  chips,
  chipsTop,
  hero,
  reference,
}: {
  label: string;
  value: string;
  /** sufijo más pequeño junto al valor principal (ej. "(31/188)") */
  valueSuffix?: string;
  /** chip inline junto al valor (ej. vista alterna $$$) */
  valueChip?: { label: string; value: string; tone?: Tone; onClick?: () => void };
  note?: string | undefined;
  tone?: Tone;
  onClick?: () => void;
  progress?: number;
  /** tramo extra de la barra (ej. bonus OTF/12) en puntos porcentuales */
  progressBonus?: number;
  tooltip?: string;
  /** serie sutil (últimos meses); null = sin dato */
  trend?: (number | null)[];
  trendLabels?: string[];
  /** chips sutiles al pie de la tarjeta (ej. WR por segmento) */
  chips?: { label: string; value: string; tone?: Tone; onClick?: () => void }[];
  /** chips en la esquina superior derecha de la tarjeta */
  chipsTop?: { label: string; value: string; tone?: Tone; onClick?: () => void }[];
  /** card héroe: más grande y prominente */
  hero?: boolean;
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
  return (
    <button
      className="metric"
      data-tone={tone}
      data-hero={hero ? "" : undefined}
      data-has-tooltip={tooltip ? "" : undefined}
      type="button"
      onClick={onClick}
    >
      <span className="metric-label">{label}</span>
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
      {note ? <div className="metric-note">{note}</div> : null}
      {typeof progress === "number" && Number.isFinite(progress) ? (
        (() => {
          const base = Math.max(0, progress);
          const bonus = Number.isFinite(progressBonus ?? NaN) ? Math.max(0, progressBonus!) : 0;
          const scale = Math.max(100, base + bonus);
          return (
            <div className="metric-progress" aria-hidden="true">
              <div className="metric-progress-track">
                <div
                  className="metric-progress-fill"
                  data-tone={tone}
                  style={{ width: `${(Math.min(base, scale) / scale) * 100}%` }}
                />
                {bonus > 0 ? (
                  <div
                    className="metric-progress-bonus"
                    data-tone={tone}
                    style={{ width: `${(bonus / scale) * 100}%` }}
                  />
                ) : null}
                <span
                  className="metric-progress-tick"
                  style={{ left: `${(100 / scale) * 100}%` }}
                />
              </div>
            </div>
          );
        })()
      ) : null}
      {chips && chips.length ? (
        <div className="metric-chips">
          {chips.map((chip) => (
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
        </div>
      ) : null}
    </button>
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

/** Higiene: cualquier deal sucio es atención; sobre 10% del pipeline es riesgo. */
const hygieneTone = (count: number, total: number): Tone => {
  if (!count) return "ok";
  const share = total ? (count / total) * 100 : 100;
  return share > 10 ? "bad" : "warn";
};

const shareTone = (share: number): Tone => (share <= 10 ? "ok" : share <= 25 ? "warn" : "bad");

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
export function FoldList({ children }: { children: React.ReactNode }) {
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FOLD_ORDER_KEY) || "[]");
      if (Array.isArray(saved)) setOrder(saved);
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
    localStorage.setItem(FOLD_ORDER_KEY, JSON.stringify(next));
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
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
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

/** Encabezado numerado de un bloque dentro de "Calidad del pipeline". */
function QHead({
  n,
  title,
  subtitle,
  badge,
  actionable = false,
}: {
  n?: string;
  title: string;
  subtitle: string;
  badge: string;
  actionable?: boolean;
}) {
  return (
    <div className="q-head">
      <div className="q-head-text">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <span className="q-head-badge" data-kind={actionable ? "action" : "info"}>
        {badge}
      </span>
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
  section = "general",
  role = "all",
  onRole,
}: {
  report: PulseReport;
  onRefresh: () => void;
  isRefreshing: boolean;
  tabs?: React.ReactNode;
  onSimulate?: (ownerId: string) => void;
  /** "proyectos" y "embudo" muestran solo su tab anidado. */
  section?: "general" | "proyectos" | "embudo";
  /** rol comercial: todos (predeterminado), AE o KAM */
  role?: "all" | "AE" | "KAM";
  onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const projectsOnly = section === "proyectos";
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [periodPayload, setPeriodPayload] = useState<Drilldown | null>(null);
  const [simModal, setSimModal] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
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
    setModalKey(null);
    setPeriodPayload(null);
    setSimModal(false);
  };

  const scope = report.quality.find((item) => item.id === ownerFilter) ?? report.quality.find((item) => item.id === "team") ?? report.quality[0]!;
  const trackRaw =
    report.tracking?.find((item) => item.id === ownerFilter) ?? report.tracking?.find((item) => item.id === "team") ?? report.tracking?.[0] ?? null;
  const track = trackRaw ? { ...trackRaw, deals: trackRaw.deals ?? [] } : null;
  const closeRaw =
    report.closeHygiene?.find((item) => item.id === ownerFilter) ?? report.closeHygiene?.find((item) => item.id === "team") ?? report.closeHygiene?.[0] ?? null;
  const closeData = closeRaw ? { ...closeRaw, deals: closeRaw.deals ?? [] } : null;
  // Persisted snapshots lack the evidence contract: never show their old caps/alerts.
  const tempData = verifiedContactAggregate(report, ownerFilter, role);
  const overdueByOwner = useMemo(() => {
    if (!closeData) return [] as { owner: string; count: number; amount: number }[];
    const deals = report.drilldowns[closeData.overdueModal]?.deals ?? [];
    const map = new Map<string, { owner: string; count: number; amount: number }>();
    for (const deal of deals) {
      const key = deal.owner || "Sin propietario";
      const current = map.get(key) ?? { owner: key, count: 0, amount: 0 };
      current.count += 1;
      current.amount += deal.amountValue || 0;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
  }, [report.drilldowns, closeData?.overdueModal]);

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
    const quarterOf = (iso: string) => {
      const d = new Date(iso);
      return Number.isFinite(d.getTime()) ? `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}` : "";
    };
    const periods = new Set(selectedPeriods);
    const scoped = (report.stageJourneys ?? []).filter(
      (j) => (ownerFilter === "team" || j.deal.ownerId === ownerFilter) && matchesType(j.deal),
    );
    const created = scoped.filter((j) => periods.has(quarterOf(j.createdAt)));
    const comparisonWindow = creationComparisonWindow(Number(year), quarter, nowMs);
    const previousCreated = scoped.filter((j) => {
      const date = Date.parse(j.createdAt);
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
        const timestamp = Date.parse(j.createdAt);
        return timestamp >= start && timestamp < end;
      }).length;
    });
    const createdTrendLabels = trendMonths.map((month) =>
      month.toLocaleDateString("es", { month: "short", year: "2-digit", timeZone: "UTC" }),
    );
    // AE: activado = avanzó a E1 o cualquier etapa posterior. KAM: paso ordenado E0→E1.
    const LOST_ID = "171385869";
    const isAe = (j: (typeof scoped)[number]) => roleOfOwner(j.deal.ownerId) === "AE";
    const advanced = (j: (typeof scoped)[number]) =>
      Object.keys(j.entered).some((k) => k !== "E0" && k !== "LOST") ||
      (j.deal.stageId !== E0 && j.deal.stageId !== LOST_ID);
    const fromE0 = created.filter((j) => isAe(j) || j.entered["E0"] || j.deal.stageId === E0);
    const e0ToE1 = fromE0.filter((j) => (isAe(j) ? advanced(j) : hasOrderedActivation(j.entered)));
    // Faltan por activar: creados del período que todavía no avanzan (AE) o no registran E0→E1 (KAM).
    const notActivated = fromE0.filter((j) => !(isAe(j) ? advanced(j) : hasOrderedActivation(j.entered)));
    // Por valorizar: los que hoy siguen en E2 (sin importar la fecha) y los creados en el
    // período filtrado que todavía no entran a E4.
    const E2 = "171385864";
    const E4 = "171385866";
    const pendingValNow = scoped.filter((j) => j.deal.stageId === E2);
    const pendingValPeriod = created.filter(
      (j) => !j.entered["E4"] && j.deal.stageId !== LOST_ID && !j.entered["LOST"],
    );
    // Valorizados: entraron a E4 dentro del período (sin importar cuándo se crearon) y monto > 0.
    const valuedList = scoped.filter(
      (j) => j.entered["E4"] && periods.has(quarterOf(j.entered["E4"])) && (j.deal.amountValue || 0) > 0,
    );
    // Perdidos después de activarse (cualquier etapa posterior) y, dentro de ellos, los que cayeron estando en E1.
    // Por fecha de entrada a perdido dentro del período (sin importar cuándo se crearon).
    const lostAfterActivation = scoped.filter(
      (j) =>
        j.deal.stageId === LOST_ID &&
        periods.has(quarterOf(j.entered["LOST"] || j.deal.closeDateValue || "")) &&
        (isAe(j) ? Object.keys(j.entered).some((k) => k !== "E0" && k !== "LOST") : hasOrderedActivation(j.entered)),
    );
    const lostFromE1 = lostAfterActivation.filter((j) =>
      Object.keys(j.entered).every((k) => k === "E0" || k === "E1" || k === "LOST"),
    );
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
      fromE0: deals(fromE0),
      e0ToE1: deals(e0ToE1),
      notActivatedIds: notActivated.map((j) => j.deal.id),
      lostAfterActivation: deals(lostAfterActivation),
      lostFromE1: deals(lostFromE1),
      e0Stuck: deals(e0Stuck),
      noSales: deals(noSales),
      openCount: openNow.length,
      openDeals: deals(openNow),
      avgActs,
    };
  }, [report.stageJourneys, ownerFilter, matchesType, selectedPeriods, year, quarter, isAllYear]);
  const openList = (
    title: string,
    subtitle: string,
    deals: DealDTO[],
    notActivatedIds?: string[],
    /** orden inicial del popup; ej. { key: "closeDate", dir: "desc" } para ver lo más reciente primero */
    initialSort?: { key: string; dir: "asc" | "desc" },
  ) => setPeriodPayload({ title, subtitle, deals, notActivatedIds, initialSort } as Drilldown);

  // Agrega los buckets de periodo (team + owners) para los periodos seleccionados.
  const periodData = useMemo(() => {
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
      subtitle: `${quotaPeriod.won} elegibles · fuera de cuota: ${quotaPeriod.excluded.length} (renovación, contracción o billetera)`,
      deals: quotaPeriod.eligible,
    } as Drilldown);
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
  const periodWonPositive = (isTeam ? periodData?.team.wonDeals : periodData?.owners[ownerFilter]?.wonDeals ?? [])
    ?.filter((d) => (d.amountValue || 0) > 0).length ?? 0;
  const periodLostPositive = (isTeam ? periodData?.team.lostDeals : periodData?.owners[ownerFilter]?.lostDeals ?? [])
    ?.filter((d) => (d.amountValue || 0) > 0).length ?? 0;
  const periodWr = { won: periodWonPositive, lost: periodLostPositive };
  // Commercial Adereso pipeline is enforced upstream; only commercial filters scope the strip.
  const executive = useMemo(() => buildExecutiveStrip(
    report.stageJourneys ?? [],
    report.executiveStrip?.onTrack ?? {
      yes: report.drilldowns[report.tracking?.find(t => t.id === "team")?.onTrackYesModal ?? ""]?.deals ?? [],
      no: report.drilldowns[report.tracking?.find(t => t.id === "team")?.onTrackNoModal ?? ""]?.deals ?? [],
    }, Date.parse(report.generatedAt), { owner: ownerFilter, role, matchesType }), [report, ownerFilter, role, matchesType]);
  const operationalTasks = useMemo(() => dashboardTasks(report, { owner: ownerFilter, role, stages: stageFilter, matchesType }), [report, ownerFilter, role, stageFilter, matchesType]);
  const { openPipe, wonJourney } = executive;
  const executiveRange = shortPeriod(executive.period);
  const wonComparison = useMemo(() => {
    const amountFor = (periodsToSum: string[]) => {
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
  }, [isAllYear, isTeam, matchesType, ownerFilter, periodWonAmount, quarter, report.periods.data, year]);

  // ---------- Chips del cuadrito de ganado ----------
  // Debajo de la barra de cuota: comparación y monto real.
  const wonChips = useMemo<{ label: string; value: string; tone?: Tone; onClick?: () => void }[]>(() => {
    const deals = quotaPeriod.eligible;
    const chips: { label: string; value: string; tone?: Tone; onClick?: () => void }[] = [
      {
        label: wonComparison.label,
        value:
          wonComparison.value === null
            ? "s/n"
            : `${wonComparison.value >= 0 ? "+" : ""}${wonComparison.value.toFixed(1)}%`,
        tone: wonComparison.value === null ? "neutral" : wonComparison.value >= 0 ? "ok" : "bad",
      },
    ];
    // Monto real incorporado: solo deals que ya pasaron a 6.2 o más adelante.
    const realDeals = deals.filter((deal) => STAGE_62_PLUS.has(deal.stageId));
    const realAmount = realDeals.reduce((sum, deal) => sum + (deal.amountValue || 0), 0);
    const realPct = periodQuota ? (realAmount / periodQuota) * 100 : null;
    chips.push({
      label: "6.2+",
      value: `${money(realAmount)} · ${realDeals.length}`,
      tone: realAmount ? "ok" : "neutral",
    });
    chips.push({
      label: "% real",
      value: realPct === null ? "s/n" : `${Math.round(realPct)}%`,
      tone: realPct === null ? "neutral" : attainmentTone(realPct),
    });
    const wallets = quotaOutByKind(["wallet"]);
    const renewals = quotaOutByKind(["renewal", "contraction"]);
    const show = (title: string, subtitle: string, list: DealDTO[]) => () =>
      setPeriodPayload({ title: `${quotaScopeName} · ${title} ${rangeLabel}`, subtitle, deals: list } as Drilldown);
    if (renewals.length) chips.push({ label: "Renov./contr. fuera", value: String(renewals.length), tone: "neutral", onClick: show("Renovaciones y contracciones", "No suman a la cuota", renewals) });
    if (wallets.length) chips.push({ label: "Billeteras vendidas", value: String(wallets.length), tone: "neutral", onClick: show("Billeteras vendidas", "Fuera de la cuota; su monto no es MRR", wallets) });
    if (quotaPeriod.review.length) chips.push({ label: "Revisar clasificación", value: String(quotaPeriod.review.length), tone: "warn", onClick: show("Clasificación a revisar", "Mixtos o sin dato de tipo/producto: hoy suman a la cuota", quotaPeriod.review) });
    if (stage6Proposal.pending.length) chips.push({ label: "Pend. Q anteriores (propuesta)", value: String(stage6Proposal.pending.length), tone: "warn", onClick: show("Pendientes de Q anteriores", "Propuesta SALES-85 por validar con JC: entraron a E6 en un Q previo y no llegan a 6.2. No cambia el cumplimiento.", stage6Proposal.pending.map((r) => r.deal)) });
    if (stage6Proposal.review.length) chips.push({ label: "E6 sin fecha confiable", value: String(stage6Proposal.review.length), tone: "warn", onClick: show("E6 a revisar", "Sin historial confiable, retroceso, reingreso o pérdida tras E6", stage6Proposal.review.map((r) => r.deal)) });
    return chips;
  }, [isTeam, ownerFilter, periodData, periodQuota, wonComparison, quotaPeriod, stage6Proposal]);

  // Esquina superior derecha: último ganado (solo fecha DD/MM) y mezcla inb/out.
  const wonCornerChips = useMemo<{ label: string; value: string; tone?: Tone; onClick?: () => void }[]>(() => {
    const deals = quotaPeriod.eligible;
    const chips: { label: string; value: string; tone?: Tone; onClick?: () => void }[] = [];
    const latest = deals
      .filter((deal) => deal.closeDateValue)
      .sort((a, b) => Date.parse(b.closeDateValue) - Date.parse(a.closeDateValue))[0];
    let latestShort = "s/n";
    if (latest) {
      const d = new Date(latest.closeDateValue);
      if (!Number.isNaN(d.getTime())) {
        latestShort = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      }
    }
    chips.push({
      label: "Último",
      value: latest ? latestShort : "s/n",
      tone: latest ? "ok" : "neutral",
    });
    // Mezcla inbound / outbound del MRR ganado.
    const total = deals.reduce((sum, deal) => sum + (deal.amountValue || 0), 0);
    const inbound = deals
      .filter((deal) => deal.segment === "Inbound")
      .reduce((sum, deal) => sum + (deal.amountValue || 0), 0);
    const outbound = deals
      .filter((deal) => deal.segment === "Outbound")
      .reduce((sum, deal) => sum + (deal.amountValue || 0), 0);
    chips.push({
      label: "Inb",
      value: total ? `${Math.round((inbound / total) * 100)}%` : "s/n",
      tone: total ? "ok" : "neutral",
    });
    chips.push({
      label: "Out",
      value: total ? `${Math.round((outbound / total) * 100)}%` : "s/n",
      tone: total ? "warn" : "neutral",
    });
    // En vista equipo también mostramos upsell y cross sell.
    if (isTeam) {
      const sumFor = (segment: string) =>
        deals
          .filter((deal) => deal.segment === segment)
          .reduce((sum, deal) => sum + (deal.amountValue || 0), 0);
      const upsell = sumFor("Upsell");
      const crossSell = sumFor("Cross sell");
      chips.push({
        label: "Up",
        value: total ? `${Math.round((upsell / total) * 100)}%` : "s/n",
        tone: total && upsell ? "ok" : "neutral",
      });
      chips.push({
        label: "Cross",
        value: total ? `${Math.round((crossSell / total) * 100)}%` : "s/n",
        tone: total && crossSell ? "ok" : "neutral",
      });
    }
    return chips;
  }, [isTeam, ownerFilter, periodData]);

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
  const periodWonWithOtf = periodWonAmount + periodOtfWon / 12;
  const periodGap = Math.max(0, periodQuota - periodWonWithOtf);
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
  const wonTrend = isTeam ? monthly.won : monthly.wonByOwner?.[ownerFilter];
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

  // Lista de comerciales recortada al rol elegido (AE o KAM) para el selector.
  const ownerOptions = (
    Object.entries(report.periods.owners) as [string, string][]
  ).filter(([id]) => role === "all" || roleOfOwner(id) === role);

  const createdDelta = !funnelTop.comparisonFuture && funnelTop.previousCreatedCount
    ? ((funnelTop.created.length - funnelTop.previousCreatedCount) / funnelTop.previousCreatedCount) * 100
    : null;
  const activationPct = funnelTop.fromE0.length
    ? Math.round((funnelTop.e0ToE1.length / funnelTop.fromE0.length) * 100)
    : null;
  const lateLossPct = funnelTop.e0ToE1.length
    ? Math.round((funnelTop.lostAfterActivation.length / funnelTop.e0ToE1.length) * 100)
    : null;
  const mainRisk = [...scopedAlerts].sort((a, b) => b.amount - a.amount)[0];
  const openRisk = () => {
    if (!mainRisk) return;
    const ids = new Set(scopedAlerts.filter((a) => a.reason === mainRisk.reason).map((a) => a.id));
    const deals = (report.stageJourneys ?? []).map((j) => j.deal).filter((d) => ids.has(d.id));
    openList(`Riesgo · ${mainRisk.reason}`, `${deals.length} deals afectados`, deals);
  };

  return (
    <main className="pulse-main">
      <div className="dashboard-topbar">
        <div className="dashboard-title-block">
          <h1 className="dashboard-title">Panel comercial</h1>
          <p className="dashboard-subtitle">
            Pipeline Comercial · gestionable E1-E5.1 · WR por closedate · datos en vivo
          </p>
        </div>
        {tabs ? <div className="dashboard-tabs-wrap">{tabs}</div> : null}
      </div>

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
        actions={<NotificationCenter scope={{owner:ownerFilter,role,type:dealType,stages:stageFilter}} tasks={operationalTasks} generatedAt={report.generatedAt}/>}
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
      {/* ===================== RESUMEN EJECUTIVO ===================== */}
      <SectionTitle
        compact
        action={headerMrr ? <ActiveMrrCard data={headerMrr} year={year} quarter={quarter} /> : undefined}
      >
        {`Resumen ejecutivo · ${ownerName} · ${executiveRange} / histórico`}
      </SectionTitle>

      <section className="executive-story" aria-label="Lectura ejecutiva">
        <div
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
          {openPipe.total ? (
            <div className="won-bar pipe-bar" role="group" aria-label="Pipeline abierto por etapa">
              {openPipe.stages.filter((st) => st.deals.length).map((st, i) => (
                <button key={st.key} type="button" data-shade={i} style={{ flexGrow: st.deals.length }}
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
              <i key={st.key} data-shade={i} title={st.hint || undefined}>{st.key}</i>
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
        <div className="exec-won">
          <span>Ganados → servicio</span>
          <strong>
            <button type="button" className="ex-link" onClick={() => openList(`Ganados en servicio · E8 · histórico`, "Ganados históricos con monto > $0 que ya iniciaron servicio", wonJourney.service, undefined, { key: "closeDate", dir: "desc" })}>
              {wonJourney.service.length} en servicio
            </button>
            {" · "}
            <button type="button" className="ex-link ex-warn" onClick={() => openList(`Ganados por iniciar servicio · histórico`, "Ganados históricos con monto > $0 en E6, E6.1 o E6.2", wonJourney.pending)}>
              {wonJourney.pending.length} por iniciar
            </button>
          </strong>
          {wonJourney.total ? (
            <div className="won-bar" role="group" aria-label="Ganados por etapa actual">
              {wonJourney.stages.filter((st) => st.deals.length).map((st) => (
                <button key={st.key} type="button" data-tone={st.tone} style={{ flexGrow: st.deals.length }}
                  title={`${st.label}: ${st.deals.length} · ${st.hint}`}
                  onClick={() => openList(`Ganados · ${st.label} · histórico`, `Ganados históricos con monto > $0 · ${st.hint}`, st.deals, undefined, st.key === "e8" ? { key: "closeDate", dir: "desc" } : undefined)}>
                  {st.key === "e61" && <WarnMark label="Warning E6.1" />}
                  {st.deals.length}
                </button>
              ))}
            </div>
          ) : null}
          <small className="ex-chips">
            {wonJourney.total
              ? wonJourney.stages.filter((st) => st.deals.length).map((st) => (
                  <i key={st.key} data-tone={st.tone}>{st.label.split(" ")[0]} {st.hint}</i>
                ))
              : "sin ganados históricos con monto"}
          </small>
        </div>
        {(() => {
          const yes = executive.onTrack.yes.length;
          const no = executive.onTrack.no.length;
          const total = yes + no;
          const C = 2 * Math.PI * 14;
          const yesLen = total ? (yes / total) * C : 0;
          const pct = total ? Math.round((yes / total) * 100) : 0;
          return (
            <div className="exec-ontrack">
              <div>
                <span>Deals on track</span>
                <strong>
                  <button type="button" className="ot-yes" onClick={() => openList(`On Track: Sí · ${ownerName}`, "Deals abiertos marcados Sí · sin filtro de fecha", executive.onTrack.yes)}>Sí {yes}</button>
                  {" · "}
                  <button type="button" className="ot-no" onClick={() => openList(`On Track: No · ${ownerName}`, "Deals abiertos marcados No · sin filtro de fecha", executive.onTrack.no)}>No {no}</button>
                </strong>
                <small>{total ? `${pct}% on track · ${money(executive.onTrack.yes.reduce((sum, d) => sum + d.amountValue, 0))} vs ${money(executive.onTrack.no.reduce((sum, d) => sum + d.amountValue, 0))}` : "sin deals marcados"}</small>
              </div>
              <svg viewBox="0 0 36 36" width="44" height="44" aria-label={`${pct}% on track`}>
                <circle cx="18" cy="18" r="14" fill="none" className="ot-ring-no" strokeWidth="5"
                  role="button" onClick={() => openList(`On Track: No · ${ownerName}`, "Deals abiertos marcados No · sin filtro de fecha", executive.onTrack.no)}><title>No: {no}</title></circle>
                {yesLen > 0 ? (
                  <circle cx="18" cy="18" r="14" fill="none" className="ot-ring-yes" strokeWidth="5"
                    strokeDasharray={`${yesLen} ${C}`} transform="rotate(-90 18 18)"
                    role="button" onClick={() => openList(`On Track: Sí · ${ownerName}`, "Deals abiertos marcados Sí · sin filtro de fecha", executive.onTrack.yes)}><title>Sí: {yes}</title></circle>
                ) : null}
              </svg>
            </div>
          );
        })()}
        <div className="exec-won">
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
      </section>

      <div className="story-divider">
        <div><strong>Resultados del período</strong></div>
        <p>{rangeLabel} · creación, conversión y cumplimiento</p>
      </div>

      {/* Fila 1 — Cuota / Ganado (héroe) / Falta */}
      <section className="grid-hero">
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
              ? `${periodWonCount} deals · ${money(periodWonAmount)} MRR (${Math.round(periodQuotaPct)}% cuota) + ${money(
                  periodOtfWon / 12,
                )} OTF/12 (+${Math.round(otfBonusPct * 10) / 10}%) → ${Math.round(totalAttainmentPct)}% total`
              : `${periodWonCount} deals · ${Math.round(periodQuotaPct)}% de la cuota`
          }
          tone={attainmentTone(totalAttainmentPct)}
          progress={periodQuotaPct}
          progressBonus={otfBonusPct}
          onClick={openQuotaWon}
          tooltip="Solo ganados elegibles: excluye renovaciones, contracciones y billeteras puras (se ven en «Fuera de la cuota»). Cumplimiento = MRR ganado del periodo + el OTF (pago único) ganado dividido en 12 meses. La barra clara es el MRR y el tramo rayado es el bonus OTF/12; la marca vertical es el 100% de la cuota."
          chips={wonChips}
          chipsTop={wonCornerChips}
          {...(wonTrend?.length ? { trend: wonTrend, trendLabels: monthly.months } : {})}
        />
        <Metric
          label="Falta para la cuota"
          value={money(periodGap)}
          note={periodGap ? "clic para simular el cierre del gap" : "cuota cumplida"}
          tone={periodGap ? "warn" : "ok"}
          onClick={() => {
            setSimModal(true);
            setModalKey(qOpenModalKey);
          }}
          tooltip="Cuota del período menos MRR ganado y OTF/12. La simulación usa como oportunidades el pipeline abierto del trimestre en curso."
        />
      </section>

      <CommissionRate attainment={selectedPeriods.length===1 && periodQuota>0 ? totalAttainmentPct : null} scope={ownerFilter}/>

      <FoldList>
      <Fold title="Estado actual" subtitle="Foto de hoy · no cambia al elegir otro trimestre · todos los tipos de deal">
      <section className="grid-3">
        <Metric
          label={`Pipeline abierto hoy · ${openCount} deals`}
          value={money(openAmount)}
          note="E1–E5.1 · todos los tipos de deal"
          onClick={() => setModalKey(openModalKey)}
          tooltip="Foto actual del monto total de deals abiertos entre E1 y E5.1. Aplica Rol y Comercial; año, trimestre y Tipo deal no alteran este indicador."
          {...(pipelineTrend && pipelineTrend.length ? { trend: pipelineTrend, trendLabels: monthly.months } : {})}
        />
        <Metric
          label="Pipeline ponderado hoy"
          value={money(weightedOpen)}
          note="monto × probabilidad de etapa"
          onClick={() => setModalKey(qOpenModalKey)}
          tooltip="Foto actual del pipeline con cierre en el trimestre en curso, ponderado por la probabilidad de etapa."
          {...(weightedTrend?.length ? { trend: weightedTrend, trendLabels: monthly.months } : {})}
        />
        <Metric
          label="Cobertura actual del gap"
          value={coverageText(scopedRisk.coverage)}
          note={`${scopedRisk.riskReason} · mínimo sano ${COVERAGE_OK}x`}
          tone={scopedRisk.risk}
          onClick={() => setModalKey(qOpenModalKey)}
          tooltip="Foto actual: pipeline ponderado del trimestre en curso dividido por lo que falta para la cuota."
        />
      </section>
      </Fold>


      <AdoboFold deals={(report.stageJourneys ?? []).map(j => j.deal)} periods={selectedPeriods} rangeLabel={rangeLabel} scope={{ owner: ownerFilter, role, stages: stageFilter, matchesType }} readAt={report.generatedAt}/>
      <Fold title="WR (Win Rate)" subtitle={`Conversión, ticket promedio y pérdidas · ${rangeLabel}`}>
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

      <Fold title="Generación y activación" subtitle={`Creación, valorización, activación y pérdidas tras activarse · ${rangeLabel}`}>
      <section className="grid-4" style={{ marginTop: 16 }}>
        <Metric
          label={`Deals creados · ${rangeLabel}`}
          value={String(funnelTop.created.length)}
          trend={funnelTop.createdTrend}
          trendLabels={funnelTop.createdTrendLabels}
          note={`${money(funnelTop.createdAmount)} ingresados en el período`}
          chips={[
            {
              label: funnelTop.comparisonPartial ? "vs. previo · parcial" : isAllYear ? "YoY" : "vs. previo",
              value: createdDelta == null ? "s/n" : `${createdDelta >= 0 ? "▲" : "▼"} ${Math.abs(createdDelta).toFixed(0)}%`,
              tone: createdDelta == null ? "neutral" : createdDelta >= 0 ? "ok" : "bad",
            },
          ]}
          onClick={() => openList(`Deals creados · ${rangeLabel}`, "Deals con fecha de creación en el período", funnelTop.created)}
          tooltip="Deals creados en el período filtrado. La línea muestra los últimos seis meses. La variación compara el período anterior con el mismo tiempo transcurrido cuando el período actual está abierto. El mes en curso es parcial."
        />
        <Metric
          label="Deals valorizados"
          value={String(funnelTop.valued.length)}
          note={`${money(funnelTop.valuedAmount)} · entraron a E4 con monto > $0`}
          onClick={() => openList(`Deals valorizados · ${rangeLabel}`, "Deals que entraron a E4 en el período con monto mayor a $0", funnelTop.valued)}
          tooltip="Deals que entraron a E4 (valorización) dentro del período seleccionado y tienen monto mayor a $0, sin importar en qué trimestre se crearon."
          chips={[
            {
              label: "En E2 hoy",
              value: String(funnelTop.pendingValNow.length),
              ...(funnelTop.pendingValNow.length ? { tone: "warn" as const } : {}),
              onClick: () => openList(`Por valorizar · en E2 · ${rangeLabel}`, "Deals abiertos que siguen en etapa 2, sin importar cuándo se crearon", funnelTop.pendingValNow),
            },
            {
              label: "Pendientes del período",
              value: String(funnelTop.pendingValPeriod.length),
              ...(funnelTop.pendingValPeriod.length ? { tone: "warn" as const } : {}),
              onClick: () => openList(`Pendientes de valorizar · ${rangeLabel}`, "Deals creados en el período que todavía no entran a E4", funnelTop.pendingValPeriod),
            },
          ]}
        />
        <Metric
          label={role === "AE" ? "Activados · E1+" : "Activados · E0→E1"}
          value={activationPct == null ? "s/d" : `${activationPct}%`}
          valueSuffix={`(${funnelTop.e0ToE1.length}/${funnelTop.fromE0.length})`}
          note={role === "AE" ? `${funnelTop.created.length} creados · avanzaron a E1 o más` : `paso por E0 registrado: ${funnelTop.fromE0.length}/${funnelTop.created.length} creados`}
          onClick={() => openList(`Activados E0→E1 · ${rangeLabel}`, "Deals creados en el período que pasaron de reunión agendada a realizada", funnelTop.e0ToE1)}
          tooltip="AE (Gonza, Holly, Gio, Andrés): activado = deal creado en el período que avanzó a E1 o a cualquier etapa posterior; denominador = todos sus creados. KAM: numerador = deals creados en el período que registran entrada a E1. Denominador: deals creados en el período con paso comprobable por E0. Solo incluye paso por E0 comprobable. Los creados directamente en otras etapas quedan fuera. Fechas de entrada disponibles: no equivalen al historial completo."
        />
        <Metric
          label="Perdidos tras activarse"
          value={String(funnelTop.lostAfterActivation.length)}
          valueSuffix={lateLossPct == null ? "" : `(${lateLossPct}%)`}
          note="entraron a perdido en el período"
          tone={funnelTop.lostAfterActivation.length ? "warn" : "ok"}
          chips={[
            {
              label: "Desde E1",
              value: String(funnelTop.lostFromE1.length),
              tone: funnelTop.lostFromE1.length ? "warn" : "neutral",
              onClick: () => openList(`Perdidos desde E1 · ${rangeLabel}`, "Deals que entraron a perdido en el período estando en E1", funnelTop.lostFromE1),
            },
          ]}
          onClick={() => openList(`Perdidos tras activarse · ${rangeLabel}`, "Deals activados que entraron a perdido dentro del período", funnelTop.lostAfterActivation)}
          tooltip="Número grande: deals activados que entraron a Deal perdido dentro del período seleccionado, sin importar cuándo se crearon, desde cualquier etapa. El % es sobre los activados del período. Chip «Desde E1»: de esos, los que se perdieron estando en E1, sin avanzar más."
        />
      </section>
      </Fold>

      <Fold title={`Avance y velocidad · ${rangeLabel}`} subtitle="Tiempo por etapa y Deal Velocity · medianas de quienes ya salieron de cada etapa">
      <StageVelocity
        journeys={report.stageJourneys ?? []}
        ownerId={ownerFilter}
        dealType={dealType}
        selectedPeriods={selectedPeriods}
        years={report.periods.years}
        quarters={quarters}
        owners={ownerOptions}
        year={year}
        quarter={quarter}
        onYear={(item) => {
          setYear(item);
          if (quarter !== "all" && !["1", "2", "3", "4"].includes(quarter)) setQuarter("all");
        }}
        onQuarter={setQuarter}
        onOwner={setOwnerFilter}
        onDealType={setDealType}
      />
      </Fold>

      <Fold title="Calidad del forecast · hoy" subtitle="Cierres del mes, credibilidad, contactabilidad e higiene de fechas">
      {(() => {
        const qCard = (label: string) => scope.cards.find((card) => card.label === label);
        const renderQ = (label: string, override?: string) => {
          const card = qCard(label);
          if (!card) return null;
          return (
            <Metric
              key={label}
              label={override ?? card.label}
              value={card.value}
              note={card.note || undefined}
              tone={card.tone ?? "neutral"}
              onClick={() => setModalKey(card.modal)}
              {...(card.tooltip ? { tooltip: card.tooltip } : {})}
              {...(card.trend ? { trend: card.trend, trendLabels: monthly.months } : {})}
            />
          );
        };
        const adoboScope =
          report.adobo?.scopes.find((item) => item.id === scopeId) ?? report.adobo?.scopes?.[0] ?? null;
        const tempBuckets = (tempData?.buckets ?? []).filter((bucket) =>
          ["normal", "prehot", "hot"].includes(bucket.key),
        );
        return (
          <>
            {/* 01 · ¿Cómo viene mi mes? */}
            <QHead
              title="¿Cómo viene mi mes?"
              subtitle="Lo que tengo comprometido y su valor esperado"
              badge="Informativo"
            />
            <section className="grid-4">
              {closeData ? (
                <>
                  <Metric
                    label={`Cierran ${closeData.monthLabel}`}
                    value={money(closeData.monthAmount)}
                    note={`${closeData.monthCount} deals con fecha en el mes en curso`}
                    onClick={() => setModalKey(closeData.monthModal)}
                  />
                  <Metric
                    label="Ponderado del mes"
                    value={money(closeData.monthWeighted)}
                    note="monto x probabilidad de etapa"
                    onClick={() => setModalKey(closeData.monthModal)}
                  />
                </>
              ) : null}
              {renderQ("Deals Q abiertos")}
            </section>

            {/* 02 · ¿Puedo confiar en ese número? */}
            <QHead
              title="¿Puedo confiar en ese número?"
              subtitle="Termómetro, deal fit y credibilidad de las fechas"
              badge="Informativo · credibilidad"
            />
            <QGroup label="Termómetro general" />
            <section className="grid-4">
              {renderQ("% cierre prom.")}
              {renderQ("Deal score prom.")}
              {renderQ("Adobo scoring prom.")}
            </section>
            {adoboScope ? (
              <>
                <QGroup label="Deal fit · qué tan bien calzan" />
                <section className="grid-4">
                  {adoboScope.fit.map((bucket) => (
                    <Metric
                      key={bucket.key}
                      label={`Fit ${bucket.label}`}
                      value={String(bucket.count)}
                      note={`${money(bucket.amount)} · Adobo prom. ${
                        bucket.avgScore < 0 ? "s/n" : Math.round(bucket.avgScore)
                      }${bucket.key === "indeterminado" ? " · sin clasificar" : ""}`}
                      tone={
                        bucket.key === "alto"
                          ? "ok"
                          : bucket.key === "medio"
                            ? "warn"
                            : bucket.key === "bajo"
                              ? "bad"
                              : "neutral"
                      }
                      tooltip="Distribución del pipeline abierto según adobo_icp_fit. Clic para ver los deals."
                      onClick={() => setModalKey(bucket.modal)}
                    />
                  ))}
                </section>
                <QGroup label="Forecast real · ¿la fecha se sostiene?" />
                <section className="grid-4">
                  {adoboScope.forecast.map((card) => (
                    <Metric
                      key={card.key}
                      label={card.label}
                      value={money(card.amount)}
                      note={`${card.count} deals · ${card.note}`}
                      tone={card.tone}
                      tooltip={card.tooltip}
                      onClick={() => setModalKey(card.modal)}
                    />
                  ))}
                </section>
              </>
            ) : null}

            {/* 03 · ¿Cómo va la comunicación con mis leads? */}
            {!tempData ? (
              <>
                <QHead title="Comunicación · evidencia disponible" subtitle="Ratio legado separado de la tasa por episodios" badge="Sin inferencias de ghosting"/>
                <section className="grid-3">
                  {renderQ("Ratio legado prom.")}
                  <Metric label="Tasa por episodios" value="pendiente" note="pendiente de integración · ventana, metodología y cobertura sin dato" tone="neutral"/>
                  <Metric label="Señal de contacto" value="no verificable" note="Sin frescura, cobertura y pausa validadas · sin alerta ni tope" tone="neutral"/>
                </section>
              </>
            ) : null}
            {tempData ? (
              <>
                <QHead
                  title="¿Cómo va la comunicación con mis leads?"
                  subtitle="Salud del contacto, de riesgo de ghosting a hot"
                  badge="Informativo · comunicación"
                />
                <section className="grid-4">
                  {renderQ("Ratio legado prom.")}
                  <Metric
                    label="Riesgo ghosting"
                    value={String(tempData.coldCount)}
                    note={`${money(tempData.coldAmount)} · ${Math.round(tempData.coldPct)}% del pipeline · sin respuesta hace rato`}
                    tone={hygieneTone(tempData.coldCount, tempData.openCount)}
                    tooltip="Deals con 3 o más intentos de contacto y 0 respuestas del prospecto. Su Adobo score se muestra con tope 45 porque no hay evidencia de conversación."
                    onClick={() => setModalKey(tempData.coldModal)}
                  />
                  {tempBuckets.map((bucket) => (
                    <Metric
                      key={bucket.key}
                      label={bucket.label}
                      value={String(bucket.count)}
                      note={`${money(bucket.amount)}${bucket.avgScore >= 0 ? ` · Adobo prom. ${Math.round(bucket.avgScore)}` : ""}`}
                      tone={bucket.tone}
                      tooltip={bucket.tooltip}
                      onClick={() => setModalKey(bucket.modal)}
                    />
                  ))}
                </section>
              </>
            ) : null}

            {closeData ? (
              <>
                <div className="q-foot">
                  <span
                    className="status"
                    data-tone={closeData.healthPct >= 85 ? "ok" : closeData.healthPct >= 60 ? "warn" : "bad"}
                  >
                    Higiene de fechas {Math.round(closeData.healthPct)}%
                  </span>
                  <span>
                    porcentaje con fecha válida y no vencida · base: {closeData.openCount} deals abiertos
                  </span>
                </div>
              </>
            ) : null}
          </>
        );
      })()}
      </Fold>

      <Fold title="Qué trabajo hoy" subtitle="Prioridades ordenadas por impacto · todas abren su lista de deals">
      <QGroup label="Cierre y seguimiento inmediato" tone="bad" />
      <section className="grid-4">
        <Metric
          label="Alertas para mirar hoy"
          value={String(scopedAlerts.length)}
          note={scopedAlerts.length ? "clic para ver el detalle" : "sin alertas en este corte"}
          tone={scopedAlerts.length ? "warn" : "ok"}
          onClick={() => setShowAlerts((value) => !value)}
          tooltip="Deals que requieren acción hoy según Rol y Comercial, de todos los tipos de deal. Se despliegan aquí mismo para revisarlos con el comercial."
        />
        {taskData ? (
          <>
            <Metric
              label="Sin próxima actividad"
              value={String(taskData.noActivityCount)}
              note={`de ${taskData.openCount} deals abiertos E1–E5.1`}
              tone={hygieneTone(taskData.noActivityCount, taskData.openCount)}
              onClick={() => setModalKey(taskData.noActivityModal)}
              tooltip="Deals abiertos sin una próxima actividad agendada."
            />
            <Metric
              label="Con tareas vencidas"
              value={String(taskData.overdueTaskCount)}
              note={`${taskData.overdueTaskTotal} tareas pendientes atrasadas`}
              tone={hygieneTone(taskData.overdueTaskCount, taskData.openCount)}
              onClick={() => setModalKey(taskData.overdueTaskModal)}
              tooltip="Deals abiertos con al menos una tarea sin completar cuyo vencimiento ya pasó."
            />
          </>
        ) : null}
        <Metric
          label="E0 estancada +10 días"
          value={String(funnelTop.e0Stuck.length)}
          note="foto de hoy · reunión agendada sin concretar"
          tone={funnelTop.e0Stuck.length ? "warn" : "ok"}
          onClick={() => openList("E0 estancada +10 días", "Deals en reunión agendada hace más de 10 días", funnelTop.e0Stuck)}
          tooltip="Deals que siguen en E0 hace más de 10 días. Año y trimestre no alteran esta señal."
        />
      </section>
      <QGroup label="Estancamiento y riesgo de caída" tone="warn" />
      <section className="grid-4">
        <Metric
          label="Sin actividad de venta +10 días"
          value={String(funnelTop.noSales.length)}
          note={`de ${funnelTop.openCount} deals abiertos E0–E5.1 hoy`}
          tone={hygieneTone(funnelTop.noSales.length, funnelTop.openCount)}
          onClick={() => openList("Sin actividad de venta +10 días", "Última actividad hace más de 10 días o nunca", funnelTop.noSales)}
          tooltip="Foto de hoy. Considera la última actividad registrada; no depende del trimestre seleccionado."
        />
        {closeData ? (
          <>
            <Metric
              label="Estancados E5 +60 días"
              value={String(closeData.stale5Count)}
              note={money(closeData.stale5Amount)}
              tone={hygieneTone(closeData.stale5Count, closeData.openCount)}
              onClick={() => setModalKey(closeData.stale5Modal)}
            />
          <Metric
              label="Candidato a perdido · prioridad"
              value={String(closeData.lostPriorityCount ?? 0)}
              note={money(closeData.lostPriorityAmount ?? 0)}
              tone={closeData.lostPriorityCount ? "warn" : "ok"}
              onClick={() => setModalKey(closeData.lostPriorityModal)}
            />
            <Metric
              label="Candidato a perdido · competencia"
              value={String(closeData.lostCompetitionCount ?? 0)}
              note={money(closeData.lostCompetitionAmount ?? 0)}
              tone={closeData.lostCompetitionCount ? "bad" : "ok"}
              onClick={() => setModalKey(closeData.lostCompetitionModal)}
            />
          </>
        ) : null}
      </section>

      {showAlerts ? (
        <section className="alerts">
          {scopedAlerts.length ? (
            scopedAlerts.map((alert) => (
              <a className="alert" key={alert.id} href={alert.url} target="_blank" rel="noreferrer">
                <span>{alert.owner}</span>
                <strong>{alert.name}</strong>
                <em>
                  {alert.reason} · {money(alert.amount)}
                </em>
              </a>
            ))
          ) : (
            <div className="empty-state">Sin alertas para este corte de filtros.</div>
          )}
        </section>
      ) : null}


      <QGroup label="Oportunidades para empujar y rescatar" tone="warn" />
      <section className="grid-4">
        {scope.cards.filter((card) => ["Alta probabilidad", "Q bajo % cierre"].includes(card.label)).map((card) => (
          <Metric key={card.label} label={card.label} value={card.value} note={card.note || undefined} tone={card.tone ?? "neutral"} onClick={() => setModalKey(card.modal)} {...(card.tooltip ? { tooltip: card.tooltip } : {})} />
        ))}
        {closeData ? <Metric label="Estancados E2 +40 días" value={String(closeData.stale2Count)} note={money(closeData.stale2Amount)} tone={hygieneTone(closeData.stale2Count, closeData.openCount)} onClick={() => setModalKey(closeData.stale2Modal)} /> : null}
        {warningScope ? <Metric label="Deals warning · E6.1" value={String(warningScope.count)} note={warningScope.reasons.map((reason) => `${reason.label} (${reason.count})`).join(" · ")} tone={warningScope.count ? "bad" : "ok"} onClick={() => setModalKey(warningScope.modal)} /> : null}
        {taskData ? <Metric label="Tareas para hoy" value={String(taskData.todayTaskCount)} note={`${taskData.todayTaskTotal} tareas vencen hoy`} tone={taskData.todayTaskCount ? "warn" : "ok"} onClick={() => setModalKey(taskData.todayTaskModal)} /> : null}
      </section>
      <AdoboRiskHygiene scope={{owner:ownerFilter,role,type:dealType,stages:stageFilter}}/>
      <QGroup label="Seguimiento especial" tone="warn" />
      {track ? (
        <>
          <div className="tracking-subsection-heading">
            <h3>On Track</h3>
            <p>Estado declarado en HubSpot para los deals abiertos</p>
          </div>
          <section className="grid-2 tracking-status-grid">
            <Metric
              label="On Track · Sí"
              value={String(track.onTrackYesCount ?? 0)}
              note={`${money(track.onTrackYesAmount ?? 0)} · marcados como Sí`}
              tone="ok"
              onClick={() => setModalKey(track.onTrackYesModal)}
              tooltip="Deals abiertos con la propiedad On Track marcada como Sí en HubSpot."
            />
            <Metric
              label="On Track · No"
              value={String(track.onTrackNoCount ?? 0)}
              note={`${money(track.onTrackNoAmount ?? 0)} · requieren seguimiento`}
              tone={(track.onTrackNoCount ?? 0) > 0 ? "bad" : "ok"}
              onClick={() => setModalKey(track.onTrackNoModal)}
              tooltip="Deals abiertos con la propiedad On Track marcada como No en HubSpot."
            />
          </section>

          <div className="tracking-subsection-heading tracking-subsection-heading-spaced">
            <h3>Seguimiento con pinzas</h3>
            <p>Deals marcados por Adobo para seguimiento especial</p>
          </div>
          <section className="grid-4">
            <Metric
              label="Deals en pinzas"
              value={String(track.atRiskCount)}
              note={`marcados por Adobo en HubSpot · de ${track.openCount} abiertos`}
              onClick={() => setModalKey(track.allModal)}
            />
            <Metric
              label="Monto en pinzas"
              value={money(track.atRiskAmount)}
              note={`${money(track.openAmount)} pipeline abierto`}
              onClick={() => setModalKey(track.allModal)}
            />
            <Metric
              label="% del pipeline"
              value={`${Math.round(track.share)}%`}
              note="peso de los deals en seguimiento"
              tone={shareTone(track.share)}
              onClick={() => setModalKey(track.allModal)}
            />
            <Metric
              label="Adobo prom. / % cierre"
              value={`${track.avgAdobo ? Math.round(track.avgAdobo) : "s/n"} · ${Math.round(
                track.avgProbability * 100,
              )}%`}
              note="score vivo vs. probabilidad de etapa"
              tone={
                track.avgAdobo ? (track.avgAdobo >= 65 ? "ok" : track.avgAdobo >= 45 ? "warn" : "bad") : "neutral"
              }
              onClick={() => setModalKey(track.allModal)}
            />
          </section>


        </>
      ) : null}


      {closeData ? <>
                {/* 04 · ¿Qué tengo mal registrado? */}
                <QHead
                  title="Higiene de datos"
                  subtitle="Fechas vencidas o faltantes que le restan credibilidad al forecast"
                  badge="Accionable · higiene"
                  actionable
                />
                <section className="grid-4">
                  <Metric
                    label="Cierre vencido"
                    value={String(closeData.overdueCount)}
                    note={`${money(closeData.overdueAmount)} con fecha pasada`}
                    tone={hygieneTone(closeData.overdueCount, closeData.openCount)}
                    onClick={() => setModalKey(closeData.overdueModal)}
                  />
                  <Metric
                    label="Sin fecha de cierre"
                    value={String(closeData.noDateCount)}
                    note={`${money(closeData.noDateAmount)} sin closedate`}
                    tone={hygieneTone(closeData.noDateCount, closeData.openCount)}
                    onClick={() => setModalKey(closeData.noDateModal)}
                  />
                  <Metric
                    label="PoC vencida (E5.1)"
                    value={String(closeData.pocOverdueCount)}
                    note={`${money(closeData.pocOverdueAmount)} con fecha fin de PoC pasada`}
                    tone={hygieneTone(closeData.pocOverdueCount, closeData.openCount)}
                    onClick={() => setModalKey(closeData.pocOverdueModal)}
                  />
                </section>

                {ownerFilter === "team" && overdueByOwner.length ? (
                  <div className="owner-chips">
                    <span className="owner-chips-label">Cierres vencidos por comercial</span>
                    <div className="owner-chips-row">
                      {overdueByOwner.map((entry) => (
                        <button
                          key={entry.owner}
                          type="button"
                          className="owner-chip"
                          onClick={() => setModalKey(closeData.overdueModal)}
                          title={`${entry.owner}: ${entry.count} vencidos · ${money(entry.amount)}`}
                        >
                          {firstName(entry.owner)}
                          <span className="owner-chip-count">{entry.count}</span>
                          <span className="owner-chip-amount">{money(entry.amount)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

      </> : null}
      </Fold>
      <Fold title="Actividad y cobertura de datos" subtitle="Hoy · actividades por deal e higiene de gestión">
      <section className="grid-3">
        <Metric
          label="Actividades acumuladas por deal"
          value={funnelTop.avgActs == null ? "s/d" : funnelTop.avgActs.toFixed(1)}
          note={`${funnelTop.openCount} deals abiertos E0–E5.1 · ${funnelTop.avgActs == null ? 0 : funnelTop.openDeals.filter((deal) => typeof deal.activities === "number").length} con dato`}
          onClick={() => openList("Actividades acumuladas por deal", "Deals abiertos · ordena por la columna Activ.", funnelTop.openDeals)}
          tooltip="Promedio histórico acumulado de actividades registradas por deal abierto. No representa actividades realizadas dentro del trimestre seleccionado."
        />
        {taskData ? (
          <Metric
            label="Higiene de gestión"
            value={`${Math.round(taskData.healthPct)}%`}
            note="con próxima actividad y sin tareas atrasadas"
            tone={taskData.healthPct >= 85 ? "ok" : taskData.healthPct >= 60 ? "warn" : "bad"}
            onClick={() => setModalKey(taskData.pendingModal)}
          />
        ) : null}
      </section>
      </Fold>

      {/* ===================== TABLA UNIFICADA POR COMERCIAL ===================== */}
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
      </FoldList>





        </>
      )}

      <DealModal
        payload={payload}
        onClose={closeModal}
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
        simulation={
          simModal
            ? {
                quota: periodQuota,
                won: periodWonWithOtf,
                label: `${isTeam ? "Equipo" : ownerName} · ${rangeLabel}`,
                commissionScope: ownerFilter,
              }
            : null
        }
      />
    </main>
  );
}

/** Adobo section with a live clock: expiry and review dates advance while the page stays open. */
function AdoboFold({ deals, periods, rangeLabel, scope, readAt }: { deals: DealDTO[]; periods: string[]; rangeLabel: string; scope: { owner: string; role: AdoboRole; stages: string[]; matchesType: (d: DealDTO) => boolean }; readAt: string }) {
  const now = useLiveNow(Date.parse(readAt));
  const [open, setOpen] = useState(false);
  const list = intelligenceDeals(adoboPeriodDeals(deals, periods), scope, now);
  const ids = list.map(d => d.id).sort();
  const history = useQuery({
    queryKey: ['adobo-panel-history', readAt, ids.join(',')],
    enabled: open && ids.length > 0,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const result: Record<string, PropertyHistoryV1 | null> = {};
      // Sequential bounded requests avoid holding every raw history response at once.
      for (let start = 0; start < ids.length; start += 50) {
        Object.assign(result, await getAdoboHistory({ data: { ids: ids.slice(start, start + 50) } }));
      }
      return result;
    },
  });
  const enriched = list.map(deal => ({ ...deal, adobo: { ...deal.adobo, propertyHistory: history.data?.[deal.id] ?? null } }));
  return <Fold title="Adobo Intelligence · Score y seguimiento" subtitle={`${rangeLabel} · ${list.length} negocios · fecha de cierre`} onOpenChange={setOpen}>
    {history.isFetching ? <p role="status" className="eyebrow">Leyendo historial de los negocios…</p> : null}
    {history.error ? <div role="alert"><p>No pudimos leer el historial; las variaciones quedan sin verificar.</p><Button variant="ghost" onClick={() => void history.refetch()}>Reintentar historial</Button></div> : null}
    <AdoboIntelligence key={`${periods.join(',')}|${scope.owner}|${scope.role}|${scope.stages.join(',')}`} deals={enriched} readAt={readAt} now={now} rangeLabel={rangeLabel}/>
  </Fold>;
}
