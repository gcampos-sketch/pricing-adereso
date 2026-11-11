/**
 * Barra de filtros única del tablero: Rol · Año · Trimestre · Comercial · Etapa
 * (+ estado de datos en vivo). La usan todas las páginas para que el formato y
 * el contenido sean idénticos al de Pipeline Comercial > Vista general.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActiveMrr } from "@/contexts/RefreshContext";
import { ROLE_OPTIONS, type RoleFilter } from "@/lib/owner-roles";
import { ActiveMrrDetail } from "./ActiveMrrDetail";
import { lastQuarterSummary, shortDate } from "./activeMrrSeries";
import { ServiceOverview } from './ServiceOverview';

export const STAGE_OPTIONS = ["E1", "E2", "E3", "E3.1", "E4", "E5", "E5.1"];

const firstName = (full: string) => {
  const trimmed = (full || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "sin propietario") return trimmed || "S/N";
  return trimmed.split(/\s+/)[0];
};

export function SingleFilterMenu({
  label,
  value,
  options,
  open,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value)?.label ?? value;

  return (
    <div className="compact-filter-field">
      <span className="compact-filter-label">{label}</span>
      <div className="compact-filter-menu" data-open={open}>
        <Button
          className="compact-filter-trigger"
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span>{selected}</span>
          <ChevronRight size={13} aria-hidden="true" />
        </Button>
        <div className="compact-filter-popover compact-filter-rail">
          {options.map((option) => (
            <Button
              key={option.value}
              className="compact-filter-option"
              type="button"
              variant="ghost"
              size="sm"
              data-active={value === option.value}
              onClick={() => (value === option.value ? onToggle() : onChange(option.value))}
            >
              <span>{option.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OwnerFilterMenu({
  value,
  options,
  open,
  onToggle,
  onChange,
  role,
}: {
  role?: RoleFilter | undefined;
  value: string;
  options: [string, string][];
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  const teamLabel = role === "AE" ? "Todos (AEs)" : role === "KAM" ? "Todos (KAMs)" : "Equipo";
  const selected =
    value === "team" ? teamLabel : firstName(options.find(([id]) => id === value)?.[1] ?? "Comercial");

  return (
    <div className="compact-filter-field">
      <span className="compact-filter-label">Comercial</span>
      <div className="compact-filter-menu" data-open={open}>
        <Button
          className="compact-filter-trigger"
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span>{selected}</span>
          <ChevronRight size={13} aria-hidden="true" />
        </Button>
        <div className="compact-filter-popover compact-filter-rail">
          <Button
            className="compact-filter-option"
            type="button"
            variant="ghost"
            size="sm"
            data-active={value === "team"}
            onClick={() => (value === "team" ? onToggle() : onChange("team"))}
          >
            <span>{teamLabel}</span>
          </Button>
          {options.map(([id, name]) => (
            <Button
              key={id}
              className="compact-filter-option"
              type="button"
              variant="ghost"
              size="sm"
              data-active={value === id}
              onClick={() => (value === id ? onToggle() : onChange(id))}
            >
              <span>{firstName(name)}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StageFilterMenu({
  value,
  open,
  onToggle,
  onChange,
}: {
  value: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (value: string[]) => void;
}) {
  const summary = value.length === 0 ? "Todas" : value.length === 1 ? value[0] : `${value.length} etapas`;

  return (
    <div className="compact-filter-field">
      <span className="compact-filter-label">Etapa</span>
      <div className="compact-filter-menu" data-open={open}>
        <Button
          className="compact-filter-trigger"
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span>{summary}</span>
          <ChevronRight size={13} aria-hidden="true" />
        </Button>
        <div className="compact-filter-popover compact-filter-rail">
          <Button
            className="compact-filter-option"
            type="button"
            variant="ghost"
            size="sm"
            data-active={value.length === 0}
            onClick={() => onChange([])}
          >
            <span>Todas</span>
          </Button>
          {STAGE_OPTIONS.map((stage) => {
            const selected = value.includes(stage);
            return (
              <Button
                key={stage}
                className="compact-filter-option"
                type="button"
                variant="ghost"
                size="sm"
                data-active={selected}
                onClick={() =>
                  onChange(selected ? value.filter((item) => item !== stage) : [...value, stage])
                }
              >
                <span>{stage}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RoleFilterMenu({
  value,
  open,
  onToggle,
  onChange,
}: {
  value: RoleFilter;
  open: boolean;
  onToggle: () => void;
  onChange: (value: RoleFilter) => void;
}) {
  const selected = ROLE_OPTIONS.find((option) => option.value === value)?.label ?? "Todos";

  return (
    <div className="compact-filter-field">
      <span className="compact-filter-label">Rol</span>
      <div className="compact-filter-menu" data-open={open}>
        <Button
          className="compact-filter-trigger"
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span>{selected}</span>
          <ChevronRight size={13} aria-hidden="true" />
        </Button>
        <div className="compact-filter-popover compact-filter-rail">
          {ROLE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              className="compact-filter-option"
              type="button"
              variant="ghost"
              size="sm"
              data-active={value === option.value}
              onClick={() => (value === option.value ? onToggle() : onChange(option.value))}
            >
              <span>{option.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export type FilterBarProps = {
  /** años disponibles */
  years: string[];
  /** trimestres disponibles del año elegido */
  quarters: string[];
  /** comerciales: [id, nombre] */
  owners: [string, string][];
  year: string;
  quarter: string;
  ownerId: string;
  stages: string[];
  /** muestra el selector de etapa; ocultarlo cuando no filtra la página completa */
  showStages?: boolean;
  onYear: (value: string) => void;
  onQuarter: (value: string) => void;
  onOwner: (value: string) => void;
  onStages: (value: string[]) => void;
  /** rol comercial: todos (predeterminado), AE o KAM */
  role?: RoleFilter;
  onRole?: (value: RoleFilter) => void;
  ago: string;
  isRefreshing: boolean;
  onRefresh?: () => void;
  label?: string;
  /** tipo de negocio: todo | inbound | outbound (opcional, solo donde aplica) */
  dealType?: string;
  onDealType?: (value: string) => void;
  actions?: ReactNode;
};

export function CompactFilterBar({
  years,
  quarters,
  owners,
  year,
  quarter,
  ownerId,
  stages,
  showStages = true,
  onYear,
  onQuarter,
  onOwner,
  onStages,
  role,
  onRole,
  ago,
  isRefreshing,
  label = "Filtros del tablero",
  dealType,
  onDealType,
  actions,
}: FilterBarProps) {
  const [openFilter, setOpenFilter] = useState<"role" | "year" | "quarter" | "owner" | "stage" | "type" | null>(null);
  const [floating, setFloating] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openFilter) return;
    const close = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setOpenFilter(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openFilter]);

  useEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;
    // The anchor stays in normal flow: sticky offsetTop and a shrinking header
    // cannot feed back into the threshold or trigger scroll-anchor compensation.
    const onScroll = () => {
      const stickyTop = Number.parseFloat(getComputedStyle(panel).top) || 0;
      setFloating(anchor.getBoundingClientRect().top <= stickyTop);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const toggle = (key: "role" | "year" | "quarter" | "owner" | "stage" | "type") =>
    setOpenFilter((current) => (current === key ? null : key));

  return (
    <>
    <div ref={anchorRef} className="filter-sticky-anchor" aria-hidden="true" />
    <section
      ref={panelRef}
      className="filter-panel filter-panel-compact"
      data-floating={floating}
      data-has-actions={!!actions}
      aria-label={label}
    >
      <div className="filter-row filter-row-inline" ref={rowRef}>
        <div className="filter-control-group filter-control-expandable">
          <SingleFilterMenu
            label="Año"
            value={year}
            open={openFilter === "year"}
            onToggle={() => toggle("year")}
            options={years.map((item) => ({ value: item, label: item }))}
            onChange={(item) => {
              onYear(item);
              onQuarter("all");
              setOpenFilter(null);
            }}
          />
        </div>
        <div className="filter-control-group filter-control-expandable">
          <SingleFilterMenu
            label="Trimestre"
            value={quarter}
            open={openFilter === "quarter"}
            onToggle={() => toggle("quarter")}
            options={[
              { value: "all", label: "Año" },
              ...quarters.map((item) => ({ value: item, label: `Q${item}` })),
            ]}
            onChange={(item) => {
              onQuarter(item);
              setOpenFilter(null);
            }}
          />
        </div>
        {onRole ? (
          <div className="filter-control-group filter-control-expandable">
            <RoleFilterMenu
              value={role ?? "all"}
              open={openFilter === "role"}
              onToggle={() => toggle("role")}
              onChange={(item) => {
                onRole?.(item);
                setOpenFilter(null);
              }}
            />
          </div>
        ) : null}
        <div className="filter-control-group filter-control-expandable">
          <OwnerFilterMenu
            role={role}
            value={ownerId}
            options={owners}
            open={openFilter === "owner"}
            onToggle={() => toggle("owner")}
            onChange={(item) => {
              onOwner(item);
              setOpenFilter(null);
            }}
          />
        </div>
        {showStages ? (
          <div className="filter-control-group filter-control-expandable">
            <StageFilterMenu
              value={stages}
              open={openFilter === "stage"}
              onToggle={() => toggle("stage")}
              onChange={onStages}
            />
          </div>
        ) : null}
        {onDealType ? (
          <div className="filter-control-group filter-control-expandable">
            <SingleFilterMenu
              label="Tipo deal"
              value={dealType ?? "all"}
              open={openFilter === "type"}
              onToggle={() => toggle("type")}
              options={[
                { value: "all", label: "Todo" },
                { value: "inbound", label: "Inbound" },
                { value: "outbound", label: "Outbound" },
                { value: "upsell", label: "Upsell" },
                { value: "crossSell", label: "Cross sell" },
              ]}
              onChange={(item) => {
                onDealType(item);
                setOpenFilter(null);
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="filter-data-age" aria-live="polite">
        <span className="data-stamp-dot" data-live={isRefreshing} aria-hidden="true" />
        Datos de {ago}{isRefreshing ? " · actualizando…" : ""}
      </div>
      {actions ? <div className="filter-panel-actions">{actions}</div> : null}
    </section>
    </>
  );
}

/**
 * Píldora compacta de MRR en servicio para la cabecera de sección.
 * Una sola línea: etiqueta · monto · variación QoQ · deals y monto en desarrollo.
 */
export function ActiveMrrCard({ data, year, quarter, snapshotKey }: { data: ActiveMrr; year: string; quarter: string; snapshotKey?: string }) {
  const format = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const [open, setOpen] = useState(false);
  // El cuadro es una foto global: siempre muestra el último trimestre incorporado y su QoQ.
  const comparison = data.entries.length ? lastQuarterSummary(data.entries) : null;
  const changePct = comparison ? comparison.changePct : data.changePct;
  const tone = changePct === null ? "neutral" : changePct >= 0 ? "ok" : "bad";
  return (
    <>
      <ServiceOverview refreshKey={snapshotKey ?? `${data.value}:${data.count}:${data.inDevelopment?.value}`}><button
        type="button"
        className="filter-active-mrr mrr-pill"
        data-tone={tone}
        aria-label="Ver evolución del MRR en servicio"
        title={
          (comparison
            ? `${format.format(comparison.current.value)} arrancó servicio en ${comparison.current.label}`
            : "MRR en servicio") + (data.lastStart ? ` · último inicio ${shortDate(data.lastStart.date)}` : "")
        }
        onClick={() => setOpen(true)}
      >
        <span className="filter-active-mrr-label">MRR en servicio</span>
        <strong>{format.format(data.value)}</strong>
        {changePct !== null ? (
          <span className="filter-active-mrr-change" data-tone={tone} title="Variación del MRR incorporado a servicio frente al trimestre anterior; no es una caída de la cartera activa.">
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(1)}%
            <em>{comparison ? 'altas vs Q ant.' : 'altas vs previo'}</em>
          </span>
        ) : null}
        <span className="filter-active-mrr-meta">
          {data.count} negocios en servicio · foto global de hoy
        </span>
      </button></ServiceOverview>
      {open ? <ActiveMrrDetail data={data} year={year} quarter={quarter} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
