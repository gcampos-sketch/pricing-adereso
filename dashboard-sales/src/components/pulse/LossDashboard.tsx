import { ReportTitleScope } from "./ReportTitleScope";
import { useMemo, useRef, useState } from "react";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { LossReasonPopover } from "./LossReasonPopover";
import { LossDealDrawer, type LossDealSelection } from "./LossDealDrawer";
import { LossExecutiveSummary, type LossMeasure } from "./LossExecutiveSummary";
import { LossIcpTable } from "./LossIcpTable";
import { LossScoreClusters } from "./LossScoreClusters";
import { LossMonthlyClusters } from "./LossMonthlyClusters";
import { LOSS_CLUSTER_VERSION } from "@/lib/loss-monthly-clusters";
import { LossSankey } from "./LossSankey";
import { MetricTrend } from "./MetricTrend";
import { lossMonthlyHistory, lossValuation, lossTicketComparison, type LossMonth } from "@/lib/loss-summary";
import { Metric } from "./PulseDashboard";
import { CompactFilterBar } from "./FilterBar";
import { SectionTitle, median, money, pct, sum, useAgo, useInsightFilters } from "./insights-shared";
import type { InsightDeal, InsightsReport } from "@/lib/insights-types";
import { lossCreationSources, scopeLossCreationSource } from "@/lib/loss-creation-source";
import { roleOfOwner } from "@/lib/owner-roles";
import "./LossDashboard.css";

type Dimension = "reason" | "stage" | "owner" | "source" | "size" | "objection";
const DIMENSIONS: { key: Dimension; label: string; question: string }[] = [
  { key: "reason", label: "Motivo", question: "¿Por qué se pierden?" },
  { key: "stage", label: "Etapa", question: "¿En qué etapa se pierden?" },
  { key: "owner", label: "Comercial", question: "¿Cómo se distribuyen por comercial?" },
  { key: "source", label: "Fuente", question: "¿De dónde vienen?" },
  { key: "size", label: "Tamaño", question: "¿Qué tamaño de empresa concentran?" },
  { key: "objection", label: "Objeción", question: "¿Qué objeciones quedaron registradas?" },
];
const keyOf = (deal: InsightDeal, dimension: Dimension): string => {
  switch (dimension) {
    case "reason": return deal.lostReason || "Sin motivo listado";
    case "stage": return deal.lostStage || "Sin recorrido";
    case "owner": return deal.owner || "Sin comercial";
    case "source": return deal.sourceLabel || "Sin fuente registrada";
    case "size": return deal.sizeBucket || "Sin dato";
    case "objection": return deal.objection || "Sin objeción registrada";
  }
};
type Slice = { dimension: Dimension; key: string };

function LossCurve({ data, measure, label, onOpen }: {
  data: LossMonth[]; measure: LossMeasure; label: string; onOpen: (title: string, deals: InsightDeal[]) => void;
}) {
  return <MetricTrend data={data.map(point => ({ label: point.label, value: point[measure], partial: point.partial }))}
    label={label} unit={measure === "count" ? "number" : "money"} onSelect={index => {
      const point = data[index];
      if (point) onOpen(`${label} · ${point.label}`, point.deals);
    }} />;
}

export function LossDashboard({ report, onRefresh, isRefreshing, tabs, role = "all", onRole }: {
  report: InsightsReport; onRefresh: () => void; isRefreshing: boolean; tabs: React.ReactNode;
  role?: "all" | "AE" | "KAM"; onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const ago = useAgo(report.generatedAt);
  const filters = useInsightFilters(report, undefined, role, onRole);
  const [drill, setDrill] = useState<LossDealSelection | null>(null);
  const [summary, setSummary] = useState<LossMeasure | null>(null);
  const drillTrigger = useRef<Element | null>(null);
  const summaryTrigger = useRef<Element | null>(null);
  const focusTrigger = (target: Element | null) => {
    if (target instanceof HTMLElement || target instanceof SVGElement) target.focus({ preventScroll: true });
  };
  const openDeals = (selection: LossDealSelection) => {
    drillTrigger.current = document.activeElement;
    setDrill(selection);
  };
  const openSummary = (measure: LossMeasure) => {
    summaryTrigger.current = document.activeElement;
    setSummary(measure);
  };
  const [creationSource, setCreationSource] = useState("");
  const sourceOptions = useMemo(() => lossCreationSources(report.deals), [report.deals]);
  const sourceDeals = useMemo(() => scopeLossCreationSource(report.deals, creationSource), [report.deals, creationSource]);
  const sourceScope = sourceOptions.find(option => option.value === creationSource)?.label || creationSource || "Todas las fuentes";
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [dimension, setDimension] = useState<Dimension>("reason");
  const [expandedRows, setExpandedRows] = useState("");
  const [measure, setMeasure] = useState<"amount" | "count">("amount");
  // Bind a path to its master scope: a new period/owner never inherits an old drilldown.
  const scopeKey = JSON.stringify([filters.year, filters.quarter, filters.ownerId, role, stageFilter, creationSource]);
  const [exploration, setExploration] = useState<{ scope: string; path: Slice[] }>({ scope: "", path: [] });
  const path = exploration.scope === scopeKey ? exploration.path : [];
  const wordScope = [filters.rangeLabel, filters.ownerName, sourceScope, ...path.filter(slice => slice.dimension !== "reason").map(slice => slice.key)].join(" · ");
  const roleOwnerOptions = report.owners.filter(owner => role === "all" || roleOfOwner(owner.id) === role)
    .map(owner => [owner.id, owner.name] as [string, string]);
  const closed = useMemo(() => scopeLossCreationSource(filters.deals, creationSource).filter(deal => role === "all" || roleOfOwner(deal.ownerId) === role), [filters.deals, role, creationSource]);
  const lost = useMemo(() => closed.filter(deal => deal.status === "lost" && (!stageFilter.length || stageFilter.includes(deal.lostStage))), [closed, stageFilter]);
  const sankeyCandidates = useMemo(() => sourceDeals.filter(deal => deal.status === "lost" &&
    (filters.ownerId === "team" || deal.ownerId === filters.ownerId) &&
    (role === "all" || roleOfOwner(deal.ownerId) === role) &&
    (!stageFilter.length || stageFilter.includes(deal.lostStage))), [sourceDeals, filters.ownerId, role, stageFilter]);
  const lostAmount = sum(lost, deal => deal.amountValue);
  const ticket = lost.length ? lostAmount / lost.length : null;
  const valuation = lossValuation(lost);
  // Full-team baseline deliberately removes both owner and role, retaining period/source/stage.
  const teamLost = useMemo(() => sourceDeals.filter(deal => deal.status === "lost" &&
    filters.periods.includes(deal.period) && (!stageFilter.length || stageFilter.includes(deal.lostStage))),
    [sourceDeals, filters.periods, stageFilter]);
  const comparison = lossTicketComparison(lost, teamLost);
  const comparisonLabel = comparison.differencePercent === null ? "Sin comparación disponible con el equipo" :
    `${comparison.differencePercent > 0 ? "+" : ""}${comparison.differencePercent.toLocaleString("es-CL", { maximumFractionDigits: 1 })}% vs equipo completo (${money(comparison.teamTicket!)})`;
  const ticketNote = filters.ownerId === "team" ? `${lost.length} deals perdidos · MRR promedio por deal` :
    `${lost.length} deals perdidos · ${comparisonLabel}`;
  const monthly = useMemo(() => lossMonthlyHistory(sourceDeals.filter(deal =>
    (filters.ownerId === "team" || deal.ownerId === filters.ownerId) &&
    (role === "all" || roleOfOwner(deal.ownerId) === role) &&
    (!stageFilter.length || stageFilter.includes(deal.lostStage))),
    report.periods, filters.year, filters.quarter, report.generatedAt),
    [report, sourceDeals, filters.ownerId, role, stageFilter, filters.year, filters.quarter]);
  const scoped = lost.filter(deal => path.every(slice => keyOf(deal, slice.dimension) === slice.key));
  const scopedAmount = sum(scoped, deal => deal.amountValue);
  const grouped = new Map<string, InsightDeal[]>();
  for (const deal of scoped) {
    const key = keyOf(deal, dimension);
    grouped.set(key, [...(grouped.get(key) ?? []), deal]);
  }
  const rows = [...grouped].map(([key, deals]) => ({ key, deals, count: deals.length, amount: sum(deals, deal => deal.amountValue) }))
    .sort((a, b) => b[measure] - a[measure] || b.count - a.count || a.key.localeCompare(b.key));
  const rowsKey = JSON.stringify([scopeKey, path, dimension]);
  const visibleRows = expandedRows === rowsKey ? rows : rows.slice(0, 5);
  const max = Math.max(1, ...rows.map(row => row[measure]));
  const total = measure === "amount" ? scopedAmount : scoped.length;
  const scope = `${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope}`;
  const openTrend = (title: string, deals: InsightDeal[]) => openDeals({ title, deals, scope: `${filters.ownerName} · ${sourceScope} · Fecha de cierre` });
  const narrativesAvailable = report.lossNarrativesVersion === "closed-lost-reason/v1";
  const open = (title: string, deals: InsightDeal[], reasonWords = false, records = false) => openDeals({
    title, deals, reasonWords: reasonWords || path.some(slice => slice.dimension === "reason"), records,
    scope: path.length ? `${scope} · ${path.map(slice => slice.key).join(" → ")}` : scope,
  });
  const updatePath = (next: Slice[]) => setExploration({ scope: scopeKey, path: next });
  const enter = (key: string) => {
    const next = [...path, { dimension, key }];
    updatePath(next);
    const unused = DIMENSIONS.find(item => !next.some(slice => slice.dimension === item.key));
    if (unused) setDimension(unused.key);
  };
  const ghost = scoped.filter(deal => deal.ghost);
  const question = DIMENSIONS.find(item => item.key === dimension)!.question;

  return <main className="pulse-main loss-dashboard">
    {tabs}
    <header className="team-header"><div>
      <h1 className="pulse-h1">
        Deals perdidos
        <ReportTitleScope period={filters.titlePeriod} owner={filters.titleOwner} />
      </h1>
      <p className="loss-intro">Entiende cuánto se perdió y explora dónde se concentra.</p>
    </div></header>
    <CompactFilterBar years={report.years} quarters={filters.quartersAvailable} owners={roleOwnerOptions}
      year={filters.year} quarter={filters.quarter} ownerId={filters.ownerId} stages={stageFilter}
      onYear={filters.setYear} onQuarter={filters.setQuarter} onOwner={filters.setOwnerId} onStages={setStageFilter}
      role={role} onRole={item => { onRole?.(item); filters.setOwnerId("team"); }}
      creationSource={creationSource} creationSourceOptions={sourceOptions} onCreationSource={setCreationSource}
      ago={ago} isRefreshing={isRefreshing} onRefresh={onRefresh} label="Filtros de deals perdidos" />

    <SectionTitle>Resumen de pérdidas</SectionTitle>
    <section className="loss-summary">
      <Metric label="MRR perdido" value={money(lostAmount)} note="Monto mensual de los deals perdidos" tone="neutral"
        onClick={() => openSummary("amount")} tooltip="MRR de los deals perdidos con fecha de cierre dentro del período seleccionado. La curva muestra los últimos seis meses hasta el fin del período o el mes de lectura, con los mismos filtros."
        footer={<LossCurve data={monthly} measure="amount" label="MRR perdido" onOpen={openTrend} />} />
      <Metric label="Deals perdidos" value={String(lost.length)} note={`${valuation.valuedCount} valorizados · ${valuation.valuedPercent === null ? "—" : pct(valuation.valuedPercent)} del total`}
        tone="neutral" onClick={() => openSummary("count")} tooltip="Cantidad de deals perdidos del período y alcance seleccionados. Valorizados: deals con MRR registrado mayor que $0; porcentaje sobre todos los deals perdidos de este alcance. La curva muestra cantidades mensuales."
        footer={<LossCurve data={monthly} measure="count" label="Deals perdidos" onOpen={openTrend} />} />
      <Metric label="Ticket medio perdido" value={ticket === null ? "—" : money(ticket)} note={ticketNote}
        tone="neutral" onClick={() => openSummary("ticket")}
        tooltip="MRR perdido dividido por todos los deals perdidos, incluidos los de monto $0. Al seleccionar un comercial, la diferencia es (su ticket / ticket del equipo completo − 1) × 100. El equipo incluye todos los comerciales y roles con el mismo período, fuente y etapa; no es el promedio de promedios por comercial. Sin una base positiva comparable se muestra sin comparación. Cada mes de la curva usa su propio promedio."
        footer={<LossCurve data={monthly} measure="ticket" label="Ticket medio perdido" onOpen={openTrend} />} />
    </section>

    <LossSankey deals={sankeyCandidates} periods={filters.periods} readAt={report.generatedAt}
      scope={scope} entryDatesAvailable={report.lossEntryDatesVersion === "native-loss-entry/v1"}
      onWarning={(deals, basis) => openDeals({
        title: basis === "close" ? "Deals sin fecha de cierre válida" : "Deals sin entrada a perdido verificable",
        scope: `${filters.ownerName} · ${sourceScope} · Rol ${role === "all" ? "Todos" : role} · Etapa ${stageFilter.join(", ") || "Todas"} · Sin período asignable; excluidos del Sankey`,
        deals,
      })}
      onOpen={(title, deals, basis, reasonWords) => openDeals({
        title, deals, reasonWords: Boolean(reasonWords), scope: `${scope} · ${basis === "entry" ? "Entrada a deal perdido" : "Fecha de cierre"}`,
      })} />

    <LossMonthlyClusters deals={sankeyCandidates} periods={filters.periods} readAt={report.generatedAt}
      available={report.lossClusterVersion === LOSS_CLUSTER_VERSION} companySizeAvailable={report.lossCompanySizeAvailable === true}
      meetingCountsAvailable={report.lossMeetingCountsAvailable === true}
      onOpen={(title, deals, basis) => openDeals({ title, deals, scope: `${scope} · ${basis}` })} />

    <LossScoreClusters deals={lost} readAt={report.generatedAt} scope={scope}
      onOpen={(title, deals) => openDeals({ title, deals, reasonWords: true, filterReasons: true, scope: `${scope} · Score anterior a la pérdida` })} />

    <LossIcpTable deals={lost} readAt={report.generatedAt} scope={scope}
      onOpen={(title, deals) => openDeals({ title, deals, reasonWords: true, filterReasons: true, scope: `${scope} · ICP anterior a la pérdida` })} />

    <section className="rep-chart loss-explorer" aria-label="Explorar pérdidas">
      <nav className="loss-breadcrumb" aria-label="Recorrido del análisis">
        <button type="button" onClick={() => { updatePath([]); setDimension("reason"); }} aria-current={!path.length ? "location" : undefined}>Todas las pérdidas</button>
        {path.map((slice, index) => <span key={`${slice.dimension}-${index}`}><ChevronRight size={13} aria-hidden="true" />
          <button type="button" aria-current={index === path.length - 1 ? "location" : undefined} onClick={() => updatePath(path.slice(0, index + 1))}>
            {slice.key}
          </button></span>)}
      </nav>
      <div className="loss-analysis-heading">
        <div><h2 className="pulse-h2">{question}</h2><p>{path.length ? `${scoped.length} de ${lost.length} deals · ${money(scopedAmount)} MRR` : dimension === "reason" ? "Pulsa una barra para ver sus deals, el motivo para ver sus palabras o la flecha para cruzar categorías." : "Pulsa una barra para ver sus deals o la flecha para cruzar categorías."}</p></div>
        <div className="tabs" aria-label="Medida del análisis">{(["amount", "count"] as const).map(value => <button type="button" key={value} data-active={measure === value} aria-pressed={measure === value} onClick={() => setMeasure(value)}>{value === "amount" ? "MRR" : "Deals"}</button>)}</div>
      </div>
      <div className="loss-dimensions" aria-label="Analizar pérdidas por">
        {DIMENSIONS.filter(item => !path.some(slice => slice.dimension === item.key)).map(item => <button key={item.key} type="button" aria-pressed={dimension === item.key} data-active={dimension === item.key} onClick={() => setDimension(item.key)}>{item.label}</button>)}
      </div>
      {!!path.length && <div className="loss-scope-actions">
        <button type="button" className="cell-button" onClick={() => { const last = path[path.length - 1]!; updatePath(path.slice(0, -1)); setDimension(last.dimension); }}><ArrowLeft size={14} aria-hidden="true" /> Volver un nivel</button>
        <button type="button" className="cell-button" onClick={() => open(path.map(slice => slice.key).join(" · "), scoped)}>Ver {scoped.length} deals</button>
      </div>}
      {path.some(slice => slice.dimension === "reason") && <LossReasonPopover label={path.find(slice => slice.dimension === "reason")!.key} triggerLabel="Ver palabras del motivo" deals={scoped} scope={wordScope} available={report.lossNarrativesVersion === "closed-lost-reason/v1"} />}
      <div className="loss-rows">
        {visibleRows.map(row => <div key={row.key} className="loss-row">
          <div className={`loss-category${dimension === "reason" ? " loss-category--reason" : ""}`}>
            {dimension === "reason"
              ? <LossReasonPopover label={row.key} deals={row.deals} scope={wordScope} available={narrativesAvailable} />
              : <span className="loss-row-label">{row.key}</span>}
            <button type="button" className="loss-category-drill" aria-haspopup="dialog"
              onClick={() => open(row.key, row.deals, dimension === "reason")}
              aria-label={`Ver ${row.count} deals de ${row.key}`}>
              <span className="loss-row-track"><span style={{ width: `${row[measure] / max * 100}%` }} /></span>
              <span className="loss-row-value">{measure === "amount" ? money(row.amount) : row.count}<small>{pct(total ? row[measure] / total * 100 : 0)}</small></span>
            </button>
            <button type="button" className="loss-deals-link" onClick={() => open(row.key, row.deals, dimension === "reason")}>{row.count} deals</button>
            {path.length < DIMENSIONS.length - 1 && <button type="button" className="loss-cross-category"
              onClick={() => enter(row.key)} aria-label={`Cruzar ${row.key} con otra categoría`}>
              <ChevronRight size={15} aria-hidden="true" />
            </button>}
          </div>
        </div>)}
        {!rows.length && <div className="empty-state">Sin pérdidas en este alcance. Cambia los filtros o vuelve al resumen.</div>}
      </div>
      {rows.length > 5 && <button type="button" className="cell-button loss-show-more" aria-expanded={expandedRows === rowsKey} onClick={() => setExpandedRows(expandedRows === rowsKey ? "" : rowsKey)}>{expandedRows === rowsKey ? "Mostrar solo las 5 principales" : `Ver las ${rows.length - 5} categorías restantes`}</button>}
      <div className="loss-analysis-total"><span>Total de este análisis</span><strong>{money(scopedAmount)} MRR · {scoped.length} deals</strong></div>
    </section>

    <section className="rep-chart loss-details" aria-label="Evidencia de pérdidas">
      <h2 className="pulse-h2">Registros de pérdida</h2>
      <p className="loss-intro">Mediana de tiempo en etapa {median(scoped.map(deal => deal.lostStageDays).filter(days => days > 0)) || "s/d"} días · solo duraciones registradas.</p>
      <div className="loss-record-tools">
        <button type="button" className="cell-button" onClick={() => open("Registros de pérdida", scoped, false, true)}>Ver comentarios y actividad · {scoped.length} deals</button>
        <button type="button" className="cell-button" onClick={() => open("Registros disponibles de ghosting", ghost, false, true)}>Actividad de ghosting · {ghost.length} con registros</button>
      </div>
      <p className="loss-intro">La actividad disponible puede ser parcial.</p>
    </section>
    {summary && <LossExecutiveSummary deals={lost} scope={scope} measure={summary} onOpenDeals={openDeals}
      onClose={() => setSummary(null)} restoreFocus={() => focusTrigger(summaryTrigger.current)} />}
    {drill && <LossDealDrawer selection={drill} narrativesAvailable={narrativesAvailable}
      onClose={() => setDrill(null)} restoreFocus={() => focusTrigger(drillTrigger.current)} />}
  </main>;
}
