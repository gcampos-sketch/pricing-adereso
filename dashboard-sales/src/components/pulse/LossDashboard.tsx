import { useMemo, useState } from "react";
import { ChevronRight, ArrowLeft } from "lucide-react";
import { LossSankey } from "./LossSankey";
import { DealModal } from "./DealModal";
import { MetricTrend } from "./MetricTrend";
import { lossMonthlyHistory, type LossMonth } from "@/lib/loss-summary";
import { Metric } from "./PulseDashboard";
import { CompactFilterBar } from "./FilterBar";
import { SectionTitle, median, money, pct, sum, useAgo, useInsightFilters } from "./insights-shared";
import type { Drilldown } from "@/lib/pulse-types";
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

function LossCurve({ data, measure, label }: { data: LossMonth[]; measure: "amount" | "count" | "ticket"; label: string }) {
  return <MetricTrend data={data.map(point => ({ label: point.label, value: point[measure], partial: point.partial }))}
    label={label} unit={measure === "count" ? "number" : "money"} caption="Últimos 6 meses por cierre" />;
}

export function LossDashboard({ report, onRefresh, isRefreshing, tabs, role = "all", onRole }: {
  report: InsightsReport; onRefresh: () => void; isRefreshing: boolean; tabs: React.ReactNode;
  role?: "all" | "AE" | "KAM"; onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const ago = useAgo(report.generatedAt);
  const filters = useInsightFilters(report, undefined, role, onRole);
  const [drill, setDrill] = useState<(Drilldown & { lossEntryScope?: boolean }) | null>(null);
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
  const open = (title: string, deals: InsightDeal[]) => setDrill({ title, subtitle: `${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope}${path.length ? ` · ${path.map(slice => slice.key).join(" → ")}` : ""}`, deals });
  const updatePath = (next: Slice[]) => setExploration({ scope: scopeKey, path: next });
  const enter = (key: string) => {
    const next = [...path, { dimension, key }];
    updatePath(next);
    const unused = DIMENSIONS.find(item => !next.some(slice => slice.dimension === item.key));
    if (unused) setDimension(unused.key);
  };
  const late = lost.filter(deal => ["E5", "E5.1"].includes(deal.lostStage));
  const ghost = scoped.filter(deal => deal.ghost);
  const highScore = scoped.filter(deal => deal.adoboScoreValue > 60);
  const question = DIMENSIONS.find(item => item.key === dimension)!.question;

  return <main className="pulse-main loss-dashboard">
    {tabs}
    <header className="team-header"><div>
      <h1 className="pulse-h1">Deals perdidos</h1>
      <p className="loss-intro">Entiende cuánto se perdió y explora dónde se concentra.</p>
    </div></header>
    <CompactFilterBar years={report.years} quarters={filters.quartersAvailable} owners={roleOwnerOptions}
      year={filters.year} quarter={filters.quarter} ownerId={filters.ownerId} stages={stageFilter}
      onYear={filters.setYear} onQuarter={filters.setQuarter} onOwner={filters.setOwnerId} onStages={setStageFilter}
      role={role} onRole={item => { onRole?.(item); filters.setOwnerId("team"); }}
      creationSource={creationSource} creationSourceOptions={sourceOptions} onCreationSource={setCreationSource}
      ago={ago} isRefreshing={isRefreshing} onRefresh={onRefresh} label="Filtros de deals perdidos" />

    <SectionTitle note={filters.rangeLabel}>Resumen de pérdidas</SectionTitle>
    <section className="loss-summary">
      <Metric label="MRR perdido" value={money(lostAmount)} note="Monto mensual de los deals perdidos" tone="neutral"
        onClick={() => open("MRR perdido", lost)} tooltip="MRR de los deals perdidos con fecha de cierre dentro del período seleccionado. La curva muestra los últimos seis meses hasta el fin del período o el mes de lectura, con los mismos filtros."
        footer={<LossCurve data={monthly} measure="amount" label="MRR perdido" />} />
      <Metric label="Deals perdidos" value={String(lost.length)} note={`${late.length} llegaron a E5 o E5.1`}
        tone="neutral" onClick={() => open("Deals perdidos", lost)} tooltip="Cantidad de deals perdidos del período y alcance seleccionados. La curva muestra cantidades mensuales."
        footer={<LossCurve data={monthly} measure="count" label="Deals perdidos" />} />
      <Metric label="Ticket medio perdido" value={ticket === null ? "—" : money(ticket)} note={`${lost.length} deals perdidos · MRR promedio por deal`}
        tone="neutral" onClick={() => open("Ticket medio perdido", lost)}
        tooltip="MRR perdido dividido por la cantidad de deals perdidos del período, incluidos los de monto $0. Cada punto de la curva usa el promedio de su propio mes; los meses sin deals quedan sin dato."
        footer={<LossCurve data={monthly} measure="ticket" label="Ticket medio perdido" />} />
    </section>

    <LossSankey deals={sankeyCandidates} periods={filters.periods} readAt={report.generatedAt}
      scope={`${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope}`} entryDatesAvailable={report.lossEntryDatesVersion === "native-loss-entry/v1"}
      onOpen={(title, deals, basis) => setDrill({ title, subtitle: `${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope} · ${basis === "entry" ? "Entrada a deal perdido (F. Cierre conserva la fecha CRM)" : "Fecha de cierre"}`, deals, lossEntryScope: basis === "entry" })} />

    <section className="rep-chart loss-explorer" aria-label="Explorar pérdidas">
      <nav className="loss-breadcrumb" aria-label="Recorrido del análisis">
        <button type="button" onClick={() => { updatePath([]); setDimension("reason"); }} aria-current={!path.length ? "location" : undefined}>Todas las pérdidas</button>
        {path.map((slice, index) => <span key={`${slice.dimension}-${index}`}><ChevronRight size={13} aria-hidden="true" />
          <button type="button" aria-current={index === path.length - 1 ? "location" : undefined} onClick={() => updatePath(path.slice(0, index + 1))}>
            {slice.key}
          </button></span>)}
      </nav>
      <div className="loss-analysis-heading">
        <div><h2>{question}</h2><p>{path.length ? `${scoped.length} de ${lost.length} deals · ${money(scopedAmount)} MRR` : "Elige una categoría para profundizar o abre sus deals."}</p></div>
        <div className="tabs" aria-label="Medida del análisis">{(["amount", "count"] as const).map(value => <button type="button" key={value} data-active={measure === value} aria-pressed={measure === value} onClick={() => setMeasure(value)}>{value === "amount" ? "MRR" : "Deals"}</button>)}</div>
      </div>
      <div className="loss-dimensions" aria-label="Analizar pérdidas por">
        {DIMENSIONS.filter(item => !path.some(slice => slice.dimension === item.key)).map(item => <button key={item.key} type="button" aria-pressed={dimension === item.key} data-active={dimension === item.key} onClick={() => setDimension(item.key)}>{item.label}</button>)}
      </div>
      {!!path.length && <div className="loss-scope-actions">
        <button type="button" className="cell-button" onClick={() => { const last = path[path.length - 1]!; updatePath(path.slice(0, -1)); setDimension(last.dimension); }}><ArrowLeft size={14} aria-hidden="true" /> Volver un nivel</button>
        <button type="button" className="cell-button" onClick={() => open(path.map(slice => slice.key).join(" · "), scoped)}>Ver {scoped.length} deals</button>
      </div>}
      <div className="loss-rows">
        {visibleRows.map(row => <div key={row.key} className="loss-row">
          <button type="button" className="loss-category" onClick={() => path.length < DIMENSIONS.length - 1 ? enter(row.key) : open(row.key, row.deals)} aria-label={`Analizar ${row.key}`}>
            <span className="loss-row-label">{row.key}</span>
            <span className="loss-row-track"><span style={{ width: `${row[measure] / max * 100}%` }} /></span>
            <span className="loss-row-value">{measure === "amount" ? money(row.amount) : row.count}<small>{pct(total ? row[measure] / total * 100 : 0)}</small></span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          <button type="button" className="loss-deals-link" onClick={() => open(row.key, row.deals)} aria-label={`Ver ${row.count} deals de ${row.key}`}>{row.count} deals</button>
        </div>)}
        {!rows.length && <div className="empty-state">Sin pérdidas en este alcance. Cambia los filtros o vuelve al resumen.</div>}
      </div>
      {rows.length > 5 && <button type="button" className="cell-button loss-show-more" aria-expanded={expandedRows === rowsKey} onClick={() => setExpandedRows(expandedRows === rowsKey ? "" : rowsKey)}>{expandedRows === rowsKey ? "Mostrar solo las 5 principales" : `Ver las ${rows.length - 5} categorías restantes`}</button>}
      <div className="loss-analysis-total"><span>Total de este análisis</span><strong>{money(scopedAmount)} MRR · {scoped.length} deals</strong></div>
    </section>

    <details className="rep-chart loss-details" key={scopeKey + JSON.stringify(path)}>
      <summary>Profundizar en los registros <span>Comentarios, tiempo en etapa y actividad</span></summary>
      <div className="loss-record-tools">
        <button type="button" className="cell-button" onClick={() => open("Score alto que terminó perdido", highScore)}>Score &gt; 60 · {highScore.length} deals</button>
        <button type="button" className="cell-button" onClick={() => open("Registros disponibles de ghosting", ghost)}>Actividad de ghosting · {ghost.length} con registros</button>
      </div>
      <p className="loss-intro">La actividad disponible puede ser parcial; la ausencia de registros no confirma ausencia de seguimiento.</p>
      <div className="table-wrap"><table className="pulse-table"><thead><tr><th>Deal</th><th>Etapa / días</th><th>Comentario de cierre</th><th>Actividad registrada</th></tr></thead>
        <tbody>{scoped.map(deal => <tr key={deal.id}>
          <td><button type="button" className="cell-button" onClick={() => open(deal.name, [deal])}>{deal.name}</button><div className="loss-record-owner">{deal.owner}</div></td>
          <td>{deal.lostStage || "Sin recorrido"}<div className="loss-record-owner">{deal.lostStageDays > 0 ? `${deal.lostStageDays} d` : "Sin duración"}</div></td>
          <td>{deal.lostReasonText || "Sin comentario registrado"}</td>
          <td>{deal.ghost ? `${deal.ghost.emails} correos · ${deal.ghost.calls} llamadas · ${deal.ghost.whatsapp ?? "s/d"} WhatsApp` : "Sin cobertura de actividad"}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="loss-intro">Mediana de tiempo en etapa: {median(scoped.map(deal => deal.lostStageDays).filter(days => days > 0)) || "s/d"} días · solo duraciones registradas.</p>
    </details>
    <DealModal payload={drill} onClose={() => setDrill(null)} hideCloseSummary={Boolean(drill?.lossEntryScope)} />
  </main>;
}
