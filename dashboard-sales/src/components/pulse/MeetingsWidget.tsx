import "./MeetingsWidget.css";
import { useEffect, useRef, useState } from "react";
import { X, Info, ExternalLink } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getMeetingMetrics } from "@/lib/pulse.functions";
import {
  meetingCounts,
  meetingMonths,
  scopeMeetings,
  MEETING_TYPES,
  MEETING_LABELS,
  type MeetingReport,
  type MeetingType,
  type ScopedMeeting,
} from "@/lib/meeting-metrics";
import { PIPELINE_SOURCES } from "@/lib/pipeline-history";
import type { DealDTO } from "@/lib/pulse-types";
import { KAM_OWNER_IDS, type RoleFilter } from "@/lib/owner-roles";
import { MeetingsCoverage } from "./MeetingsCoverage";
import { KamMeetingCoverage } from "./KamMeetingCoverage";
import { meetingAccountRows, meetingAccountKey } from "@/lib/meeting-accounts";
const sources: Record<string, string> = {
  ...PIPELINE_SOURCES,
  shared: "Varias fuentes",
  unlinked: "Sin deal verificado",
  linked_unavailable: "Fuente pendiente de lectura",
};
const colors = { A: "#88afff", B: "#c4a1ff", C: "#65d6b1", unknown: "#747d8d" };
const descriptions: Record<MeetingType, string> = {
  A: "Primera reunión de venta",
  B: "Seguimiento de oportunidad",
  C: "Cliente ganado",
  unknown: "Sin clasificación registrada",
};
function MeetingLegend({
  counts,
  unavailable = false,
  onTypeClick,
  selectedType,
  noun = "reuniones",
}: {
  counts: Record<MeetingType, number>;
  unavailable?: boolean;
  onTypeClick?: (type: MeetingType, button: HTMLButtonElement) => void;
  selectedType?: MeetingType | "all";
  noun?: string;
}) {
  return (
    <div className="meeting-class-legend">
      {MEETING_TYPES.filter((type) => type !== "unknown" || counts.unknown > 0).map((type) => {
        const content = (
          <>
            <b style={{ color: colors[type], background: `${colors[type]}18` }}>
              {type === "unknown" ? "?" : type}
            </b>
            <span>
              {type === "B" ? "Seguimiento" : descriptions[type]}
              <small>{MEETING_LABELS[type]}</small>
            </span>
            <strong>{unavailable ? "—" : counts[type]}</strong>
          </>
        );
        return onTypeClick ? (
          <button
            type="button"
            className="meeting-class-pill"
            key={type}
            disabled={unavailable}
            aria-label={`Ver ${noun} ${MEETING_LABELS[type]}`}
            aria-haspopup="dialog"
            aria-expanded={selectedType === type}
            title={`Ver ${MEETING_LABELS[type]}: ${descriptions[type]}`}
            onClick={(event) => onTypeClick(type, event.currentTarget)}
          >
            {content}
          </button>
        ) : (
          <span
            className="meeting-class-pill"
            key={type}
            title={`${MEETING_LABELS[type]}: ${descriptions[type]}`}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}
function RowCounts({ rows }: { rows: ScopedMeeting[] }) {
  const counts = meetingCounts(rows);
  return (
    <small className="meeting-row-counts">
      {MEETING_TYPES.filter((type) => type !== "unknown" || counts.unknown > 0).map((type) => (
        <em key={type} style={{ color: colors[type] }}>
          {type === "unknown" ? "?" : type} <b>{counts[type]}</b>
        </em>
      ))}
    </small>
  );
}
function Segments({ rows, max }: { rows: ScopedMeeting[]; max: number }) {
  const counts = meetingCounts(rows);
  return (
    <span className="meeting-segments" aria-hidden="true">
      {MEETING_TYPES.map((type) => (
        <i
          key={type}
          style={{ width: `${max ? (counts[type] / max) * 100 : 0}%`, background: colors[type] }}
        />
      ))}
    </span>
  );
}
const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00Z`)
    .toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" })
    .replace(".", "");
export function MeetingsWidget({
  deals,
  periods,
  rangeLabel,
  isTeam,
  owners,
  role,
  readAt,
  ownerFilter,
  includeUnlinked,
}: {
  deals: DealDTO[];
  periods: string[];
  rangeLabel: string;
  isTeam: boolean;
  owners: [string, string][];
  role: RoleFilter;
  readAt: string;
  ownerFilter: string;
  includeUnlinked: boolean;
}) {
  const popupOriginRef = useRef<HTMLButtonElement | null>(null);
  const [popupSide, setPopupSide] = useState<"left" | "right" | "bottom">("bottom");
  const setPopupOrigin = (button: HTMLButtonElement) => {
    popupOriginRef.current = button;
    const rect = button.getBoundingClientRect();
    const width = Math.min(790, window.innerWidth - 28);
    setPopupSide(
      rect.left >= width + 24
        ? "left"
        : window.innerWidth - rect.right >= width + 24
          ? "right"
          : "bottom",
    );
  };
  const monthListRef = useRef<HTMLDivElement>(null);
  const popupCloseRef = useRef<HTMLButtonElement>(null);
  const [report, setReport] = useState<MeetingReport | null>(null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  const [auditOpen, setAuditOpen] = useState(false);
  const [requestedAccountMode, setAccountMode] = useState(false);
  const [detailType, setDetailType] = useState<MeetingType | "all">("all");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all"),
    [owner, setOwner] = useState("all"),
    [open, setOpen] = useState(false),
    [month, setMonth] = useState("");
  const selectedCommercial = owner !== "all" ? owner : ownerFilter;
  const canUseAccountMode =
    role !== "AE" &&
    (selectedCommercial === "team"
      ? owners.length > 0 && owners.every(([id]) => KAM_OWNER_IDS.has(id))
      : KAM_OWNER_IDS.has(selectedCommercial));
  const accountMode = canUseAccountMode && requestedAccountMode;
  useEffect(() => {
    if (!canUseAccountMode && requestedAccountMode) {
      setAccountMode(false);
      setMonth("");
      setOpen(false);
    }
  }, [canUseAccountMode, requestedAccountMode]);
  useEffect(() => {
    let active = true;
    setReport(null);
    setFailed(false);
    getMeetingMetrics({ data: { role } })
      .then((value) => {
        if (active) setReport(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [role, readAt, retry]);
  useEffect(() => {
    setOwner("all");
    setMonth("");
  }, [
    isTeam,
    deals
      .map((deal) => deal.ownerId)
      .filter((value, index, list) => list.indexOf(value) === index)
      .sort()
      .join(","),
  ]);
  useEffect(() => setMonth(""), [periods.join(",")]);
  const participantMode = report?.participationAuthority === "diio-recording";
  const scopeDeals = participantMode
    ? deals
    : deals.filter((deal) => ownerFilter === "team" || deal.ownerId === ownerFilter);
  const rawBase = scopeMeetings(
    report?.events ?? [],
    scopeDeals,
    periods,
    participantMode
      ? { ownerId: ownerFilter, ownerIds: owners.map(([id]) => id), includeUnlinked }
      : undefined,
  );
  const base = accountMode ? meetingAccountRows(rawBase) : rawBase;
  const participates = (row: ScopedMeeting, id: string) =>
    participantMode
      ? !!row.participants?.some((person) => person.ownerId === id)
      : row.ownerId === id;
  const sourced = base.filter((row) => source === "all" || row.source === source);
  const rows = sourced.filter((row) => owner === "all" || participates(row, owner));
  const selectedAccountKeys = new Set(
    rows.flatMap((row) => row.companies?.map(meetingAccountKey) ?? []),
  );
  const rawRows = accountMode
    ? rawBase.filter(
        (row) =>
          (owner === "all" || participates(row, owner)) &&
          row.companies?.some((company) => selectedAccountKeys.has(meetingAccountKey(company))),
      )
    : rows;
  const unassignedCount = rawBase.filter(
    (row) =>
      !row.companies?.length &&
      (source === "all" || row.source === source) &&
      (owner === "all" || participates(row, owner)),
  ).length;
  const counts = meetingCounts(rows),
    months = meetingMonths(periods, rows),
    maxMonth = Math.max(1, ...months.map((bucket) => bucket.rows.length));
  const ownerIds = [
    ...new Set([
      ...owners.map(([id]) => id),
      ...sourced.flatMap((row) =>
        participantMode ? (row.participants?.map((person) => person.ownerId) ?? []) : [row.ownerId],
      ),
    ]),
  ];
  const ownerRows = ownerIds
    .map((id) => ({
      id,
      name:
        owners.find(([key]) => key === id)?.[1] ??
        sourced.find((row) => row.ownerId === id)?.owner ??
        "Sin comercial",
      rows: sourced.filter((row) => participates(row, id)),
    }))
    .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
  const maxOwner = Math.max(1, ...ownerRows.map((row) => row.rows.length));
  const sourceRows = Object.entries(sources)
    .map(([id, name]) => ({
      id,
      name,
      rows: base.filter(
        (row) => (owner === "all" || participates(row, owner)) && row.source === id,
      ),
    }))
    .filter((row) => row.rows.length)
    .sort((a, b) => b.rows.length - a.rows.length);
  const maxSource = Math.max(1, ...sourceRows.map((row) => row.rows.length));
  const firstMonth = report?.events[0]?.date.slice(0, 7) ?? "";
  const lastMonth = report?.events[report.events.length - 1]?.date.slice(0, 7) ?? "";
  const hasHistory = (key: string) =>
    Boolean(firstMonth && lastMonth && key >= firstMonth && key <= lastMonth);
  const detail = month ? rows.filter((row) => row.date.startsWith(month)) : rows;
  const detailCounts = meetingCounts(detail);
  const visibleDetail = detail.filter(
    (event) =>
      (detailType === "all" || event.type === detailType) &&
      `${event.name ?? ""} ${event.owner} ${event.deals.map((deal) => `${deal.name} ${deal.source?.trim() || "Sin fuente registrada"}`).join(" ")}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(
          query
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase(),
        ),
  );
  const selectedMonthLabel = month
    ? new Date(`${month}-01T12:00:00Z`).toLocaleDateString("es-CL", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Período completo";
  const changeOpen = (next: boolean) => {
    if (next && !month)
      setMonth(
        [...months].reverse().find((bucket) => bucket.rows.length)?.month ?? months[0]?.month ?? "",
      );
    setOpen(next);
  };
  const openTypeDetail = (type: MeetingType, button: HTMLButtonElement) => {
    setPopupOrigin(button);
    setDetailType(type);
    setQuery("");
    setMonth("");
    setOpen(true);
  };
  const unavailable = !report || (!report.complete && !report.events.length);
  const note =
    "Cuenta reuniones únicas por identificador y fecha de reunión. El cruce con HubSpot utiliza IDs exactos y enlaces de notas asociadas a deals. A/B/C proviene exclusivamente del análisis terminado en Diio y del playbook y versión verificados de esa reunión. A: primera reunión de venta; B: seguimiento de oportunidad; C: cliente ganado. Sin evidencia en Diio: sin clasificar. Las etiquetas antiguas de Adobo no asignan ni reemplazan el tipo. Nunca se deduce por etapa actual ni por calidad. Comercial corresponde a una intervención registrada en Diio, no al dueño del deal. Fuente corresponde al deal actual. Las reuniones compartidas cuentan una vez en el total y en cada comercial participante. Cuentas únicas agrupa por la propiedad ID Holding de HubSpot; sin ella, por ID de empresa. La última reunión del período determina su tipo, fuente y mes, conservando las reuniones y deals originales en el detalle. La falta de intervención registrada no prueba ausencia; esas reuniones quedan fuera de este conteo confirmado." +
    (report?.validation
      ? ` Validación global: ${report.validation.linked} reuniones vinculadas; ${report.validation.classified} clasificadas; ${report.validation.pending} registros fuera de la población verificada (incluye soporte, internos, sin vínculo, pendientes o futuros). Se revisaron aparte ${report.validation.nativeCompleted} actividades realizadas de HubSpot en 2026; ${report.validation.nativeMatched} coincidencias explícitas, sin sumar las restantes ni duplicar registros.`
      : "");
  return (
    <article className="meetings-widget" aria-label="Reuniones comerciales por tipo y fuente">
      <header>
        <div>
          <h3>
            Reuniones <span>· {rangeLabel}</span>
          </h3>
          <p>
            Clientes, prospectos y partners · por fecha de reunión
            {!report?.complete ? (
              <span className="meeting-data-status">Validación en curso</span>
            ) : null}
          </p>
        </div>
        <Popover open={auditOpen} onOpenChange={setAuditOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="meeting-info"
              aria-label="Cómo se cuentan las reuniones"
              title="Cómo se cuentan las reuniones"
            >
              <Info size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="meeting-count-info won-mix-popover"
            side="bottom"
            align="start"
            collisionPadding={16}
          >
            <header>
              <h4>Cómo contamos las reuniones</h4>
              <button
                type="button"
                aria-label="Cerrar información de reuniones"
                onClick={() => setAuditOpen(false)}
              >
                <X size={16} />
              </button>
            </header>
            <p>
              Una reunión realizada cuenta una sola vez, aunque tenga varios deals o participen
              varios comerciales. El filtro Comercial usa la participación comprobada en la reunión.
            </p>
            <p>
              El número principal incluye reuniones externas confirmadas en Diio. Las actividades de
              HubSpot y las citas de calendario sirven para contrastar; no se suman automáticamente
              porque podrían corresponder a la misma reunión. El total disponible aún es parcial.
            </p>
            <details>
              <summary>Ver criterios y alcance de la lectura</summary>
              <p>{note}</p>
            </details>
            {auditOpen && report?.coverage ? (
              <MeetingsCoverage
                {...(participantMode
                  ? { responsibleId: owner !== "all" ? owner : ownerFilter }
                  : {})}
                coverage={report.coverage}
                deals={scopeDeals}
                periods={periods}
                source={source}
                owner={owner}
                rangeLabel={rangeLabel}
              />
            ) : null}
          </PopoverContent>
        </Popover>
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverAnchor virtualRef={popupOriginRef} />
          <PopoverContent
            className="meetings-evolution-popup won-mix-popover"
            side={popupSide}
            align={popupSide === "bottom" ? "end" : "center"}
            collisionPadding={12}
            sideOffset={10}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              popupOriginRef.current?.focus({ preventScroll: true });
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              popupCloseRef.current?.focus({ preventScroll: true });
              requestAnimationFrame(() => {
                const list = monthListRef.current;
                const selected = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
                const first = list?.firstElementChild as HTMLElement | null;
                if (list && selected && first) {
                  // Layout offsets stay stable during the trigger-origin scale animation.
                  if (list.scrollWidth > list.clientWidth)
                    list.scrollLeft =
                      selected.offsetLeft -
                      first.offsetLeft -
                      list.clientWidth / 2 +
                      selected.offsetWidth / 2;
                  else
                    list.scrollTop =
                      selected.offsetTop -
                      first.offsetTop -
                      list.clientHeight / 2 +
                      selected.offsetHeight / 2;
                }
              });
            }}
          >
            <header>
              <div>
                <h4>
                  {detailType === "all"
                    ? `${accountMode ? "Cuentas" : "Reuniones"} · evolución mensual`
                    : `${accountMode ? "Cuentas" : "Reuniones"} · ${MEETING_LABELS[detailType]}`}
                </h4>
                <p>
                  {rangeLabel} ·{" "}
                  {owner === "all"
                    ? isTeam
                      ? "Equipo"
                      : (owners.find(([id]) => id === ownerFilter)?.[1] ?? "Comercial seleccionado")
                    : ownerRows.find((row) => row.id === owner)?.name}{" "}
                  · {source === "all" ? "Todas las fuentes" : sources[source]}
                </p>
              </div>
              <button
                ref={popupCloseRef}
                type="button"
                aria-label="Cerrar evolución de reuniones"
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </header>
            <div className="meeting-popup-layout">
              <section className="meeting-popup-months" aria-label="Meses del período">
                <h5>
                  Mes a mes <small>{months.length} meses</small>
                </h5>
                <div className="meeting-evolution-list" ref={monthListRef}>
                  <button
                    type="button"
                    className="meeting-all-period"
                    aria-label="Ver todo el período de reuniones"
                    aria-pressed={!month}
                    onClick={() => setMonth("")}
                  >
                    <span>Todo el período</span>
                    <strong>{rows.length}</strong>
                  </button>
                  {months.map((bucket) => (
                    <button
                      type="button"
                      key={bucket.month}
                      aria-label={`Seleccionar mes ${bucket.month}`}
                      aria-pressed={month === bucket.month}
                      onClick={() => setMonth(bucket.month)}
                    >
                      <span>
                        {monthLabel(bucket.month)} <small>{bucket.month.slice(0, 4)}</small>
                      </span>
                      <Segments rows={bucket.rows} max={maxMonth} />
                      <strong>{hasHistory(bucket.month) ? bucket.rows.length : "—"}</strong>
                    </button>
                  ))}
                </div>
                <p className="meeting-popup-key">
                  Barras por tipo A / B / C.
                  <br />— Sin historial recuperado.
                </p>
              </section>
              <section className="meeting-popup-detail" aria-label="Detalle mensual de reuniones">
                <div className="meeting-month-heading">
                  <h5>{selectedMonthLabel}</h5>
                  <span>
                    {detail.length} {accountMode ? "cuentas" : "reuniones"}
                  </span>
                </div>
                <MeetingLegend counts={detailCounts} />
                <div className="meeting-popup-toolbar">
                  <label>
                    <input
                      type="search"
                      aria-label="Buscar reunión, deal, comercial o fuente"
                      placeholder="Buscar reunión, deal o fuente…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Tipo de reunión del detalle"
                    value={detailType}
                    onChange={(event) => setDetailType(event.target.value as MeetingType | "all")}
                  >
                    <option value="all">Todos los tipos</option>
                    {MEETING_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {MEETING_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="meeting-detail-count">
                  <span>
                    {visibleDetail.length} de {detail.length}{" "}
                    {accountMode ? "cuentas" : "reuniones"}
                  </span>
                  {query || detailType !== "all" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setDetailType("all");
                      }}
                    >
                      Limpiar filtros ×
                    </button>
                  ) : null}
                </div>
                <div className="meeting-event-list">
                  {[...visibleDetail]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((event) => (
                      <div className="meeting-event" key={event.id}>
                        <span
                          className="meeting-event-type"
                          title={descriptions[event.type]}
                          style={{
                            color: colors[event.type],
                            background: `${colors[event.type]}18`,
                          }}
                        >
                          {event.type === "unknown" ? "?" : event.type}
                        </span>
                        <div>
                          <div className="meeting-event-heading">
                            <strong title={event.classification}>
                              {event.name ?? descriptions[event.type]}
                            </strong>
                            <time dateTime={event.date}>
                              {event.date.split("-").reverse().join("-")}
                            </time>
                          </div>
                          <small>
                            {event.owner} · {sources[event.source]}
                          </small>
                          {event.accountView ? (
                            <details className="meeting-account-related">
                              <summary>
                                {event.accountView.meetings.length} reuniones de esta cuenta en el
                                período
                              </summary>
                              {event.accountView.meetings.map((meeting) => (
                                <div key={meeting.id}>
                                  <time>{meeting.date.split("-").reverse().join("-")}</time>
                                  {meeting.diioUrl ? (
                                    <a
                                      href={meeting.diioUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {meeting.name}
                                      <ExternalLink size={11} />
                                    </a>
                                  ) : (
                                    <span>{meeting.name}</span>
                                  )}
                                </div>
                              ))}
                            </details>
                          ) : null}
                          {event.classification ? (
                            <small className="meeting-classification">{event.classification}</small>
                          ) : null}
                          {event.diioUrl ? (
                            <a href={event.diioUrl} target="_blank" rel="noopener noreferrer">
                              Ver reunión en Diio <ExternalLink size={11} />
                            </a>
                          ) : null}
                          <div
                            className="meeting-deals"
                            role="list"
                            aria-label="Deals asociados y fuente de creación"
                          >
                            <div className="meeting-deals-heading" aria-hidden="true">
                              <span>Deal en HubSpot</span>
                              <span>Fuente de creación</span>
                            </div>
                            {!event.deals.length ? (
                              <small>
                                {event.dealIds.length
                                  ? "Deal asociado fuera de esta edición; fuente pendiente de lectura."
                                  : "Sin deal verificado en esta edición. No se asigna una fuente de creación."}
                              </small>
                            ) : null}
                            {event.deals.map((deal) => {
                              const rawSource = deal.source?.trim();
                              return (
                                <div className="meeting-deal-row" role="listitem" key={deal.id}>
                                  <a href={deal.url} target="_blank" rel="noopener noreferrer">
                                    <span>{deal.name}</span>
                                    <ExternalLink size={11} />
                                  </a>
                                  <span
                                    className="meeting-deal-source"
                                    data-empty={!rawSource}
                                    aria-label={`Fuente de creación: ${rawSource || "Sin fuente registrada"}`}
                                  >
                                    {rawSource || "Sin fuente registrada"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  {!visibleDetail.length ? (
                    <div className="meeting-detail-empty">
                      <strong>
                        {!month || hasHistory(month)
                          ? "Sin reuniones registradas para estos filtros"
                          : "Sin historial disponible este mes"}
                      </strong>
                      <span>
                        {!month || hasHistory(month)
                          ? "Prueba otro tipo, búsqueda o mes."
                          : "El registro actual es parcial. Este mes se completará cuando tengamos más información."}
                      </span>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
            <footer>
              {report?.source === "diio-hubspot" ? "Diio verificado:" : "Historial CRM disponible:"}{" "}
              {report?.events[0]?.date.split("-").reverse().join("-") ?? "—"} a{" "}
              {report?.events[report.events.length - 1]?.date.split("-").reverse().join("-") ?? "—"}
              .{" "}
              {participantMode
                ? "Fuente actual del deal; comercial participante en la grabación."
                : "Fuente y comercial actuales del deal."}{" "}
              {report?.source === "diio-hubspot"
                ? "Edición verificada del " + new Date(report.fetchedAt).toLocaleString("es-CL") + ". Cobertura parcial; actualización manual."
                : "Pendiente completar el registro de reuniones."}
            </footer>
          </PopoverContent>
        </Popover>
      </header>
      <div className="meeting-widget-top">
        <div className="meeting-total">
          <strong>{unavailable ? "—" : rows.length}</strong>
          <span>
            {accountMode
              ? "cuentas únicas · por holding"
              : `reuniones realizadas${!report?.complete ? " · confirmadas" : ""}`}
          </span>
        </div>
        <div
          className={`meeting-summary-right${canUseAccountMode ? "" : " meeting-summary-meetings-only"}`}
        >
          <MeetingLegend
            counts={counts}
            unavailable={unavailable}
            selectedType={open ? detailType : "all"}
            onTypeClick={openTypeDetail}
            noun={accountMode ? "cuentas" : "reuniones"}
          />
          {canUseAccountMode ? (
            <div
              className="meeting-measure-toggle"
              role="group"
              aria-label="Unidad del widget de reuniones"
            >
              <button
                type="button"
                aria-pressed={!accountMode}
                onClick={() => {
                  setAccountMode(false);
                  setMonth("");
                  setOpen(false);
                }}
              >
                Reuniones
              </button>
              <button
                type="button"
                aria-pressed={accountMode}
                disabled={!report || report.accountIdentityAuthority !== "hubspot-id-holding"}
                onClick={() => {
                  setAccountMode(true);
                  setMonth("");
                  setOpen(false);
                }}
              >
                Cuentas únicas
              </button>
            </div>
          ) : null}
          <select
            aria-label="Fuente de creación de las reuniones"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setMonth("");
            }}
          >
            <option value="all">Todas las fuentes</option>
            {Object.entries(sources).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
          {owner !== "all" ? (
            <button type="button" className="meeting-reset" onClick={() => setOwner("all")}>
              Todos los comerciales ×
            </button>
          ) : null}
        </div>
      </div>
      {accountMode ? (
        <p className="meeting-coverage">
          Una cuenta por holding. Tipo, fuente y mes corresponden a su última reunión del período.{" "}
          {unassignedCount > 0
            ? `${unassignedCount} reuniones sin cuenta verificada quedan fuera de esta vista.`
            : ""}
        </p>
      ) : null}
      {report?.portfolio?.complete ? (
        <KamMeetingCoverage
          portfolio={report.portfolio}
          meetings={rawRows}
          owners={owners}
          ownerId={owner !== "all" ? owner : ownerFilter}
          rangeLabel={rangeLabel}
        />
      ) : null}
      {failed ? (
        <p role="alert" className="meeting-coverage">
          No pudimos leer las reuniones.{" "}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Reintentar
          </button>
        </p>
      ) : !report ? (
        <p role="status" className="meeting-coverage">
          Leyendo el historial de reuniones clasificadas…
        </p>
      ) : (
        <>
          <div className="meeting-widget-columns">
            {isTeam ? (
              <section>
                <h4>
                  Comparación por comercial{" "}
                  <small>
                    {participantMode
                      ? "Participación · una reunión puede ser compartida"
                      : "Desglose por tipo"}
                  </small>
                </h4>
                <div className="meeting-owner-rows">
                  {ownerRows.map((row) => (
                    <button
                      className="meeting-bar-row"
                      type="button"
                      key={row.id}
                      aria-label={`Filtrar reuniones de ${row.name}`}
                      aria-pressed={owner === row.id}
                      data-muted={owner !== "all" && owner !== row.id}
                      onClick={() => {
                        setOwner(owner === row.id ? "all" : row.id);
                        setMonth("");
                      }}
                      title={MEETING_TYPES.map(
                        (type) => `${MEETING_LABELS[type]}: ${meetingCounts(row.rows)[type]}`,
                      ).join(" · ")}
                    >
                      <span>{row.name}</span>
                      <Segments rows={row.rows} max={maxOwner} />
                      <strong>{row.rows.length}</strong>
                      <RowCounts rows={row.rows} />
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section>
                <h4>
                  Distribución por tipo{" "}
                  <small>
                    {accountMode
                      ? "última reunión de cada cuenta"
                      : "clic para ver reuniones y deals"}
                  </small>
                </h4>
                {MEETING_TYPES.map((type) => (
                  <button
                    type="button"
                    className="meeting-bar-row meeting-type-row"
                    key={type}
                    aria-label={`Ver ${accountMode ? "cuentas" : "reuniones"} y deals de ${MEETING_LABELS[type]}`}
                    aria-haspopup="dialog"
                    aria-expanded={open && detailType === type}
                    onClick={(event) => openTypeDetail(type, event.currentTarget)}
                    title={`Ver ${counts[type]} ${accountMode ? "cuentas" : "reuniones"} y sus deals asociados`}
                  >
                    <span>{MEETING_LABELS[type]}</span>
                    <span className="meeting-segments">
                      <i
                        style={{
                          width: `${rows.length ? (counts[type] / rows.length) * 100 : 0}%`,
                          background: colors[type],
                        }}
                      />
                    </span>
                    <strong>{counts[type]}</strong>
                  </button>
                ))}
              </section>
            )}
            <section>
              <h4>
                Por fuente de creación <small>clic para filtrar</small>
              </h4>
              <div className="meeting-owner-rows">
                {sourceRows.map((row) => (
                  <button
                    className="meeting-bar-row meeting-source-row"
                    type="button"
                    key={row.id}
                    aria-label={`Filtrar reuniones de fuente ${row.name}`}
                    aria-pressed={source === row.id}
                    data-muted={source !== "all" && source !== row.id}
                    onClick={() => {
                      setSource(source === row.id ? "all" : row.id);
                      setMonth("");
                    }}
                    title={MEETING_TYPES.map(
                      (type) => `${MEETING_LABELS[type]}: ${meetingCounts(row.rows)[type]}`,
                    ).join(" · ")}
                  >
                    <span>{row.name}</span>
                    <Segments rows={row.rows} max={maxSource} />
                    <strong>{row.rows.length}</strong>
                    <RowCounts rows={row.rows} />
                  </button>
                ))}
                {!sourceRows.length ? (
                  <p className="service-empty">Sin registros clasificados en este período.</p>
                ) : null}
              </div>
            </section>
          </div>
          <div className="meeting-month-strip" aria-label="Reuniones mes a mes">
            {months.map((bucket) => (
              <button
                type="button"
                key={bucket.month}
                aria-label={`Ver reuniones de ${bucket.month}`}
                onClick={(event) => {
                  setPopupOrigin(event.currentTarget);
                  setMonth(bucket.month);
                  setOpen(true);
                }}
              >
                <strong>{hasHistory(bucket.month) ? bucket.rows.length : "—"}</strong>
                <span className="meeting-month-column" data-available={hasHistory(bucket.month)}>
                  {MEETING_TYPES.map((type) => (
                    <i
                      key={type}
                      style={{
                        height: `${(meetingCounts(bucket.rows)[type] / maxMonth) * 100}%`,
                        background: colors[type],
                      }}
                    />
                  ))}
                </span>
                <small>{monthLabel(bucket.month)}</small>
              </button>
            ))}
          </div>
          <p className="meeting-coverage">
            {accountMode ? "Cada holding cuenta una vez." : "Cada reunión cuenta una vez."}{" "}
            {counts.unknown > 0
              ? `${counts.unknown} ${counts.unknown === 1 ? "pendiente" : "pendientes"} de clasificar; ya ${counts.unknown === 1 ? "incluida" : "incluidas"} en el total.`
              : ""}{" "}
            {!report.complete ? "Conteo confirmado parcial · detalles en ⓘ." : ""}
          </p>
        </>
      )}
    </article>
  );
}
