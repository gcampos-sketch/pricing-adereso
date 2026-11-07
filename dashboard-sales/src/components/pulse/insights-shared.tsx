import { useEffect, useMemo, useState } from "react";
import { CopySectionButton } from "./CopyControls";
import type { InsightDeal, InsightsReport } from "@/lib/insights-types";
import { roleOfOwner, type RoleFilter } from "@/lib/owner-roles";

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export const pct = (value: number) => `${Math.round(value)}%`;

export const shortPeriod = (period: string) => {
  const [year, q] = period.split("-Q");
  return `Q${q}-${year!.slice(2)}`;
};

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

export function useAgo(iso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
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

export type Filters = {
  year: string;
  quarter: string;
  ownerId: string;
  periods: string[];
  quartersAvailable: string[];
  rangeLabel: string;
  setYear: (value: string) => void;
  setQuarter: (value: string) => void;
  setOwnerId: (value: string) => void;
  /** rol comercial: todos (predeterminado), AE o KAM */
  role: RoleFilter;
  setRole: (value: RoleFilter) => void;
  /** deals del rango + comercial seleccionados */
  deals: InsightDeal[];
  /** deals abiertos del comercial (foto actual, sin filtro de periodo) */
  openDeals: InsightDeal[];
  ownerName: string;
};

/**
 * Filtros comunes de año, trimestre y comercial. `role` viene del selector
 * "Rol" del tablero y recorta los deals a AEs o KAMs.
 */
export function useInsightFilters(
  report: InsightsReport,
  initialOwnerId?: string | undefined,
  role: RoleFilter = "all",
  onRole?: (value: RoleFilter) => void,
): Filters {
  const [year, setYear] = useState(report.currentPeriod.split("-Q")[0]!);
  const [quarter, setQuarter] = useState(report.currentPeriod.split("-Q")[1]!);
  const [ownerId, setOwnerId] = useState(
    initialOwnerId && report.owners.some((owner) => owner.id === initialOwnerId)
      ? initialOwnerId
      : "team",
  );

  const quartersAvailable = useMemo(
    () => ["1", "2", "3", "4"].filter((q) => report.periods.includes(`${year}-Q${q}`)),
    [report.periods, year],
  );
  const periods = useMemo(() => {
    const inYear = report.periods.filter((period) => period.startsWith(`${year}-`));
    return quarter === "all" ? inYear : inYear.filter((period) => period.endsWith(`-Q${quarter}`));
  }, [report.periods, year, quarter]);

  const matchesOwner = (deal: InsightDeal) =>
    (ownerId === "team" || deal.ownerId === ownerId) && (role === "all" || roleOfOwner(deal.ownerId) === role);

  const deals = useMemo(
    () => report.deals.filter((deal) => matchesOwner(deal) && periods.includes(deal.period)),
    [report.deals, periods, ownerId],
  );
  const openDeals = useMemo(
    () => report.deals.filter((deal) => deal.status === "open" && matchesOwner(deal)),
    [report.deals, ownerId],
  );

  const ownerName =
    ownerId === "team"
      ? role === "AE"
        ? "Equipo AE"
        : role === "KAM"
          ? "Equipo KAM"
          : "Equipo"
      : report.owners.find((owner) => owner.id === ownerId)?.name ?? "Comercial";

  return {
    year,
    quarter,
    ownerId,
    periods,
    quartersAvailable,
    rangeLabel: quarter === "all" ? `Año ${year}` : `Q${quarter} ${year}`,
    setYear,
    setQuarter,
    setOwnerId,
    role,
    setRole: onRole ?? (() => {}),
    deals,
    openDeals,
    ownerName,
  };
}

export function FilterPanel({
  filters,
  report,
}: {
  filters: Filters;
  report: InsightsReport;
}) {
  return (
    <section className="filter-panel">
      <div className="filter-row">
        <span className="owner-chips-label">Año</span>
        <div className="tabs">
          {report.years.map((option) => (
            <button
              key={option}
              className="tab"
              type="button"
              data-active={option === filters.year}
              onClick={() => {
                filters.setYear(option);
                filters.setQuarter("all");
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-row">
        <span className="owner-chips-label">Periodo</span>
        <div className="tabs">
          <button
            className="tab"
            type="button"
            data-active={filters.quarter === "all"}
            onClick={() => filters.setQuarter("all")}
          >
            Año completo
          </button>
          {filters.quartersAvailable.map((option) => (
            <button
              key={option}
              className="tab"
              type="button"
              data-active={filters.quarter === option}
              onClick={() => filters.setQuarter(option)}
            >
              Q{option}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-row">
        <span className="owner-chips-label">Comercial</span>
        <div className="tabs">
          <button
            className="tab"
            type="button"
            data-active={filters.ownerId === "team"}
            onClick={() => filters.setOwnerId("team")}
          >
            General
          </button>
          {report.owners.map((owner) => (
            <button
              key={owner.id}
              className="tab"
              type="button"
              data-active={filters.ownerId === owner.id}
              onClick={() => filters.setOwnerId(owner.id)}
            >
              {owner.name.split(/\s+/)[0]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function GlassFilters({ filters, report }: { filters: Filters; report: InsightsReport }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 260);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="glass-filters" data-visible={visible} aria-hidden={!visible}>
      <select
        className="glass-select"
        value={filters.year}
        onChange={(event) => {
          filters.setYear(event.target.value);
          filters.setQuarter("all");
        }}
        aria-label="Año"
      >
        {report.years.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        className="glass-select"
        value={filters.quarter}
        onChange={(event) => filters.setQuarter(event.target.value)}
        aria-label="Periodo"
      >
        <option value="all">Año completo</option>
        {filters.quartersAvailable.map((option) => (
          <option key={option} value={option}>
            Q{option}
          </option>
        ))}
      </select>
      <select
        className="glass-select"
        value={filters.ownerId}
        onChange={(event) => filters.setOwnerId(event.target.value)}
        aria-label="Comercial"
      >
        <option value="team">General</option>
        {report.owners.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.name.split(/\s+/)[0]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="team-section-head" data-section-head>
      <h2 className="pulse-h2">{children}</h2>
      {note ? <span className="eyebrow">{note}</span> : null}
      <CopySectionButton />
    </div>
  );
}

/** barras horizontales comparables, con clic para abrir el detalle */
export function HBars({
  data,
  formatter = money,
  onSelect,
}: {
  data: { key: string; label: string; value: number; note?: string; tone?: string }[];
  formatter?: (value: number) => string;
  onSelect?: (key: string) => void;
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  if (!data.length) return <div className="empty-state">Sin datos en el rango.</div>;
  return (
    <div className="plan-bars hbars">
      {data.map((item) => (
        <button
          key={item.key}
          className="plan-bar"
          type="button"
          disabled={!onSelect || item.value <= 0}
          onClick={() => onSelect?.(item.key)}
        >
          <span className="plan-bar-label">{item.label}</span>
          <span className="plan-bar-track">
            <span
              className="plan-bar-fill"
              data-tone={item.tone}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </span>
          <span className="plan-bar-value">
            {formatter(item.value)}
            {item.note ? <em> · {item.note}</em> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/** barras apiladas por periodo: expansión vs venta nueva */
export function StackedTrend({
  data,
  onSelect,
}: {
  data: { period: string; a: number; b: number }[];
  onSelect?: (period: string) => void;
}) {
  const max = Math.max(...data.map((item) => item.a + item.b), 1);
  return (
    <div className="stack-bars">
      {data.map((item) => {
        const total = item.a + item.b;
        return (
          <button
            key={item.period}
            className="stack-bar"
            type="button"
            disabled={!onSelect || total <= 0}
            title={`${shortPeriod(item.period)} · expansión ${money(item.a)} · venta nueva ${money(item.b)}`}
            onClick={() => onSelect?.(item.period)}
          >
            <span className="stack-col">
              <span className="stack-seg" data-kind="exp" style={{ height: `${(item.a / max) * 100}%` }} />
              <span className="stack-seg" data-kind="new" style={{ height: `${(item.b / max) * 100}%` }} />
            </span>
            <em>{shortPeriod(item.period)}</em>
          </button>
        );
      })}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; kind: string }[] }) {
  return (
    <div className="stack-legend">
      {items.map((item) => (
        <span key={item.label}>
          <i data-kind={item.kind} /> {item.label}
        </span>
      ))}
    </div>
  );
}

export function sum(list: InsightDeal[], pick: (deal: InsightDeal) => number) {
  return list.reduce((acc, deal) => acc + pick(deal), 0);
}

export function weighted(list: InsightDeal[]) {
  return list.reduce((acc, deal) => acc + deal.amountValue * (deal.probabilityValue || 0), 0);
}
