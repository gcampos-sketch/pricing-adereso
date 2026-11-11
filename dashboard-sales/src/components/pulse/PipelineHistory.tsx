import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { StageJourney } from "@/lib/pulse-types";
import {
  pipelineHistory,
  PIPELINE_EVENTS,
  PIPELINE_SOURCES,
  type PipelineEventKind,
} from "@/lib/pipeline-history";
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function PipelineHistory({
  journeys,
  scopeLabel,
}: {
  journeys: StageJourney[];
  scopeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("all");
  const [kind, setKind] = useState<PipelineEventKind>("generated");
  const [source, setSource] = useState("all");
  const [month, setMonth] = useState("");
  const [query, setQuery] = useState("");
  const events = pipelineHistory(journeys);
  const scoped = events.filter(
    (row) =>
      (year === "all" || row.date.startsWith(year)) &&
      (source === "all" || row.source === source) &&
      normalize(`${row.deal.name} ${row.deal.owner} ${row.deal.source ?? ""}`).includes(
        normalize(query),
      ),
  );
  const selected = scoped.filter((row) => row.kind === kind);
  const months = [...new Set(scoped.map((row) => row.date.slice(0, 7)))].sort().reverse();
  const rows = selected.filter((row) => !month || row.date.startsWith(month));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="pipeline-history-link">
          Ver histórico por entrada a etapa ↗
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="pipeline-history-popup won-mix-popover"
        align="start"
        sideOffset={10}
        collisionPadding={12}
      >
        <header>
          <div>
            <h4>Histórico · Generación y gestión del pipeline</h4>
            <p>
              {scopeLabel} · sin filtro de creación. Conserva comercial, rol y tipo del tablero; las
              fechas se eligen aquí.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar histórico de pipeline"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </header>
        <div className="service-directory-filters">
          <select
            aria-label="Año de entrada a etapa"
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              setMonth("");
            }}
          >
            <option value="all">Todo el histórico disponible</option>
            {[...new Set(events.map((row) => row.date.slice(0, 4)))]
              .sort()
              .reverse()
              .map((value) => (
                <option key={value}>{value}</option>
              ))}
          </select>
          <select
            aria-label="Origen del histórico"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setMonth("");
            }}
          >
            <option value="all">Todos los orígenes</option>
            {Object.entries(PIPELINE_SOURCES).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <label>
            <input
              aria-label="Buscar en histórico de pipeline"
              placeholder="Buscar deal, comercial o fuente…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setMonth("");
              }}
            />
          </label>
        </div>
        <div className="pipeline-history-tabs" role="group" aria-label="Hito del histórico">
          {PIPELINE_EVENTS.map((event) => (
            <button
              type="button"
              key={event.key}
              aria-pressed={kind === event.key}
              onClick={() => {
                setKind(event.key);
                setMonth("");
              }}
            >
              <span>{event.label}</span>
              <strong>{scoped.filter((row) => row.kind === event.key).length}</strong>
            </button>
          ))}
        </div>
        <p className="service-planning-note">
          E0/E1 cuenta la primera entrada registrada a cualquiera de ambas etapas, una vez por deal.
          E4 exige monto actual &gt; $0. Ganados usa la primera entrada ganada disponible (E6, E6.1,
          6.2 o E8); no es cumplimiento de cuota. Perdidos usa entrada a Deal perdido, sin incluir
          churn. Son hitos registrados, no un historial completo de reingresos.
        </p>
        <div className="pipeline-history-scroll">
          <table className="pipeline-history-months">
            <caption>Movimientos por mes de entrada · cada columna tiene su propia fecha</caption>
            <thead>
              <tr>
                <th>Mes</th>
                {PIPELINE_EVENTS.map((event) => (
                  <th key={event.key}>{event.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((value) => (
                <tr key={value} data-selected={month === value}>
                  <th>
                    <button
                      type="button"
                      aria-pressed={month === value}
                      onClick={() => setMonth(month === value ? "" : value)}
                    >
                      {value.split("-").reverse().join(" / ")}
                    </button>
                  </th>
                  {PIPELINE_EVENTS.map((event) => (
                    <td key={event.key}>
                      <button
                        type="button"
                        aria-label={`Ver ${event.label} de ${value}`}
                        onClick={() => {
                          setKind(event.key);
                          setMonth(value);
                        }}
                      >
                        {
                          scoped.filter(
                            (row) => row.kind === event.key && row.date.startsWith(value),
                          ).length
                        }
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pipeline-history-list-heading">
          <strong>
            {PIPELINE_EVENTS.find((event) => event.key === kind)?.label} · {rows.length} deals
            {month ? ` · ${month}` : ""}
          </strong>
          {month ? (
            <button type="button" onClick={() => setMonth("")}>
              Quitar mes ×
            </button>
          ) : null}
        </div>
        <div className="service-directory-results">
          {rows.map((row) => (
            <div className="service-directory-row" key={`${row.kind}:${row.deal.id}`}>
              <div>
                <a href={row.deal.url} target="_blank" rel="noopener noreferrer">
                  {row.deal.name}
                  <ExternalLink size={12} />
                </a>
                <small>
                  {row.deal.owner} · {PIPELINE_SOURCES[row.source]}
                </small>
                <small>
                  Fuente registrada: {row.deal.source || "Sin fuente"} · etapa de entrada:{" "}
                  {row.stage === "LOST" ? "Perdido" : row.stage}
                </small>
              </div>
              <div className="service-directory-value">
                <strong>{row.date.split("-").reverse().join("-")}</strong>
                <small>{money(row.deal.amountValue)} MRR actual</small>
              </div>
            </div>
          ))}
          {!rows.length ? (
            <p className="service-empty">Sin entradas registradas para esta selección.</p>
          ) : null}
        </div>
        <footer>
          Ordenado por fecha de entrada, más reciente primero. No se sustituyen fechas ausentes por
          creación ni cierre. MRR y fuente son los valores actuales del reporte; no sus valores
          históricos al entrar a etapa.
        </footer>
      </PopoverContent>
    </Popover>
  );
}
