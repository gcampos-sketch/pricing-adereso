import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronRight, RefreshCw } from "lucide-react";
import { getDealActivityAnalysis } from "@/lib/deal-activity-analysis.functions";
import {
  ACTIVITY_CHANNELS,
  activityChannels,
  activityByActor,
  isUnconfirmedWhatsApp,
  observeActivity,
  summarizeActivity,
  type ActivityChannel,
  type ActivityDeal,
  type ActivityObservation,
  type ActivityOutcome,
  type ActivityReport,
  type ActivityWindow,
} from "@/lib/deal-activity-analysis";
import { roleOfOwner, type RoleFilter } from "@/lib/owner-roles";
import "./DealActivityAnalysis.css";

const outcomes = { active: "Activos", won: "Ganados", lost: "Perdidos" } as const;
const dimensions = {
  stage: "Etapa",
  owner: "Comercial del deal",
  industry: "Industria",
  segment: "Segmento",
  lossReason: "Motivo de pérdida",
  lossType: "Tipo de pérdida",
} as const;
type Dimension = keyof typeof dimensions;
type Scope = {
  year: string;
  quarter: string;
  role: RoleFilter;
  owner: string;
  segment: string;
  readAt: string;
};
const segments: Record<string, string> = {
  inbound: "Inbound",
  outbound: "Outbound",
  upsell: "Upsell",
  crossSell: "Cross sell",
};
const number = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const format = (value: number | null) => (value === null ? "—" : number.format(value));
const date = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Coyhaique",
});

function groupRows(rows: ActivityObservation[], dimension: Dimension) {
  const groups = new Map<string, { label: string; rows: ActivityObservation[] }>();
  for (const row of rows) {
    const label = row.deal[dimension];
    const key = dimension === "owner" ? row.deal.ownerId : label;
    const group = groups.get(key) ?? { label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...group, ...summarizeActivity(group.rows) }))
    .sort((a, b) => b.deals - a.deals || a.label.localeCompare(b.label));
}

export function DealActivityAnalysis(scope: Scope) {
  const { year, quarter, readAt } = scope;
  const queryKey = ["deal-activity-analysis", year, quarter, readAt];
  const client = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: () => getDealActivityAnalysis({ data: { year, quarter } }),
    staleTime: 90_000,
    retry: false,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const { data, refetch } = query;
  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(false);
    try {
      const updated = await getDealActivityAnalysis({ data: { year, quarter, fresh: true } });
      client.setQueryData(queryKey, updated);
    } catch {
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  };
  if (!data)
    return (
      <div className="activity-analysis activity-status" role="status">
        {query.isPending ? (
          "Leyendo las actividades asociadas a los negocios en HubSpot…"
        ) : (
          <>
            No pudimos leer la población comercial.{" "}
            <button type="button" onClick={() => void refetch()}>
              Reintentar
            </button>
          </>
        )}
      </div>
    );
  return (
    <div className="activity-analysis">
      <div className="activity-source">
        <span>HubSpot · {date.format(data.readAt)}</span>
        <button type="button" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw size={14} aria-hidden="true" />{" "}
          {refreshing ? "Actualizando…" : "Actualizar actividades"}
        </button>
        {refreshError && (
          <span role="status">Falló la actualización. Sigue visible la última lectura.</span>
        )}
      </div>
      <ActivityExplorer
        key={JSON.stringify([year, quarter, scope.owner, scope.role, scope.segment])}
        report={data}
        scope={scope}
      />
    </div>
  );
}

function ActivityExplorer({ report, scope }: { report: ActivityReport; scope: Scope }) {
  const [outcome, setOutcome] = useState<ActivityOutcome>("active");
  const [window, setWindow] = useState<ActivityWindow>("recent");
  const [channel, setChannel] = useState<ActivityChannel | "all">("all");
  const [dimension, setDimension] = useState<Dimension>("stage");
  const [path, setPath] = useState<{ dimension: Dimension; key: string; label: string }[]>([]);
  const [actorId, setActorId] = useState<string | null>(null);
  const [zeroOnly, setZeroOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const channels = useMemo(() => (channel === "all" ? activityChannels : [channel]), [channel]);
  const matchesScope = (deal: Pick<ActivityDeal, "ownerId" | "segment">) =>
    (scope.owner === "team" || scope.owner === deal.ownerId) &&
    (scope.role === "all" || scope.role === roleOfOwner(deal.ownerId)) &&
    (!segments[scope.segment] || segments[scope.segment] === deal.segment);
  const deals = report.deals.filter(matchesScope);
  const undated = report.undated.filter(matchesScope);
  const resetList = () => {
    setLimit(20);
    setSearch("");
    setActorId(null);
    setZeroOnly(false);
  };
  const selectOutcome = (next: ActivityOutcome) => {
    if (next === outcome) return;
    setOutcome(next);
    if (window === "stage") setWindow("all");
    if ((dimension === "lossReason" || dimension === "lossType") && next !== "lost")
      setDimension("stage");
    setPath([]);
    resetList();
  };
  const matchesPath = (deal: ActivityDeal) =>
    path.every(
      (item) => (item.dimension === "owner" ? deal.ownerId : deal[item.dimension]) === item.key,
    );
  const cohort = deals.filter((deal) => deal.outcome === outcome && matchesPath(deal));
  const rows = cohort.map((deal) => observeActivity(deal, report, channels, window));
  const summary = summarizeActivity(rows);
  const actors = activityByActor(rows);
  const unconfirmedWhatsApp = actors.reduce((total, actor) => total + actor.unconfirmedWhatsApp, 0);
  const actor = actors.find((row) => row.id === actorId);
  const groups = groupRows(rows, dimension);
  const reasons = outcome === "lost" ? groupRows(rows, "lossReason") : [];
  const lowest = reasons
    .filter(
      (group) =>
        group.label !== "Sin motivo registrado" &&
        group.covered >= 5 &&
        group.covered === group.deals,
    )
    .sort((a, b) => a.average! - b.average!)[0];
  const lowestUnique =
    lowest &&
    !reasons.some(
      (group) =>
        group !== lowest &&
        group.label !== "Sin motivo registrado" &&
        group.covered >= 5 &&
        group.covered === group.deals &&
        group.average === lowest.average,
    );
  const searchTerm = search.trim().toLocaleLowerCase("es-CL");
  const visible = (actor ? [...actor.rows] : rows)
    .filter(
      (row) =>
        (!zeroOnly || (row.complete && !row.counted.length)) &&
        row.deal.name.toLocaleLowerCase("es-CL").includes(searchTerm),
    )
    .sort((a, b) =>
      outcome === "active"
        ? (a.counted[0]?.at ?? 0) - (b.counted[0]?.at ?? 0)
        : b.deal.cutoff - a.deal.cutoff,
    );
  const selectGroup = (next: { key: string; label: string }, by = dimension) => {
    if (path.some((item) => item.dimension === by)) return;
    const updated = [...path, { dimension: by, key: next.key, label: next.label }];
    setPath(updated);
    setDimension(
      availableDimensions.find((key) => !updated.some((item) => item.dimension === key)) ?? by,
    );
    resetList();
  };
  const availableDimensions = (Object.keys(dimensions) as Dimension[]).filter(
    (key) => outcome === "lost" || (key !== "lossReason" && key !== "lossType"),
  );
  const recentLabel = outcome === "active" ? "Últimos 14 días" : "14 días antes del cierre";
  const lossStageLabel =
    outcome === "active" ? "Etapa actual" : "Última etapa registrada antes del cierre";
  return (
    <>
      <section className="activity-panel" aria-labelledby="activity-compare">
        <div className="activity-heading">
          <div>
            <h3 id="activity-compare">Qué se registra antes de cerrar</h3>
            <p>
              Ganados y perdidos del período seleccionado. Los activos muestran la cartera actual.
            </p>
          </div>
        </div>
        <div className="activity-comparison">
          {(["won", "lost"] as const).map((result) => {
            const closed = deals.filter((deal) => deal.outcome === result);
            const overall = summarizeActivity(
              closed.map((deal) => observeActivity(deal, report, activityChannels, "all")),
            );
            const last = closed.map((deal) =>
              observeActivity(deal, report, activityChannels, "recent"),
            );
            const recent = summarizeActivity(last);
            return (
              <div className={`activity-outcome activity-${result}`} key={result}>
                <div className="activity-outcome-top">
                  <button
                    type="button"
                    onClick={() => {
                      selectOutcome(result);
                      document.getElementById("activity-explorer")?.focus();
                    }}
                  >
                    {outcomes[result]} <ChevronRight size={16} aria-hidden="true" />
                  </button>
                  <span>{closed.length} deals</span>
                </div>
                <div className="activity-outcome-metrics">
                  <div>
                    <strong>{format(overall.average)}</strong>
                    <span>Actividades promedio por deal</span>
                  </div>
                  <div>
                    <strong>{format(overall.median)}</strong>
                    <span>Mediana por deal</span>
                  </div>
                  <div>
                    <strong>{format(recent.average)}</strong>
                    <span>Promedio en los últimos 14 días</span>
                  </div>
                </div>
                <div className="activity-channel-bars">
                  {activityChannels.map((key) => {
                    const full = closed.map((deal) => observeActivity(deal, report, [key], "all"));
                    const near = closed
                      .map((deal) => observeActivity(deal, report, [key], "recent"))
                      .filter((row) => row.complete);
                    const share = near.length
                      ? near.filter((row) => row.counted.length > 0).length / near.length
                      : null;
                    const metrics = summarizeActivity(full);
                    const unconfirmed =
                      key === "communications"
                        ? full.filter((row) =>
                            row.events.some((event) => event.status === "Sin dirección confirmada"),
                          ).length
                        : 0;
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => {
                          selectOutcome(result);
                          setChannel(key);
                          setWindow("recent");
                          resetList();
                          document.getElementById("activity-explorer")?.focus();
                        }}
                        title={`${near.length} de ${closed.length} deals con lectura completa del canal`}
                      >
                        <span>
                          {ACTIVITY_CHANNELS[key]}{" "}
                          <small>
                            {format(metrics.average)} por deal
                            {unconfirmed > 0 &&
                              ` · ${unconfirmed} deals con registros sin confirmar`}
                          </small>
                        </span>
                        <meter
                          min={0}
                          max={1}
                          value={share ?? 0}
                          aria-label={`${ACTIVITY_CHANNELS[key]} en los últimos 14 días`}
                          hidden={share === null}
                        />
                        <b>{share === null ? "—" : `${format(100 * share)}%`}</b>
                      </button>
                    );
                  })}
                </div>
                <p className="activity-note">
                  {overall.covered} de {closed.length} deals con lectura completa de los cuatro
                  canales. Las barras muestran el porcentaje con al menos una actividad del canal en
                  los 14 días previos.
                </p>
              </div>
            );
          })}
        </div>
        {!!undated.length && (
          <p className="activity-note">
            {undated.length} cierres del alcance comercial sin entrada válida a etapa de resultado.
            Quedan sin asignar a un período.
          </p>
        )}
      </section>

      <section
        className="activity-panel activity-explorer"
        id="activity-explorer"
        tabIndex={-1}
        aria-labelledby="activity-breakdown"
      >
        <div className="activity-heading">
          <div>
            <h3 id="activity-breakdown">Explorar la actividad por deal</h3>
            <p>Abre un grupo para cruzarlo con otra dimensión y llegar a los negocios.</p>
          </div>
        </div>
        <div className="activity-toolbar">
          <div className="activity-outcome-toggle" aria-label="Resultado">
            {(Object.keys(outcomes) as ActivityOutcome[]).map((key) => (
              <button
                type="button"
                key={key}
                aria-pressed={key === outcome}
                onClick={() => selectOutcome(key)}
              >
                {outcomes[key]} <small>{deals.filter((deal) => deal.outcome === key).length}</small>
              </button>
            ))}
          </div>
          <label>
            Ventana{" "}
            <select
              value={window}
              onChange={(event) => {
                setWindow(event.target.value as ActivityWindow);
                resetList();
              }}
            >
              <option value="all">Desde la creación</option>
              <option value="recent">{recentLabel}</option>
              {outcome === "active" && (
                <option value="stage">Desde la entrada a la etapa actual</option>
              )}
            </select>
          </label>
          <label>
            Canal{" "}
            <select
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value as ActivityChannel | "all");
                resetList();
              }}
            >
              <option value="all">Todos</option>
              {activityChannels.map((key) => (
                <option key={key} value={key}>
                  {ACTIVITY_CHANNELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agrupar por{" "}
            <select
              value={dimension}
              onChange={(event) => setDimension(event.target.value as Dimension)}
            >
              {availableDimensions.map((key) => (
                <option value={key} key={key}>
                  {key === "stage" ? lossStageLabel : dimensions[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!!path.length && (
          <nav className="activity-path" aria-label="Grupos seleccionados">
            <button
              type="button"
              onClick={() => {
                setPath([]);
                resetList();
              }}
            >
              Todos los {outcomes[outcome].toLowerCase()}
            </button>
            {path.map((item, index) => (
              <button
                type="button"
                key={item.dimension}
                onClick={() => {
                  setPath(path.slice(0, index));
                  resetList();
                }}
                aria-label={`Quitar filtro ${item.label} y los que siguen`}
              >
                {item.label} ×
              </button>
            ))}
          </nav>
        )}
        <div className="activity-stats">
          <div>
            <strong>{summary.deals}</strong>
            <span>Deals</span>
          </div>
          <div>
            <strong>{format(summary.average)}</strong>
            <span>Promedio por deal</span>
          </div>
          <div>
            <strong>{format(summary.median)}</strong>
            <span>Mediana por deal</span>
          </div>
          <button
            type="button"
            aria-pressed={zeroOnly}
            onClick={() => {
              setZeroOnly(!zeroOnly);
              setActorId(null);
              setLimit(20);
            }}
          >
            <strong>{summary.zero}</strong>
            <span>Sin actividad confirmada</span>
          </button>
        </div>
        <p className="activity-note">
          Base de promedio, mediana y cero · {summary.covered} de {summary.deals} deals con lectura
          completa.{" "}
          {summary.covered < summary.deals && "Los demás tienen registros o fechas sin verificar."}
        </p>
        {unconfirmedWhatsApp > 0 && (
          <p className="activity-note">
            {unconfirmedWhatsApp} registros de WhatsApp sin dirección confirmada en la cronología de
            los deals. Quedan fuera del conteo de actividad confirmada.
          </p>
        )}
        {lowestUnique && lowest && (
          <p className="activity-insight">
            <strong>Motivo con menor actividad registrada</strong> · {lowest.label},{" "}
            {format(lowest.average)} por deal sobre {lowest.deals} negocios. Se comparan motivos con
            al menos 5 y cobertura completa.
          </p>
        )}
        <div className="activity-table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th scope="col">
                  {dimension === "stage" ? lossStageLabel : dimensions[dimension]}
                </th>
                <th scope="col">Deals</th>
                <th scope="col">Con lectura</th>
                <th scope="col">Actividades confirmadas</th>
                {unconfirmedWhatsApp > 0 && <th scope="col">WhatsApp sin confirmar</th>}
                <th scope="col">Promedio</th>
                <th scope="col">Mediana</th>
                <th scope="col">Sin actividad confirmada</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.key}>
                  <th scope="row">
                    {path.some((item) => item.dimension === dimension) ? (
                      group.label
                    ) : (
                      <button type="button" onClick={() => selectGroup(group)}>
                        {group.label} <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    )}
                  </th>
                  <td>{group.deals}</td>
                  <td>{group.covered}</td>
                  <td>{group.rows.reduce((sum, row) => sum + row.counted.length, 0)}</td>
                  {unconfirmedWhatsApp > 0 && (
                    <td>
                      {group.rows.reduce(
                        (sum, row) => sum + row.events.filter(isUnconfirmedWhatsApp).length,
                        0,
                      )}
                    </td>
                  )}
                  <td>{format(group.average)}</td>
                  <td>{format(group.median)}</td>
                  <td>{group.zero}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!groups.length && <p className="activity-note">No hay negocios para esta selección.</p>}
        </div>
        <details className="activity-actors">
          <summary>Actividades por responsable en HubSpot</summary>
          <p className="activity-note">
            Cada actividad se cuenta una vez por responsable, aunque esté vinculada a varios deals.
            Totales observados en la selección, con las lecturas parciales incluidas.
          </p>
          <div className="activity-table-wrap">
            <table className="activity-table">
              <thead>
                <tr>
                  <th scope="col">Responsable</th>
                  {channels.map((key) => (
                    <th scope="col" key={key}>
                      {ACTIVITY_CHANNELS[key]}
                    </th>
                  ))}
                  {unconfirmedWhatsApp > 0 && <th scope="col">WhatsApp sin confirmar</th>}
                  <th scope="col">Total confirmado</th>
                  <th scope="col">Deals vinculados</th>
                </tr>
              </thead>
              <tbody>
                {actors.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <button
                        type="button"
                        aria-pressed={actorId === row.id}
                        onClick={() => {
                          setActorId(actorId === row.id ? null : row.id);
                          setZeroOnly(false);
                          setLimit(20);
                        }}
                      >
                        {row.name} <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    </th>
                    {channels.map((key) => (
                      <td key={key}>{row.counts[key]}</td>
                    ))}
                    {unconfirmedWhatsApp > 0 && <td>{row.unconfirmedWhatsApp}</td>}
                    <td>{row.total}</td>
                    <td>{row.rows.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!actors.length && (
            <p className="activity-note">Sin actividades confirmadas en esta selección.</p>
          )}
        </details>

        <div className="activity-heading activity-deals-heading">
          <div>
            <h4>Negocios y cronología</h4>
            <p>
              {visible.length} deals {actor ? `· Actividad de ${actor.name}` : ""}
              {zeroOnly ? " · Sin actividad confirmada" : ""}
            </p>
          </div>
          <label>
            Buscar deal{" "}
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(20);
              }}
            />
          </label>
        </div>
        <div className="activity-deals">
          {visible.slice(0, limit).map((row) => (
            <DealTimeline key={row.deal.id} row={row} actorId={actorId} />
          ))}
        </div>
        {visible.length > limit && (
          <button className="activity-more" type="button" onClick={() => setLimit(limit + 20)}>
            Mostrar 20 más
          </button>
        )}
      </section>

      <details className="activity-panel activity-method">
        <summary>Cómo se cuentan las actividades</summary>
        <ul>
          <li>
            Se usan asociaciones directas a deals del pipeline Comercial. Las actividades exclusivas
            del contacto o sin vincular quedan fuera. Un mismo registro puede aparecer en varios
            deals.
          </li>
          <li>
            Se cuentan correos enviados o entrantes, WhatsApp con envío o recepción confirmada en el
            registro, llamadas completadas o con un resultado de intento, y reuniones marcadas como
            realizadas. Borradores, citas agendadas y estados sin confirmar aparecen en la
            cronología cuando tienen fecha.
          </li>
          <li>
            El corte para un ganado es su entrada registrada a Propuesta comercial firmada (E6).
            Para un perdido se usa la entrada registrada a su etapa de pérdida actual, incluidas las
            bajas posfirma. El análisis toma el estado actual y el recorrido registrado desde la
            creación. Si un deal fue reabierto, el recorrido puede abarcar varios ciclos.
          </li>
          <li>
            «Etapa» agrupa por la etapa vigente en activos y por la última entrada registrada
            anterior al corte en cierres. En activos, «Desde la entrada a la etapa actual» cuenta
            sólo las actividades en esa ventana.
          </li>
          <li>
            Un cero significa que HubSpot no mostró actividad confirmada para la ventana y el canal
            seleccionados. El volumen observado puede depender del registro y de la duración del
            deal. La comparación describe asociaciones y no mide causalidad.
          </li>
        </ul>
      </details>
    </>
  );
}

function DealTimeline({ row, actorId }: { row: ActivityObservation; actorId: string | null }) {
  const { deal } = row;
  const [showAll, setShowAll] = useState(false);
  const timeline =
    actorId === null ? row.events : row.events.filter((event) => event.actorId === actorId);
  const confirmed = timeline.filter((event) => event.counted);
  const recent = confirmed[0];
  return (
    <details className="activity-deal">
      <summary>
        <span>
          <strong>{deal.name}</strong>
          <small>
            {deal.owner} · {deal.stage} · {deal.industry}
            {deal.lossType ? ` · ${deal.lossType}` : ""}
            {deal.lossReason ? ` · ${deal.lossReason}` : ""}
          </small>
        </span>
        <span>
          <b>{confirmed.length} confirmadas</b>
          <small>
            {row.complete
              ? recent
                ? date.format(recent.at)
                : "Sin actividad en la ventana"
              : "Lectura parcial"}
          </small>
        </span>
      </summary>
      <div className="activity-timeline">
        <a href={deal.url} target="_blank" rel="noreferrer">
          Abrir en HubSpot <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        {deal.outcome !== "active" && (
          <p className="activity-note">Corte del análisis · {date.format(deal.cutoff)}</p>
        )}
        {timeline.length ? (
          <ul>
            {(showAll ? timeline : timeline.slice(0, 20)).map((event) => (
              <li key={`${event.channel}:${event.id}`}>
                <time dateTime={new Date(event.at).toISOString()}>{date.format(event.at)}</time>
                <strong>{ACTIVITY_CHANNELS[event.channel]}</strong>
                <span>{event.status}</span>
                <span>{event.actor}</span>
                {!event.counted && <small>Fuera del conteo</small>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="activity-note">Sin registros fechados para esta selección.</p>
        )}
        {!showAll && timeline.length > 20 && (
          <button type="button" onClick={() => setShowAll(true)}>
            Ver el historial de la ventana ({timeline.length})
          </button>
        )}
      </div>
    </details>
  );
}
