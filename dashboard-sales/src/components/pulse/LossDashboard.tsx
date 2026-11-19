import { ExpandableCellText } from "./ExpandableCellText";
import { ReportTitleScope } from "./ReportTitleScope";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { LossReasonPopover } from "./LossReasonPopover";
import { LossTicketByOwner } from "./LossTicketByOwner";
import { LossReasonWords } from "./LossReasonWords";
import { LossIcpTable } from "./LossIcpTable";
import { LossScoreClusters } from "./LossScoreClusters";
import { LossMonthlyClusters } from "./LossMonthlyClusters";
import { LOSS_CLUSTER_VERSION } from "@/lib/loss-monthly-clusters";
import { LossSankey } from "./LossSankey";
import { DealModal } from "./DealModal";
import { MetricTrend } from "./MetricTrend";
import { lossMonthlyHistory, lossValuation, lossTicketComparison, type LossMonth } from "@/lib/loss-summary";
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
    label={label} unit={measure === "count" ? "number" : "money"} />;
}

export function LossDashboard({ report, onRefresh, isRefreshing, tabs, role = "all", onRole }: {
  report: InsightsReport; onRefresh: () => void; isRefreshing: boolean; tabs: React.ReactNode;
  role?: "all" | "AE" | "KAM"; onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const ago = useAgo(report.generatedAt);
  const filters = useInsightFilters(report, undefined, role, onRole);
  const [drill, setDrill] = useState<(Drilldown & { lossEntryScope?: boolean; reasonWords?: boolean; coverageWarning?: boolean; ticketByOwner?: boolean }) | null>(null);
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
  const open = (title: string, deals: InsightDeal[], reasonWords = false) => setDrill({ reasonWords: reasonWords || path.some(slice => slice.dimension === "reason"), title, subtitle: `${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope}${path.length ? ` · ${path.map(slice => slice.key).join(" → ")}` : ""}`, deals });
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
        onClick={() => open("MRR perdido", lost)} tooltip="MRR de los deals perdidos con fecha de cierre dentro del período seleccionado. La curva muestra los últimos seis meses hasta el fin del período o el mes de lectura, con los mismos filtros."
        footer={<LossCurve data={monthly} measure="amount" label="MRR perdido" />} />
      <Metric label="Deals perdidos" value={String(lost.length)} note={`${valuation.valuedCount} valorizados · ${valuation.valuedPercent === null ? "—" : pct(valuation.valuedPercent)} del total`}
        tone="neutral" onClick={() => open("Deals perdidos", lost)} tooltip="Cantidad de deals perdidos del período y alcance seleccionados. Valorizados: deals con MRR registrado mayor que $0; porcentaje sobre todos los deals perdidos de este alcance. La curva muestra cantidades mensuales."
        footer={<LossCurve data={monthly} measure="count" label="Deals perdidos" />} />
      <Metric label="Ticket medio perdido" value={ticket === null ? "—" : money(ticket)} note={ticketNote}
        tone="neutral" onClick={() => setDrill({
          title: "Ticket medio perdido",
          subtitle: `${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope}`,
          deals: lost,
          ticketByOwner: filters.ownerId === "team",
        })}
        tooltip="MRR perdido dividido por todos los deals perdidos, incluidos los de monto $0. Al seleccionar un comercial, la diferencia es (su ticket / ticket del equipo completo − 1) × 100. El equipo incluye todos los comerciales y roles con el mismo período, fuente y etapa; no es el promedio de promedios por comercial. Sin una base positiva comparable se muestra sin comparación. Cada mes de la curva usa su propio promedio."
        footer={<LossCurve data={monthly} measure="ticket" label="Ticket medio perdido" />} />
    </section>

    <LossSankey deals={sankeyCandidates} periods={filters.periods} readAt={report.generatedAt}
      scope={`${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope}`} entryDatesAvailable={report.lossEntryDatesVersion === "native-loss-entry/v1"}
      onWarning={(deals, basis) => setDrill({
        title: basis === "close" ? "Deals sin fecha de cierre válida" : "Deals sin entrada a perdido verificable",
        subtitle: `Perdidos disponibles · ${filters.ownerName} · ${sourceScope} · Rol ${role === "all" ? "Todos" : role} · Etapa ${stageFilter.join(", ") || "Todas"} · Sin período asignable; excluidos del Sankey`,
        deals, coverageWarning: true,
      })}
      onOpen={(title, deals, basis, reasonWords) => setDrill({ reasonWords: Boolean(reasonWords), title, subtitle: `${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope} · ${basis === "entry" ? "Entrada a deal perdido (F. Cierre conserva la fecha CRM)" : "Fecha de cierre"}`, deals, lossEntryScope: basis === "entry" })} />

    <LossMonthlyClusters deals={sankeyCandidates} periods={filters.periods} readAt={report.generatedAt}
      available={report.lossClusterVersion === LOSS_CLUSTER_VERSION} companySizeAvailable={report.lossCompanySizeAvailable === true} />

    <LossScoreClusters deals={lost} readAt={report.generatedAt} scope={`${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope}`} available={report.lossNarrativesVersion === "closed-lost-reason/v1"} />

    <LossIcpTable deals={lost} readAt={report.generatedAt} scope={`${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope}`} available={report.lossNarrativesVersion === "closed-lost-reason/v1"}
      onOpen={(title,deals)=>setDrill({title,deals,reasonWords:true,subtitle:`${filters.rangeLabel} · ${filters.ownerName} · ${sourceScope} · ICP anterior a la pérdida; tabla con valores CRM actuales`})} />

    <section className="rep-chart loss-explorer" aria-label="Explorar pérdidas">
      <nav className="loss-breadcrumb" aria-label="Recorrido del análisis">
        <button type="button" onClick={() => { updatePath([]); setDimension("reason"); }} aria-current={!path.length ? "location" : undefined}>Todas las pérdidas</button>
        {path.map((slice, index) => <span key={`${slice.dimension}-${index}`}><ChevronRight size={13} aria-hidden="true" />
          <button type="button" aria-current={index === path.length - 1 ? "location" : undefined} onClick={() => updatePath(path.slice(0, index + 1))}>
            {slice.key}
          </button></span>)}
      </nav>
      <div className="loss-analysis-heading">
        <div><h2 className="pulse-h2">{question}</h2><p>{path.length ? `${scoped.length} de ${lost.length} deals · ${money(scopedAmount)} MRR` : dimension === "reason" ? "Pulsa un motivo para ver sus palabras o el conteo para abrir sus deals." : "Elige una categoría para profundizar o abre sus deals."}</p></div>
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
          {dimension === "reason" ? <div className="loss-category loss-category--reason">
            <LossReasonPopover label={row.key} deals={row.deals} scope={wordScope} available={report.lossNarrativesVersion === "closed-lost-reason/v1"} />
            <button type="button" className="loss-category-drill" onClick={() => path.length < DIMENSIONS.length - 1 ? enter(row.key) : open(row.key, row.deals, true)} aria-label={`Analizar ${row.key}`}>
              <span className="loss-row-track"><span style={{ width: `${row[measure] / max * 100}%` }} /></span>
              <span className="loss-row-value">{measure === "amount" ? money(row.amount) : row.count}<small>{pct(total ? row[measure] / total * 100 : 0)}</small></span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div> : <button type="button" className="loss-category" onClick={() => path.length < DIMENSIONS.length - 1 ? enter(row.key) : open(row.key, row.deals)} aria-label={`Analizar ${row.key}`}>
            <span className="loss-row-label">{row.key}</span>
            <span className="loss-row-track"><span style={{ width: `${row[measure] / max * 100}%` }} /></span>
            <span className="loss-row-value">{measure === "amount" ? money(row.amount) : row.count}<small>{pct(total ? row[measure] / total * 100 : 0)}</small></span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>}
          <button type="button" className="loss-deals-link" onClick={() => open(row.key, row.deals, dimension === "reason")} aria-label={`Ver ${row.count} deals de ${row.key}`}>{row.count} deals</button>
        </div>)}
        {!rows.length && <div className="empty-state">Sin pérdidas en este alcance. Cambia los filtros o vuelve al resumen.</div>}
      </div>
      {rows.length > 5 && <button type="button" className="cell-button loss-show-more" aria-expanded={expandedRows === rowsKey} onClick={() => setExpandedRows(expandedRows === rowsKey ? "" : rowsKey)}>{expandedRows === rowsKey ? "Mostrar solo las 5 principales" : `Ver las ${rows.length - 5} categorías restantes`}</button>}
      <div className="loss-analysis-total"><span>Total de este análisis</span><strong>{money(scopedAmount)} MRR · {scoped.length} deals</strong></div>
    </section>

    <details className="rep-chart loss-details" key={scopeKey + JSON.stringify(path)}>
      <summary>Profundizar en los registros <span>Comentarios, tiempo en etapa y actividad</span></summary>
      <div className="loss-record-tools">
        <button type="button" className="cell-button" onClick={() => open("Registros disponibles de ghosting", ghost)}>Actividad de ghosting · {ghost.length} con registros</button>
      </div>
      <p className="loss-intro">La actividad disponible puede ser parcial; la ausencia de registros no confirma ausencia de seguimiento.</p>
      <div className="table-wrap"><table className="pulse-table"><thead><tr><th>Deal</th><th>Etapa / días</th><th>Comentario de cierre</th><th>Actividad registrada</th></tr></thead>
        <tbody>{scoped.map(deal => <tr key={deal.id}>
          <td><button type="button" className="cell-button" onClick={() => open(deal.name, [deal])}>{deal.name}</button><div className="loss-record-owner">{deal.owner}</div></td>
          <td>{deal.lostStage || "Sin recorrido"}<div className="loss-record-owner">{deal.lostStageDays > 0 ? `${deal.lostStageDays} d` : "Sin duración"}</div></td>
          <td>{deal.lostReasonText ? <ExpandableCellText text={deal.lostReasonText} label="Comentario de cierre" /> : "Sin comentario registrado"}</td>
          <td>{deal.ghost ? `${deal.ghost.emails} correos · ${deal.ghost.calls} llamadas · ${deal.ghost.whatsapp ?? "s/d"} WhatsApp` : "Sin cobertura de actividad"}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="loss-intro">Mediana de tiempo en etapa: {median(scoped.map(deal => deal.lostStageDays).filter(days => days > 0)) || "s/d"} días · solo duraciones registradas.</p>
    </details>
    <DealModal payload={drill} onClose={() => setDrill(null)} hideCloseSummary={Boolean(drill?.lossEntryScope || drill?.reasonWords || drill?.coverageWarning)} showOwnerFilter={Boolean(drill?.coverageWarning)}
      detailContent={drill?.ticketByOwner ? rows => <LossTicketByOwner deals={rows} /> : drill?.reasonWords ? rows =>
        <details key={JSON.stringify([drill.title, drill.subtitle])} className="loss-words-disclosure" open>
          <summary>
            <ChevronDown size={14} aria-hidden="true" />
            <span className="loss-words-label-open">Ocultar nube de palabras</span>
            <span className="loss-words-label-closed">Mostrar nube de palabras</span>
          </summary>
          <LossReasonWords deals={rows.map(row => drill.deals.find(deal => deal.id === row.id) as InsightDeal).filter(Boolean)}
            available={report.lossNarrativesVersion === "closed-lost-reason/v1"} />
        </details> : undefined} />
  </main>;
}
