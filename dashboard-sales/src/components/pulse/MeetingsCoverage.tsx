import { useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { scopeMeetings } from "@/lib/meeting-metrics";
import {
  CALENDAR_STATES,
  calendarIsVerified,
  isPerformedMeeting,
  MEETING_OUTCOMES,
  type MeetingCoverage,
  type RegistryMeeting,
} from "@/lib/meeting-coverage";
import type { DealDTO } from "@/lib/pulse-types";

export function MeetingsCoverage({
  coverage,
  deals,
  periods,
  source,
  owner,
  rangeLabel,
  responsibleId,
}: {
  coverage: MeetingCoverage;
  deals: DealDTO[];
  periods: string[];
  source: string;
  owner: string;
  rangeLabel: string;
  responsibleId?: string;
}) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState("all"),
    [query, setQuery] = useState("");
  const origin = useRef<HTMLButtonElement | null>(null),
    content = useRef<HTMLDivElement | null>(null),
    close = useRef<HTMLButtonElement | null>(null);
  const [side, setSide] = useState<"left" | "right" | "bottom">("bottom");
  const [offset, setOffset] = useState(10);
  const byId = new Map(coverage.events.map((row) => [row.id, row]));
  const rows = scopeMeetings(coverage.events, deals, periods)
    .filter(
      (row) =>
        (source === "all" || row.source === source) &&
        (responsibleId !== undefined
          ? responsibleId === "team" || byId.get(row.id)?.activityOwnerId === responsibleId
          : owner === "all" || row.ownerId === owner),
    )
    .map((row) => ({ ...byId.get(row.id)!, ...row }));
  const now = Date.now();
  const performed = (row: RegistryMeeting) => isPerformedMeeting(row, now);
  const completed = rows.filter(performed).length,
    calendarVerified = rows.filter((row) => calendarIsVerified(row.calendarState)).length,
    diioVerified = rows.filter((row) => row.diioState === "verified").length;
  const futureCompleted = rows.filter(
    (row) => row.outcome === "COMPLETED" && Date.parse(row.startedAt) > now,
  ).length;
  const startDay = coverage.start.slice(0, 10),
    endDay = coverage.end.slice(0, 10);
  const available = periods.every((period) => {
    const [year, q] = period.split("-Q");
    const first = `${year}-${String((Number(q) - 1) * 3 + 1).padStart(2, "0")}-01`;
    const last = new Date(Date.UTC(Number(year), Number(q) * 3, 1)).toISOString().slice(0, 10);
    return first >= startDay && last <= endDay;
  });
  const normalized = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const shown = rows
    .filter(
      (row) =>
        (view === "all" ||
          (view === "completed" && performed(row)) ||
          (view === "calendar" && !calendarIsVerified(row.calendarState)) ||
          (view === "diio" && row.diioState !== "verified")) &&
        `${row.name} ${row.deals.map((deal) => `${deal.name} ${deal.source ?? "Sin fuente registrada"}`).join(" ")}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(normalized),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const openAudit = (button: HTMLButtonElement, filter: string) => {
    origin.current = button;
    const rect = button.getBoundingClientRect(),
      width = Math.min(790, window.innerWidth - 28);
    const nextSide =
      rect.left >= width + 24
        ? "left"
        : window.innerWidth - rect.right >= width + 24
          ? "right"
          : "bottom";
    setSide(nextSide);
    // Overlap the trigger when neither horizontal side fits, keeping the review
    // inside the viewport instead of compressing its list below the cards.
    const height = Math.min(580, window.innerHeight - 24);
    setOffset(
      nextSide === "bottom" ? Math.max(12, (window.innerHeight - height) / 2) - rect.bottom : 10,
    );
    setView(filter);
    setQuery("");
    setOpen(true);
  };
  return (
    <section
      className="meeting-register-audit"
      aria-label="Cruce de reuniones con HubSpot y calendario"
    >
      <div className="meeting-register-cards">
        <button
          type="button"
          disabled={!available}
          onClick={(event) => openAudit(event.currentTarget, "all")}
        >
          <span>HubSpot · actividades registradas</span>
          <strong>{available ? rows.length : "—"}</strong>
          <small>
            {available ? `${completed} marcadas como realizadas` : "Período sin lectura de HubSpot"}
          </small>
        </button>
        <button
          type="button"
          disabled={!available}
          onClick={(event) => openAudit(event.currentTarget, "calendar")}
        >
          <span>Calendario · coinciden</span>
          <strong>{available ? calendarVerified : "—"}</strong>
          <small>
            {available
              ? `${rows.length - calendarVerified} por verificar · clic para revisar`
              : "Período sin revisión"}
          </small>
        </button>
        <button
          type="button"
          disabled={!available}
          onClick={(event) => openAudit(event.currentTarget, "diio")}
        >
          <span>Cruce HubSpot ↔ Diio</span>
          <strong>{available ? diioVerified : "—"}</strong>
          <small>
            {available
              ? `${rows.length - diioVerified} sin cruce verificable por ID`
              : "Período sin revisión"}
          </small>
        </button>
      </div>
      <p className="meeting-coverage">
        {responsibleId !== undefined
          ? "Contraste por responsable de la actividad; no acredita participación ni se suma al total de Diio."
          : "Mismos deals y filtros del informe."}{" "}
        Calendario: Q4 2026 · {coverage.calendarCount} agendas completas y lecturas puntuales
        adicionales. Una cita en agenda no acredita realización. Los totales de las fuentes se
        muestran por separado.
      </p>
      {futureCompleted > 0 ? (
        <p className="meeting-coverage meeting-audit-warning">
          {futureCompleted} registros marcados como realizados tienen fecha futura; quedan fuera del
          conteo de realizadas.
        </p>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor virtualRef={origin} />
        <PopoverContent
          ref={content}
          className="meetings-register-popup won-mix-popover"
          side={side}
          align={side === "bottom" ? "end" : "center"}
          sideOffset={offset}
          style={{
            transformOrigin:
              "var(--meeting-register-origin,var(--radix-popover-content-transform-origin))",
          }}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            close.current?.focus({ preventScroll: true });
            requestAnimationFrame(() => {
              const anchor = origin.current?.getBoundingClientRect(),
                box = content.current?.parentElement?.getBoundingClientRect();
              if (anchor && box)
                content.current?.style.setProperty(
                  "--meeting-register-origin",
                  `${anchor.left + anchor.width / 2 - box.left}px ${anchor.top + anchor.height / 2 - box.top}px`,
                );
            });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            origin.current?.focus({ preventScroll: true });
          }}
        >
          <header>
            <div>
              <h4>Registros de reuniones · HubSpot</h4>
              <p>
                {rangeLabel} ·{" "}
                {responsibleId !== undefined
                  ? "Responsable de la actividad · participación por verificar"
                  : "deals del informe · comercial actual"}{" "}
                · fuente actual del deal
              </p>
            </div>
            <button
              ref={close}
              type="button"
              aria-label="Cerrar cruce de reuniones"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>
          <div className="meeting-register-summary">
            <span>
              <b>{rows.length}</b> registradas
            </span>
            <span>
              <b>{completed}</b> realizadas
            </span>
            <span>
              <b>{calendarVerified}</b> coinciden en agenda
            </span>
            <span>
              <b>{diioVerified}</b> con cruce Diio
            </span>
          </div>
          <div className="meeting-popup-toolbar">
            <label>
              <input
                type="search"
                aria-label="Buscar registros de reuniones"
                placeholder="Buscar reunión, deal o fuente…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Revisión del cruce de reuniones"
              value={view}
              onChange={(event) => setView(event.target.value)}
            >
              <option value="all">Todas las registradas</option>
              <option value="completed">Marcadas realizadas</option>
              <option value="calendar">Agenda por verificar</option>
              <option value="diio">Cruce Diio pendiente</option>
            </select>
          </div>
          <div className="meeting-detail-count">
            {shown.length} de {rows.length} registros
          </div>
          <div className="meeting-register-list">
            {shown.map((row) => (
              <article className="meeting-event" key={row.id}>
                <div>
                  <div className="meeting-event-heading">
                    <strong>{row.name}</strong>
                    <time dateTime={row.startedAt}>
                      {new Date(row.startedAt).toLocaleString("es-CL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "America/Coyhaique",
                      })}
                    </time>
                  </div>
                  <small>
                    {MEETING_OUTCOMES[row.outcome] ?? row.outcome}
                    {Date.parse(row.startedAt) > now ? " · fecha futura" : ""} · comercial del deal:{" "}
                    {row.owner}
                  </small>
                  <small>Responsable de la actividad: {row.activityOwnerName}</small>
                  <small
                    className={
                      calendarIsVerified(row.calendarState)
                        ? "meeting-audit-ok"
                        : "meeting-audit-warning"
                    }
                  >
                    {CALENDAR_STATES[row.calendarState]}
                    {row.calendarState === "calendar_not_covered" && row.calendarReference
                      ? ` · ${row.calendarReference.calendarId}`
                      : ""}
                  </small>
                  <small>
                    {row.diioState === "verified"
                      ? `Diio: coincidencia por ID · tipo ${row.type === "unknown" ? "sin clasificar" : row.type}`
                      : row.diioState === "different_date"
                        ? "Diio: mismo ID, fecha distinta · revisar"
                        : "Diio: cruce no verificado; no acredita ausencia de reunión"}
                  </small>
                  <a href={row.hubspotUrl} target="_blank" rel="noopener noreferrer">
                    Ver actividad en HubSpot <ExternalLink size={11} />
                  </a>
                  {row.diioUrl ? (
                    <a href={row.diioUrl} target="_blank" rel="noopener noreferrer">
                      Ver reunión en Diio <ExternalLink size={11} />
                    </a>
                  ) : null}
                  {row.calendars.map((cal) => (
                    <a
                      key={`${cal.calendarId}:${cal.id}`}
                      href={cal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver cita en calendario · {cal.name}
                      <ExternalLink size={11} />
                    </a>
                  ))}
                  {row.calendarReference && !calendarIsVerified(row.calendarState) ? (
                    <a href={row.calendarReference.url} target="_blank" rel="noopener noreferrer">
                      Abrir enlace de agenda del registro <ExternalLink size={11} />
                    </a>
                  ) : null}
                  <div className="meeting-deals">
                    <div className="meeting-deals-heading">
                      <span>Deal en HubSpot</span>
                      <span>Fuente de creación</span>
                    </div>
                    {row.deals.map((deal) => (
                      <div className="meeting-deal-row" key={deal.id}>
                        <a href={deal.url} target="_blank" rel="noopener noreferrer">
                          <span>{deal.name}</span>
                          <ExternalLink size={11} />
                        </a>
                        <span className="meeting-deal-source" data-empty={!deal.source?.trim()}>
                          {deal.source?.trim() || "Sin fuente registrada"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
            {!shown.length ? (
              <p className="service-empty">Sin registros para estos filtros.</p>
            ) : null}
          </div>
          <footer className="meeting-coverage">
            Cruce exacto por enlace, ID y fecha. Agenda revisada del 01/10/2026 al 31/12/2026; otras
            agendas o períodos quedan pendientes. A/B/C se asigna únicamente con evidencia de Diio.
            Registro verificado al: {new Date(coverage.checkedAt).toLocaleString("es-CL")}.
          </footer>
        </PopoverContent>
      </Popover>
    </section>
  );
}
