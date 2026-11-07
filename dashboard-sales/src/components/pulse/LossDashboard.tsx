import { useMemo, useState } from "react";
import { DealModal } from "./DealModal";
import { Metric } from "./PulseDashboard";
import { CompactFilterBar } from "./FilterBar";
import {
  HBars,
  SectionTitle,
  StackedTrend,
  Legend,
  median,
  money,
  pct,
  shortPeriod,
  sum,
  useAgo,
  useInsightFilters,
} from "./insights-shared";
import type { Drilldown } from "@/lib/pulse-types";
import type { InsightDeal, InsightsReport } from "@/lib/insights-types";
import { roleOfOwner } from "@/lib/owner-roles";

const STAGE_ORDER = ["E1", "E2", "E3", "E3.1", "E4", "E5", "E5.1", "Sin recorrido"];

/** Inbound/outbound según la fuente de creación del deal. */
const channelOf = (deal: InsightDeal): "Inbound" | "Outbound" | "Otros" => {
  const source = (deal.sourceLabel ?? "").toLowerCase();
  if (source.includes("inbound")) return "Inbound";
  if (source.includes("prospecci") || source.includes("sdr")) return "Outbound";
  return "Otros";
};

/** Recomendaciones breves según la objeción registrada por Adobo. */
const OBJECTION_TIPS: [RegExp, string][] = [
  [/precio|caro|presupuesto|budget/, "Anclar valor y ROI antes de hablar de precio; validar presupuesto desde E2."],
  [/competencia|competidor/, "Usar battlecards y casos de éxito del segmento; pedir la comparativa temprano."],
  [/timing|tiempo|momento|prioridad/, "Crear urgencia con costo de no actuar y plan de implementación fechado."],
  [/autoridad|decisor/, "Mapear decisores desde E2 y agendar reunión con quien firma."],
  [/confianza|seguridad|riesgo/, "Reforzar referencias, seguridad y SLA; involucrar preventa."],
  [/fit|encaje|necesidad/, "Revisar el fit real: mejor descartar rápido y enfocar energía en deals sanos."],
];
const objectionTip = (label: string) => {
  const norm = label.toLowerCase();
  const found = OBJECTION_TIPS.find(([match]) => match.test(norm));
  return found?.[1] ?? "Revisar el discovery de estos deals y documentar la objeción desde la primera reunión.";
};

/** Mínimos de actividad esperados antes de dar por perdido un deal. */
const GHOST_MIN = { emails: 2, calls: 2, whatsapp: 2 };
const ghostBreaches = (deal: InsightDeal) => {
  if (!deal.ghost) return [];
  const out: string[] = [];
  if (deal.ghost.emails < GHOST_MIN.emails) out.push(`${deal.ghost.emails}/${GHOST_MIN.emails} correos`);
  if (deal.ghost.calls < GHOST_MIN.calls) out.push(`${deal.ghost.calls}/${GHOST_MIN.calls} llamadas`);
  if (deal.ghost.whatsapp != null && deal.ghost.whatsapp < GHOST_MIN.whatsapp) out.push(`${deal.ghost.whatsapp}/${GHOST_MIN.whatsapp} WhatsApp`);
  return out;
};

export function LossDashboard({
  report,
  onRefresh,
  isRefreshing,
  tabs,
  role = "all",
  onRole,
}: {
  report: InsightsReport;
  onRefresh: () => void;
  isRefreshing: boolean;
  tabs: React.ReactNode;
  role?: "all" | "AE" | "KAM";
  onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const ago = useAgo(report.generatedAt);
  const filters = useInsightFilters(report, undefined, role, onRole);
  const roleOwnerOptions = useMemo(
    () =>
      report.owners
        .filter((owner) => role === "all" || roleOfOwner(owner.id) === role)
        .map((owner) => [owner.id, owner.name] as [string, string]),
    [report.owners, role],
  );
  const [drill, setDrill] = useState<Drilldown | null>(null);
  const [stageFilter, setStageFilter] = useState<string[]>([]);

  const open = (title: string, subtitle: string, deals: InsightDeal[]) =>
    setDrill({ title, subtitle, deals });

  const lost = useMemo(() => filters.deals.filter((deal) => deal.status === "lost"), [filters.deals]);
  const won = useMemo(() => filters.deals.filter((deal) => deal.status === "won"), [filters.deals]);
  const lostAmount = sum(lost, (d) => d.amountValue);
  const wr = won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0;

  const group = <T extends string>(pick: (deal: InsightDeal) => T) => {
    const map = new Map<string, InsightDeal[]>();
    for (const deal of lost) {
      const key = pick(deal) || "Sin registro";
      map.set(key, [...(map.get(key) ?? []), deal]);
    }
    return [...map.entries()]
      .map(([key, deals]) => ({
        key,
        deals,
        count: deals.length,
        amount: sum(deals, (d) => d.amountValue),
        days: median(deals.map((d) => d.lostStageDays).filter((v) => v > 0)),
      }))
      .sort((a, b) => b.count - a.count);
  };

  const reasons = useMemo(
    () =>
      group((deal) => deal.lostReason ?? "Sin motivo listado").sort(
        (a, b) => b.amount - a.amount || b.count - a.count,
      ),
    [lost],
  );
  const objections = useMemo(
    () =>
      group((deal) => deal.objection ?? "Sin objeción registrada").sort(
        (a, b) => b.amount - a.amount || b.count - a.count,
      ),
    [lost],
  );
  const ghostDeals = useMemo(
    () => lost.filter((deal) => deal.ghost),
    [lost],
  );
  const coveredGhostDeals=ghostDeals.filter(deal=>deal.ghost && deal.ghost.whatsapp!==null);
  const ghostWarn = useMemo(() => ghostDeals.filter((deal) => ghostBreaches(deal).length > 0), [ghostDeals]);
  const highScoreLost = useMemo(
    () => lost.filter((deal) => deal.adoboScoreValue > 60).sort((a, b) => b.adoboScoreValue - a.adoboScoreValue),
    [lost],
  );
  const highScoreStages = useMemo(() => {
    const rows = group((deal) => (highScoreLost.includes(deal) ? deal.lostStage : "__skip__"))
      .filter((row) => row.key !== "__skip__");
    return rows.sort((a, b) => STAGE_ORDER.indexOf(a.key) - STAGE_ORDER.indexOf(b.key));
  }, [lost, highScoreLost]);
  const lostInbound = useMemo(() => lost.filter((deal) => channelOf(deal) === "Inbound"), [lost]);
  const lostOutbound = useMemo(() => lost.filter((deal) => channelOf(deal) === "Outbound"), [lost]);
  const lostOtherChannel = useMemo(() => lost.filter((deal) => channelOf(deal) === "Otros"), [lost]);
  const texts = useMemo(
    () =>
      group((deal) => {
        const raw = (deal.lostReasonText ?? "").trim();
        if (!raw) return "Sin comentario";
        const norm = raw.slice(0, 90).toLowerCase();
        return norm.charAt(0).toUpperCase() + norm.slice(1);
      }),
    [lost],
  );
  const stages = useMemo(() => {
    const rows = group((deal) => deal.lostStage);
    return [...rows].sort(
      (a, b) => STAGE_ORDER.indexOf(a.key) - STAGE_ORDER.indexOf(b.key),
    );
  }, [lost]);
  const byOwner = useMemo(() => group((deal) => deal.owner), [lost]);
  const bySize = useMemo(() => group((deal) => deal.sizeBucket), [lost]);
  const bySource = useMemo(() => group((deal) => deal.sourceLabel), [lost]);

  const trend = useMemo(
    () =>
      report.periods
        .filter((period) => (filters.quarter === "all" ? period.startsWith(`${filters.year}-`) : true))
        .map((period) => {
          const rows = report.deals.filter(
            (deal) =>
              deal.status === "lost" &&
              deal.period === period &&
              (filters.ownerId === "team" || deal.ownerId === filters.ownerId),
          );
          return {
            period,
            a: sum(rows.filter((deal) => deal.family === "Expansión"), (d) => d.amountValue),
            b: sum(rows.filter((deal) => deal.family !== "Expansión"), (d) => d.amountValue),
          };
        }),
    [report.deals, report.periods, filters.year, filters.quarter, filters.ownerId],
  );

  const worstReason = reasons[0];
  const lateLost = lost.filter((deal) => deal.lostStage === "E5" || deal.lostStage === "E5.1");

  return (
    <main className="pulse-main">
      {tabs}
      <header className="team-header">
        <div>
          <h1 className="pulse-h1">Análisis de Deals Perdidos</h1>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            Motivos listados y de texto, etapa donde se pierde, tiempo en etapa, monto y patrón por comercial
          </div>
        </div>
      </header>

      <CompactFilterBar
        years={report.years}
        quarters={filters.quartersAvailable}
        owners={roleOwnerOptions}
        year={filters.year}
        quarter={filters.quarter}
        ownerId={filters.ownerId}
        stages={stageFilter}
        onYear={filters.setYear}
        onQuarter={filters.setQuarter}
        onOwner={filters.setOwnerId}
        onStages={setStageFilter}
        role={role}
        onRole={(item) => {
          onRole?.(item);
          filters.setOwnerId("team");
        }}
        ago={ago}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        label="Filtros de deals perdidos"
      />

      <SectionTitle note={filters.rangeLabel}>Resumen de pérdidas</SectionTitle>
      <section className="grid-4">
        <Metric
          label="Deals perdidos"
          value={String(lost.length)}
          note={`${money(lostAmount)} de MRR no capturado`}
          tone={lost.length ? "bad" : "ok"}
          onClick={() => open("Deals perdidos", filters.rangeLabel, lost)}
          tooltip="Deals con etapa de pérdida y fecha de cierre dentro del rango seleccionado."
        />
        <Metric
          label="Win rate del rango"
          value={`${Math.round(wr)}% (${won.length}/${won.length + lost.length})`}
          note={`ganados ${won.length} · perdidos ${lost.length}`}
          tone={wr >= 35 ? "ok" : wr >= 20 ? "warn" : "bad"}
          tooltip="Ganados sobre el total de deals cerrados en el rango."
        />
        <Metric
          label="Perdidos en etapa tardía"
          value={String(lateLost.length)}
          note={`${money(sum(lateLost, (d) => d.amountValue))} · E5 y E5.1`}
          tone={lateLost.length ? "warn" : "ok"}
          onClick={() => open("Perdidos en E5 / E5.1", "pérdidas tardías, las más costosas", lateLost)}
          tooltip="Deals perdidos después de llegar a negociación o contrato: el costo de oportunidad es mayor."
        />
        <Metric
          label="Motivo dominante"
          value={worstReason ? worstReason.key : "s/d"}
          note={worstReason ? `${worstReason.count} deals · ${money(worstReason.amount)}` : "sin motivos"}
          tone="bad"
          onClick={() => worstReason && open(worstReason.key, "motivo dominante", worstReason.deals)}
          tooltip="Motivo principal de cierre perdido (lista de opciones) con mayor monto asociado en el rango."
        />
        <Metric
          label="Perdidos inbound"
          value={String(lostInbound.length)}
          note={`${money(sum(lostInbound, (d) => d.amountValue))} · forms de contacto inbound`}
          tone="neutral"
          onClick={() => open("Perdidos · inbound", "fuente: forms de contacto inbound (Adereso/Cassper)", lostInbound)}
          tooltip="Deals perdidos cuya fuente de creación es un form de contacto inbound (Adereso o Cassper)."
        />
        <Metric
          label="Perdidos outbound"
          value={String(lostOutbound.length)}
          note={`${money(sum(lostOutbound, (d) => d.amountValue))} · prospección SDR`}
          tone="neutral"
          onClick={() => open("Perdidos · outbound", "fuente: prospección SDR (Adereso/Cassper)", lostOutbound)}
          tooltip="Deals perdidos cuya fuente de creación es prospección SDR (Adereso o Cassper)."
        />
        <Metric
          label="Score alto perdidos"
          value={String(highScoreLost.length)}
          note={
            highScoreLost.length
              ? `${money(sum(highScoreLost, (d) => d.amountValue))} · Adobo score sobre 60`
              : "ninguno con score >60"
          }
          tone={highScoreLost.length ? "bad" : "ok"}
          onClick={() => open("Score alto perdidos", "Adobo score > 60 que terminaron perdidos", highScoreLost)}
          tooltip="Deals con Adobo score sobre 60 que igual se perdieron: duelen más porque el análisis los daba por buenos."
        />
      </section>

      <SectionTitle note="deals perdidos por ghosting · mínimo esperado: 2 correos, 2 llamadas y 2 WhatsApp">
        Ghosting y actividad de cierre
      </SectionTitle>
      {!ghostDeals.length ? (
        <div className="empty-state" style={{ marginBottom: 20 }}>
          Sin deals perdidos por ghosting en el rango, o aún sin actividades sincronizadas.
        </div>
      ) : (
        <>
          <section className="grid-4">
            <Metric
              label="Perdidos por ghosting"
              value={String(ghostDeals.length)}
              note={money(sum(ghostDeals, (d) => d.amountValue))}
              tone={ghostDeals.length ? "warn" : "ok"}
              onClick={() => open("Perdidos · ghosting", filters.rangeLabel, ghostDeals)}
              tooltip="Deals perdidos cuyo motivo (listado o comentario) menciona ghosting."
            />
            <Metric
              label="Con poca actividad"
              value={String(ghostWarn.length)}
              note={`bajo el mínimo 2/2/2 · cobertura ${coveredGhostDeals.length}/${ghostDeals.length}`}
              tone={ghostWarn.length ? "bad" : "ok"}
              onClick={() =>
                open("Ghosting con poca actividad", "no cumplen 2 correos + 2 llamadas + 2 WhatsApp", ghostWarn)
              }
              tooltip="Deals perdidos por ghosting que no alcanzan el mínimo de 2 correos, 2 llamadas y 2 WhatsApp registrados en HubSpot."
            />
            <Metric
              label="Correos prom."
              value={
                coveredGhostDeals.length
                  ? (sum(coveredGhostDeals, (d) => d.ghost?.emails ?? 0) / coveredGhostDeals.length).toFixed(1)
                  : "s/n"
              }
              note="por deal perdido por ghosting"
              tone="neutral"
              tooltip="Promedio de correos asociados al deal antes de perderlo por ghosting."
            />
            <Metric
              label="Llamadas + WhatsApp prom."
              value={
                coveredGhostDeals.length
                  ? (
                      sum(coveredGhostDeals, (d) => (d.ghost?.calls ?? 0) + (d.ghost?.whatsapp ?? 0)) /
                      coveredGhostDeals.length
                    ).toFixed(1)
                  : "s/n"
              }
              note="por deal perdido por ghosting"
              tone="neutral"
              tooltip="Promedio de llamadas más mensajes de WhatsApp asociados al deal antes de perderlo por ghosting."
            />
          </section>
          <div className="table-wrap">
            <table className="pulse-table">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Comercial</th>
                  <th>Monto</th>
                  <th>Correos</th>
                  <th>Llamadas</th>
                  <th>WhatsApp</th>
                  <th>Alerta</th>
                </tr>
              </thead>
              <tbody>
                {ghostDeals.map((deal) => {
                  const breaches = ghostBreaches(deal);
                  return (
                    <tr key={deal.id}>
                      <td>
                        <a href={deal.url} target="_blank" rel="noreferrer">
                          {deal.name}
                        </a>
                      </td>
                      <td>{deal.owner}</td>
                      <td>{money(deal.amountValue)}</td>
                      <td>{deal.ghost?.emails ?? "s/d"}</td>
                      <td>{deal.ghost?.calls ?? "s/d"}</td>
                      <td>{deal.ghost?.whatsapp ?? "s/d"}</td>
                      <td>
                        {!deal.ghost || deal.ghost.whatsapp == null ? <span className="chip">Cobertura sin verificar</span> : breaches.length ? (
                          <span className="chip" data-tone="bad">
                            falta: {breaches.join(" · ")}
                          </span>
                        ) : (
                          <span className="chip" data-tone="ok">
                            seguimiento completo
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="split-2" style={{ marginTop: 20 }}>
        <div className="rep-chart">
          <span className="metric-label">Motivos listados (monto perdido)</span>
          <HBars
            data={reasons.map((row) => ({
              key: row.key,
              label: row.key,
              value: row.amount,
              note: `${row.count} deals`,
              tone: "bad",
            }))}
            onSelect={(key) => {
              const row = reasons.find((item) => item.key === key);
              if (row) open(`Perdidos · ${key}`, filters.rangeLabel, row.deals);
            }}
          />
        </div>
        <div className="rep-chart">
          <span className="metric-label">Evolución del monto perdido</span>
          <Legend items={[{ label: "Expansión", kind: "exp" }, { label: "Venta nueva / otros", kind: "new" }]} />
          <StackedTrend
            data={trend}
            onSelect={(period) =>
              open(
                `Perdidos ${shortPeriod(period)}`,
                filters.ownerName,
                report.deals.filter(
                  (deal) =>
                    deal.status === "lost" &&
                    deal.period === period &&
                    (filters.ownerId === "team" || deal.ownerId === filters.ownerId),
                ),
              )
            }
          />
        </div>
      </div>

      <SectionTitle note="objeciones registradas por Adobo en deals perdidos · ordenadas por MRR perdido">
        Objeciones típicas y qué mejorar
      </SectionTitle>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Objeción</th>
              <th>Deals</th>
              <th>MRR perdido</th>
              <th>% del total</th>
              <th>Recomendación</th>
            </tr>
          </thead>
          <tbody>
            {objections.map((row) => (
              <tr key={row.key}>
                <td>
                  <strong>{row.key}</strong>
                </td>
                <td>
                  <button
                    className="cell-button"
                    type="button"
                    onClick={() => open(`Perdidos · ${row.key}`, "objeción registrada por Adobo", row.deals)}
                  >
                    {row.count}
                  </button>
                </td>
                <td>{money(row.amount)}</td>
                <td>{pct(lostAmount ? (row.amount / lostAmount) * 100 : 0)}</td>
                <td style={{ maxWidth: 420 }}>{row.key === "Sin objeción registrada" ? "Poblar adobo_current_objecion en los deals para activar este análisis." : objectionTip(row.key)}</td>
              </tr>
            ))}
            {!objections.length ? (
              <tr>
                <td colSpan={5}>Sin objeciones registradas en el rango.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <SectionTitle note="dónde y cuándo se cae el deal">Etapa de pérdida y tiempo en etapa</SectionTitle>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Etapa alcanzada</th>
              <th>Deals perdidos</th>
              <th>Monto</th>
              <th>Ticket</th>
              <th>Mediana de días en la etapa</th>
              <th>% del total</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((row) => (
              <tr key={row.key}>
                <td>
                  <strong>{row.key}</strong>
                </td>
                <td>
                  <button
                    className="cell-button"
                    type="button"
                    onClick={() => open(`Perdidos en ${row.key}`, filters.rangeLabel, row.deals)}
                  >
                    {row.count}
                  </button>
                </td>
                <td>{money(row.amount)}</td>
                <td>{money(row.count ? Math.round(row.amount / row.count) : 0)}</td>
                <td>{row.days ? `${row.days} d` : "s/d"}</td>
                <td>{pct(lost.length ? (row.count / lost.length) * 100 : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {highScoreLost.length ? (
        <>
          <SectionTitle note="Adobo score > 60 que igual se perdieron · desde qué etapa venían">
            Score alto que se fue a pérdida
          </SectionTitle>
          <div className="rep-chart">
            <HBars
              data={highScoreStages.map((row) => ({
                key: row.key,
                label: row.key,
                value: row.amount,
                note: `${row.count} deals`,
                tone: "bad",
              }))}
              onSelect={(key) => {
                const row = highScoreStages.find((item) => item.key === key);
                if (row) open(`Score alto perdidos · ${key}`, "etapa activa antes de la pérdida", row.deals);
              }}
            />
          </div>
        </>
      ) : null}

      <SectionTitle note="patrón por comercial, tamaño y fuente">Cortes de análisis</SectionTitle>
      <div className="split-2">
        <div className="rep-chart">
          <span className="metric-label">Monto perdido por comercial</span>
          <HBars
            data={byOwner.map((row) => ({
              key: row.key,
              label: row.key,
              value: row.amount,
              note: `${row.count} deals`,
              tone: "bad",
            }))}
            onSelect={(key) => {
              const row = byOwner.find((item) => item.key === key);
              if (row) open(`Perdidos · ${key}`, filters.rangeLabel, row.deals);
            }}
          />
        </div>
        <div className="rep-chart">
          <span className="metric-label">Monto perdido por tamaño de empresa</span>
          <HBars
            data={bySize.map((row) => ({
              key: row.key,
              label: row.key,
              value: row.amount,
              note: `${row.count} deals`,
              tone: "warn",
            }))}
            onSelect={(key) => {
              const row = bySize.find((item) => item.key === key);
              if (row) open(`Perdidos · ${key}`, filters.rangeLabel, row.deals);
            }}
          />
        </div>
      </div>

      <div className="rep-chart" style={{ marginTop: 20 }}>
        <span className="metric-label">Monto perdido por fuente de creación</span>
        <HBars
          data={bySource.map((row) => ({
            key: row.key,
            label: row.key,
            value: row.amount,
            note: `${row.count} deals`,
            tone: "warn",
          }))}
          onSelect={(key) => {
            const row = bySource.find((item) => item.key === key);
            if (row) open(`Perdidos · ${key}`, filters.rangeLabel, row.deals);
          }}
        />
      </div>

      <SectionTitle note="texto libre registrado por el comercial">Comentarios de cierre perdido</SectionTitle>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Comentario</th>
              <th>Deals</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {texts.slice(0, 20).map((row) => (
              <tr key={row.key}>
                <td>{row.key}</td>
                <td>
                  <button
                    className="cell-button"
                    type="button"
                    onClick={() => open("Perdidos", row.key, row.deals)}
                  >
                    {row.count}
                  </button>
                </td>
                <td>{money(row.amount)}</td>
              </tr>
            ))}
            {!texts.length ? (
              <tr>
                <td colSpan={3}>Sin comentarios registrados en el rango.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <DealModal payload={drill} onClose={() => setDrill(null)} initialStages={stageFilter} />
    </main>
  );
}
