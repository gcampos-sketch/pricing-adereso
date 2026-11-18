import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ADOBO_COMMERCIAL_GROUPS,
  ADOBO_DELIVERY_GROUPS,
  evidenceChronology,
  freshnessReport,
  type AdoboProperty,
  type PropertyHistoryV1,
} from "@/lib/adobo-intelligence";
import {
  fieldValue,
  propertyCoverage,
  qualityBuckets,
  qualityInPeriod,
  qualityScore,
  qualityDisplayValue,
  scoreBand,
} from "@/lib/adobo-quality";
import { dealExposure } from "@/lib/deal-exposure";
import { getAdoboHistory } from "@/lib/pulse.functions";
import type { DealDTO } from "@/lib/pulse-types";
import "./AdoboQuality.css";

const money = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
const date = (s: string) => new Date(s).toLocaleString("es-CL", { timeZone: "America/Coyhaique" });
const exposure = (deals: DealDTO[]) => {
  const e = dealExposure(deals);
  return `${money(e.mrr)} MRR potencial${e.unvalued ? ` · ${e.unvalued} sin MRR positivo` : ""}`;
};
type Selection = { label: string; deals: DealDTO[] };
const dimensions: [AdoboProperty, string][] = [
  ["adobo_icp_fit", "Encaje ICP"],
  ["adobo_pain_categoria", "Categoría del dolor"],
  ["adobo_decisor_presente", "Decisor presente"],
  ["adobo_current_timing", "Timing"],
  ["adobo_presupuesto_mencionado", "Presupuesto mencionado"],
  ["adobo_current_urgencia", "Urgencia"],
  ["adobo_next_step_claro", "Próximo paso claro"],
  ["adobo_current_competidor", "Competidor"],
  ["adobo_current_objecion", "Objeción"],
  ["adobo_snapshot_confidence", "Confianza del análisis"],
  ["adobo_last_reu_quality", "Calidad informativa registrada"],
  ["adobo_last_reu_tipo", "Tipo de última reunión registrado"],
  ["adobo_oportunidad_de_mejora", "Oportunidad de mejora"],
  ["adobo_alertas_estado", "Estado de alertas"],
  ["adobo_alertas_riesgo", "Riesgos registrados"],
  ["adobo_tiene_whatsapp_b_api_negociacion", "WhatsApp Business API"],
];

function Bars({
  rows,
  total,
  onSelect,
}: {
  rows: Selection[];
  total: number;
  onSelect: (s: Selection) => void;
}) {
  return (
    <div className="aq-bars">
      {rows.length ? (
        rows.map((row) => (
          <button
            key={row.label}
            onClick={() => onSelect(row)}
            title={`${row.label}: ${row.deals.length} deals · ${exposure(row.deals)}`}
          >
            <span className="aq-bar-label">{row.label}</span>
            <span className="aq-track">
              <span style={{ width: `${total ? (row.deals.length / total) * 100 : 0}%` }} />
            </span>
            <strong>{row.deals.length}</strong>
            <small>{exposure(row.deals)}</small>
          </button>
        ))
      ) : (
        <p className="empty-state">Sin deals en estos filtros.</p>
      )}
    </div>
  );
}

export function AdoboFields({ deal, delivery = false }: { deal: DealDTO; delivery?: boolean }) {
  const groups = delivery ? ADOBO_DELIVERY_GROUPS : ADOBO_COMMERCIAL_GROUPS;
  return (
    <div className="aq-fields">
      {groups.map((group) => (
        <details key={group.name} open={delivery || undefined}>
          <summary>
            {group.name}{" "}
            <small>
              {group.fields.filter(([key]) => fieldValue(deal, key) != null).length}/
              {group.fields.length} con dato
            </small>
          </summary>
          <p>{group.explanation}</p>
          <dl>
            {group.fields.map(([key, label, note]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {qualityDisplayValue(fieldValue(deal, key))}
                  <small>{note}</small>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </div>
  );
}

function DealDetail({
  deal,
  readAt,
  delivery,
}: {
  deal: DealDTO;
  readAt: string;
  delivery: boolean;
}) {
  const [history, setHistory] = useState<PropertyHistoryV1 | null>(null),
    [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  useEffect(() => {
    setHistory(null);
    setState("idle");
  }, [deal.id, readAt]);
  const current = { ...deal, adobo: { ...deal.adobo, propertyHistory: history } };
  const c = evidenceChronology(current, Date.now()),
    f = freshnessReport(deal, readAt, Date.now());
  async function load() {
    setState("loading");
    try {
      const h = await getAdoboHistory({ data: { ids: [deal.id] } });
      setHistory(h[deal.id] ?? null);
      setState("done");
    } catch {
      setState("error");
    }
  }
  return (
    <section className="aq-detail" aria-label={`Detalle de ${deal.name}`}>
      <h3>{deal.name}</h3>
      <p>
        {deal.owner} · {deal.stageFull} · {exposure([deal])}
      </p>
      <a href={deal.url} target="_blank" rel="noopener noreferrer">
        Abrir registro y fuentes en HubSpot ↗
      </a>
      {!delivery && (
        <>
          <p>
            <strong>Score: {qualityScore(deal) ?? "sin dato válido"}</strong> · Última evaluación
            verificada: {f.evaluation ? date(f.evaluation.at) : "pendiente de integración"}
          </p>
          <p className="aq-note">
            La fecha de reunión, la revisión de alertas y el último cambio de score son fechas
            distintas. No hay desglose de puntos verificable integrado; no se reconstruye a partir
            de los campos.
          </p>
          <Button size="sm" variant="outline" disabled={state === "loading"} onClick={load}>
            {state === "loading" ? "Leyendo historial…" : "Consultar cambios de score verificados"}
          </Button>
          {state === "error" && (
            <p role="alert">No se pudo leer el historial. Puedes reintentar.</p>
          )}
          {state === "done" && (
            <div className="aq-chronology">
              {c.partial && (
                <p>Historial parcial; solo se muestran cambios consecutivos verificables.</p>
              )}
              {c.status === "inconsistent" ? (
                <p>
                  La foto actual y el historial no coinciden. Actualiza el reporte para conciliar.
                </p>
              ) : c.transitions.length ? (
                <>
                  <svg
                    viewBox="0 0 600 130"
                    role="img"
                    aria-label="Cambios consecutivos de score; escala de 0 a 100"
                  >
                    <text x="0" y="15">
                      100
                    </text>
                    <text x="0" y="118">
                      0
                    </text>
                    {c.transitions.map((t, i) => {
                      const x = 40 + (i * 540) / c.transitions.length,
                        w = 480 / c.transitions.length;
                      return (
                        <g key={t.at}>
                          <title>
                            {date(t.at)}: {t.from} → {t.to}
                          </title>
                          <line x1={x} y1={115 - t.from} x2={x + w} y2={115 - t.to} />
                          <circle cx={x + w} cy={115 - t.to} r="4" />
                        </g>
                      );
                    })}
                  </svg>
                  <ol>
                    {c.transitions.map((t) => (
                      <li key={t.at}>
                        <strong>
                          {t.from} → {t.to}
                        </strong>{" "}
                        · {date(t.at)} · origen {t.sourceType ?? "no informado"}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p>
                  {c.status === "unchanged"
                    ? "Sin cambios en el historial disponible."
                    : "Sin historial verificable disponible."}
                </p>
              )}
              <p className="aq-note">
                Segmentos por cambio registrado, separados para no unir huecos. No es una serie
                diaria ni un historial completo de reuniones.
              </p>
            </div>
          )}
        </>
      )}
      <AdoboFields deal={deal} delivery={delivery} />
    </section>
  );
}

export function AdoboQuality({
  deals,
  readAt,
  view = "health",
  year,
  quarter,
  delivery = false,
}: {
  deals: DealDTO[];
  readAt: string;
  view?: "health" | "coverage";
  year: string;
  quarter: string;
  delivery?: boolean;
}) {
  const [selection, setSelection] = useState<Selection | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [dimension, setDimension] = useState<AdoboProperty>(
    delivery ? "adobo_handoff_ready" : "adobo_icp_fit",
  );
  const [search, setSearch] = useState("");
  const generation = useRef(0);
  const origin = useRef<HTMLElement | null>(null);
  const [changes, setChanges] = useState<Selection[] | null>(null),
    [loading, setLoading] = useState(false),
    [historyError, setHistoryError] = useState(false);
  useEffect(() => {
    generation.current++;
    setLoading(false);
    setSelection(null);
    setSelectedId(null);
    setChanges(null);
    setSearch("");
    return () => {
      generation.current++;
    };
  }, [deals, readAt, year, quarter]);
  const choose = (s: Selection) => {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelection(s);
    setSelectedId(null);
    setSearch("");
  };
  const list = (selection?.deals ?? []).filter((d) =>
    `${d.name} ${d.owner} ${d.stageFull}`.toLowerCase().includes(search.toLowerCase()),
  );
  const detail = selection?.deals.find((d) => d.id === selectedId);
  const coverage = propertyCoverage(deals),
    scored = deals.filter((d) => qualityScore(d) != null);
  const average = scored.length
    ? scored.reduce((s, d) => s + qualityScore(d)!, 0) / scored.length
    : null;
  const availableDimensions = delivery
    ? ADOBO_DELIVERY_GROUPS.flatMap((g) =>
        g.fields.map(([key, label]) => [key, label] as [AdoboProperty, string]),
      )
    : dimensions;
  async function loadChanges() {
    const request = generation.current;
    setLoading(true);
    setHistoryError(false);
    try {
      const groups: Selection[] = [
        { label: "Subieron", deals: [] },
        { label: "Bajaron", deals: [] },
        { label: "Sin cambios verificados en el período", deals: [] },
        { label: "Sin comparación verificable", deals: [] },
      ];
      for (let i = 0; i < deals.length; i += 50) {
        const batch = deals.slice(i, i + 50),
          h = await getAdoboHistory({ data: { ids: batch.map((d) => d.id) } });
        if (request !== generation.current) return;
        for (const d of batch) {
          const c = evidenceChronology(
            { ...d, adobo: { ...d.adobo, propertyHistory: h[d.id] ?? null } },
            Date.now(),
          );
          const ts =
            c.status === "inconsistent"
              ? []
              : c.transitions.filter((t) => qualityInPeriod(t.at, year, quarter));
          if (ts.some((t) => t.to > t.from)) groups[0]!.deals.push(d);
          if (ts.some((t) => t.to < t.from)) groups[1]!.deals.push(d);
          if (c.status === "missing" || c.status === "inconsistent") groups[3]!.deals.push(d);
          else if (!ts.length) groups[2]!.deals.push(d);
        }
      }
      if (request === generation.current) setChanges(groups);
    } catch {
      if (request === generation.current) {
        setHistoryError(true);
        setChanges(null);
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  return (
    <section
      className="adobo-quality"
      aria-label={delivery ? "Handoff y portal" : "Inteligencia comercial Adobo"}
    >
      <header className="aq-heading">
        <div>
          <span className="eyebrow">
            {delivery ? "Proyectos ganados" : "Adobo · estado actual"}
          </span>
          <h2>
            {delivery ? "Handoff y portal" : "De la salud del equipo a la evidencia del deal"}
          </h2>
        </div>
        <small>Lectura CRM: {date(readAt)}</small>
      </header>
      <p className="aq-note">
        {delivery
          ? "Proyectos ganados del período y filtros seleccionados."
          : "Todos los deals activos de Comercial Adereso en los filtros de comercial, rol y etapa; sin recorte por fecha de cierre o de reunión."}{" "}
        Los gráficos muestran propiedades registradas, no acreditan su vigencia. Cada barra abre sus
        deals exactos.
      </p>
      {view === "health" && (
        <>
          <div className="aq-metrics">
            {[
              {
                label: delivery ? "Proyectos" : "Deals activos",
                value: String(deals.length),
                rows: deals,
              },
              ...(delivery
                ? []
                : [
                    {
                      label: "Con score válido",
                      value: `${scored.length}/${deals.length}`,
                      rows: scored,
                    },
                    {
                      label: "Sin score válido",
                      value: String(deals.length - scored.length),
                      rows: deals.filter((d) => qualityScore(d) == null),
                    },
                  ]),
            ].map((m) => (
              <button key={m.label} onClick={() => choose({ label: m.label, deals: m.rows })}>
                <span>{m.label}</span>
                <strong>{m.value}</strong>
                <small>{exposure(m.rows)}</small>
              </button>
            ))}
          </div>
          {!delivery && (
            <p className="aq-insight">
              De {deals.length} deals activos, {scored.length} tienen score válido (
              {deals.length ? Math.round((scored.length / deals.length) * 100) : 0}%). En{" "}
              {deals.filter((d) => fieldValue(d, "adobo_next_step_claro") == null).length} no está
              registrado si el próximo paso es claro. Prioriza validar esos datos antes de
              interpretar el score como salud completa.
            </p>
          )}
          <div className="aq-columns">
            {!delivery && (
              <article className="aq-panel">
                <h3>Distribución de Adobo Score</h3>
                <p>
                  Media entre {scored.length} scores válidos:{" "}
                  {average == null ? "sin dato" : average.toFixed(1)} / 100. No es probabilidad de
                  cierre.
                </p>
                <Bars
                  rows={qualityBuckets(deals, scoreBand)}
                  total={deals.length}
                  onSelect={choose}
                />
              </article>
            )}
            <article className="aq-panel">
              <label className="aq-dimension">
                Analizar propiedad
                <select
                  value={dimension}
                  onChange={(e) => setDimension(e.target.value as AdoboProperty)}
                >
                  {availableDimensions.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <Bars
                rows={qualityBuckets(deals, (d) => qualityDisplayValue(fieldValue(d, dimension)))}
                total={deals.length}
                onSelect={choose}
              />
            </article>
          </div>
          <article className="aq-panel">
            <h3>De equipo a comercial</h3>
            <Bars
              rows={qualityBuckets(deals, (d) => d.owner || "Sin comercial")}
              total={deals.length}
              onSelect={choose}
            />
          </article>
          {!delivery && (
            <details className="aq-panel">
              <summary>
                Movimientos verificados de score · {year} {quarter === "all" ? "" : `Q${quarter}`}
              </summary>
              <p>
                Entre los deals activos de esta vista, por fecha real del cambio. Un deal puede
                subir y bajar en el mismo período. El historial es acotado; ausencia de cambios no
                demuestra estabilidad.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || !deals.length}
                onClick={loadChanges}
              >
                {loading ? "Consultando cambios…" : "Consultar movimientos del período"}
              </Button>
              {historyError && (
                <p role="alert">Lectura incompleta. No se publicaron totales; vuelve a intentar.</p>
              )}
              {changes && <Bars rows={changes} total={deals.length} onSelect={choose} />}
            </details>
          )}
        </>
      )}
      {view === "coverage" && (
        <>
          <p className="aq-note">
            Cobertura de campos, no calidad del comercial: un valor registrado no implica evaluación
            vigente. Los campos condicionales vacíos no se interpretan como «no». Última evaluación
            y desglose del score: pendientes de integración de una fuente verificable.
          </p>
          {coverage.map((group) => (
            <article className="aq-panel" key={group.name}>
              <h3>{group.name}</h3>
              <div className="aq-coverage">
                {group.fields.map((f) => (
                  <div key={f.key}>
                    <strong>{f.label}</strong>
                    <span className="aq-track">
                      <span
                        style={{
                          width: `${deals.length ? (f.present.length / deals.length) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <button
                      aria-label={`${f.label}: ${f.present.length} con dato`}
                      onClick={() => choose({ label: `${f.label} · con dato`, deals: f.present })}
                    >
                      {f.present.length} con dato
                    </button>
                    <button
                      aria-label={`${f.label}: ${f.missing.length} sin dato`}
                      onClick={() => choose({ label: `${f.label} · sin dato`, deals: f.missing })}
                    >
                      {f.missing.length} sin dato
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </>
      )}
      <Dialog
        open={selection != null}
        onOpenChange={(v) => {
          if (!v) {
            setSelection(null);
            setSelectedId(null);
          }
        }}
      >
        <DialogContent
          className="aq-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            origin.current?.focus();
          }}
        >
          <DialogTitle>{selection?.label}</DialogTitle>
          <DialogDescription>
            {selection?.deals.length ?? 0} deals · {exposure(selection?.deals ?? [])} ·{" "}
            {delivery ? "período seleccionado" : "foto actual"}
          </DialogDescription>
          {detail ? (
            <>
              <Button variant="ghost" onClick={() => setSelectedId(null)}>
                ← Volver a los deals
              </Button>
              <DealDetail
                key={`${detail.id}/${readAt}`}
                deal={detail}
                readAt={readAt}
                delivery={delivery}
              />
            </>
          ) : (
            <>
              <label>
                Buscar deal o comercial
                <input
                  className="aq-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="aq-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Deal</th>
                      <th>Comercial</th>
                      <th>Etapa</th>
                      <th>MRR</th>
                      {!delivery && <th>Score</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <button onClick={() => setSelectedId(d.id)}>{d.name} ↗</button>
                        </td>
                        <td>{d.owner}</td>
                        <td>{d.stageFull}</td>
                        <td>{money(d.amountValue)}</td>
                        {!delivery && <td>{qualityScore(d) ?? "Sin dato"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!list.length && <p className="empty-state">Sin deals en esta selección.</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
