import { useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { kamMeetingCoverage } from "@/lib/meeting-accounts";
import { KAM_OWNER_IDS } from "@/lib/owner-roles";
import type { MeetingEvent, MeetingReport } from "@/lib/meeting-metrics";
export function KamMeetingCoverage({
  portfolio,
  meetings,
  owners,
  ownerId,
  rangeLabel,
}: {
  portfolio: NonNullable<MeetingReport["portfolio"]>;
  meetings: MeetingEvent[];
  owners: [string, string][];
  ownerId: string;
  rangeLabel: string;
}) {
  const kams = owners.filter(
    ([id]) => KAM_OWNER_IDS.has(id) && (ownerId === "team" || id === ownerId),
  );
  if (!kams.length) return null;
  return (
    <section className="kam-meeting-coverage" aria-label="Cobertura de cartera KAM">
      <header>
        <h4>
          Cobertura de cartera <small>Solo KAM · cuentas agrupadas por ID Holding</small>
        </h4>
        <p>{rangeLabel} y filtros actuales · cartera verificada al {new Date(portfolio.checkedAt).toLocaleDateString("es-CL")}</p>
      </header>
      <div className="kam-coverage-grid">
        {kams.map(([id, name]) => (
          <KamCoverageCard key={id} id={id} name={name} portfolio={portfolio} meetings={meetings} />
        ))}
      </div>
    </section>
  );
}
function KamCoverageCard({
  id,
  name,
  portfolio,
  meetings,
}: {
  id: string;
  name: string;
  portfolio: NonNullable<MeetingReport["portfolio"]>;
  meetings: MeetingEvent[];
}) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<"met" | "unmet">("met"),
    [query, setQuery] = useState("");
  const [offset, setOffset] = useState(8);
  const coverage = kamMeetingCoverage(portfolio.companies, meetings, id);
  const percent =
    coverage.percent === null
      ? "—"
      : coverage.percent.toLocaleString("es-CL", { maximumFractionDigits: 1 }) + "%";
  const rows = coverage.rows.filter(
    (row) =>
      row.met === (view === "met") &&
      row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="kam-coverage-card"
          type="button"
          aria-label={`Ver cobertura de cartera de ${name}`}
          onClick={(event) => {
            const r = event.currentTarget.getBoundingClientRect(),
              h = Math.min(560, window.innerHeight * 0.75);
            setOffset(Math.max(16, (window.innerHeight - h) / 2) - r.bottom);
          }}
        >
          <span>{name}</span>
          <strong>{percent}</strong>
          <p>
            <b>{coverage.met}</b> de <b>{coverage.total}</b> cuentas con reunión
          </p>
          <span className="kam-coverage-track" aria-hidden="true">
            <i style={{ width: `${coverage.percent ?? 0}%` }} />
          </span>
          <small>{coverage.unmet} sin reunión confirmada en estos filtros</small>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="kam-coverage-popup won-mix-popover"
        side="bottom"
        sideOffset={offset}
        align="start"
        collisionPadding={16}
      >
        <header>
          <div>
            <h4>
              Cartera de {name} · {percent} cubierto
            </h4>
            <p>
              Una cuenta por holding; sin holding, una por ID de empresa. Empresas asignadas
              en HubSpot al {new Date(portfolio.checkedAt).toLocaleDateString("es-CL")}, sin filtro de ciclo de vida.
            </p>
          </div>
          <button aria-label="Cerrar cobertura de cartera" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </header>
        <div className="meeting-measure-toggle" role="group" aria-label="Estado de cobertura">
          <button aria-pressed={view === "met"} onClick={() => setView("met")}>
            Con reunión {coverage.met}
          </button>
          <button aria-pressed={view === "unmet"} onClick={() => setView("unmet")}>
            Sin reunión confirmada {coverage.unmet}
          </button>
        </div>
        <input
          type="search"
          placeholder="Buscar cuenta…"
          aria-label="Buscar cuenta de cartera"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="kam-coverage-account-list">
          {rows.map((row) => (
            <details key={row.key}>
              <summary>
                {row.name}
                <small>
                  {row.companies.length} {row.companies.length === 1 ? "empresa" : "empresas"}
                </small>
              </summary>
              {row.companies.map((company) => (
                <a href={company.url} key={company.id} target="_blank" rel="noopener noreferrer">
                  {company.name}
                  <ExternalLink size={11} />
                </a>
              ))}
            </details>
          ))}
          {!rows.length ? <p>Sin cuentas para esta búsqueda.</p> : null}
        </div>
        <footer>
          Solo cuentan reuniones con participación confirmada del KAM en cuentas de su cartera. El
          histórico de reuniones es parcial: «sin reunión confirmada» no acredita ausencia de
          contacto. {coverage.withoutHolding} empresas sin ID Holding se cuentan por separado.
          Cartera leída: {new Date(portfolio.checkedAt).toLocaleString("es-CL")}.
        </footer>
      </PopoverContent>
    </Popover>
  );
}
