import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getServiceOverview } from "@/lib/pulse.functions";
import {
  customerIndustryCluster,
  serviceMonths,
  upcomingThisQuarter,
  type ServiceOverview as Overview,
} from "@/lib/service-overview";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const dateLabel = (value: string) => (value ? value.split("-").reverse().join("-") : "Sin fecha");
const monthLabel = (key: string) =>
  key === "undated"
    ? "Sin fecha de inicio de servicio"
    : new Date(`${key}-01T12:00:00Z`).toLocaleDateString("es-CL", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });

function DirectoryPopup({
  title,
  description,
  trigger,
  children,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="service-directory-popup won-mix-popover"
        align="end"
        sideOffset={10}
        collisionPadding={12}
      >
        <header>
          <div>
            <h4>{title}</h4>
            <p>{description}</p>
          </div>
          <button type="button" aria-label={`Cerrar ${title}`} onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </header>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function ServiceOverview({
  children,
  refreshKey,
}: {
  children: ReactNode;
  refreshKey: string;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [industry, setIndustry] = useState("");
  const [devQuery, setDevQuery] = useState("");
  const [devOwner, setDevOwner] = useState("");
  useEffect(() => {
    let active = true;
    setError(false);
    getServiceOverview()
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) {
          setData(null);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [refreshKey, retry]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Coyhaique",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const next = upcomingThisQuarter(data?.development ?? [], today);
  const devTotal = data?.development.reduce((sum, row) => sum + row.mrr, 0) ?? 0;
  const nextTotal = next.reduce((sum, row) => sum + row.mrr, 0);
  const undated = data?.development.filter((row) => !row.date).length ?? 0;
  const overdue = data?.development.filter((row) => row.date && row.date < today).length ?? 0;
  const quarter = Math.ceil(Number(today.slice(5, 7)) / 3);
  const customers = (data?.customers ?? []).filter(
    (row) =>
      (!owner || row.owner === owner) &&
      (!industry ||
        row.industries.includes(industry) ||
        (industry === "Sin industria" && !row.industries.length)) &&
      normalized(
        `${row.name} ${row.owner} ${row.industries.join(" ")} ${row.deals.map((deal) => deal.name).join(" ")}`,
      ).includes(normalized(query)),
  );
  const clusters = [...new Set(customers.map((row) => customerIndustryCluster(row)))].sort();
  const owners = [...new Set(data?.customers.map((row) => row.owner))].sort();
  const industries = [
    ...new Set(
      data?.customers.flatMap((row) =>
        row.industries.length ? row.industries : ["Sin industria"],
      ),
    ),
  ].sort();
  const developmentPopup = (upcoming: boolean) => {
    const rows = (upcoming ? next : (data?.development ?? [])).filter(
      (row) =>
        (!devOwner || row.owner === devOwner) &&
        normalized(`${row.name} ${row.owner} ${row.industry}`).includes(normalized(devQuery)),
    );
    return (
      <DirectoryPopup
        title={
          upcoming ? `Inicios previstos · Q${quarter} ${today.slice(0, 4)}` : "Por iniciar servicio"
        }
        description={
          upcoming
            ? "Desde hoy hasta el fin del trimestre actual, según inicio del servicio. Son fechas previstas, no ingresos confirmados."
            : "Negocios E6 firmados y 6.2 en desarrollo, excluyendo empresas en churn. Este MRR aún no está en servicio."
        }
        trigger={
          <button type="button" className="service-overview-metric" disabled={!data}>
            <span>{upcoming ? `Inicio previsto · Q${quarter}` : "Por iniciar servicio"}</span>
            <strong>
              {data ? money(upcoming ? nextTotal : devTotal) : "—"}
              <small> MRR</small>
            </strong>
            <small>
              {data
                ? upcoming
                  ? `${next.length} con fecha futura · ${undated} sin fecha`
                  : `${data.development.length} negocios · firmados + en desarrollo`
                : error
                  ? "Datos no disponibles"
                  : "Cargando negocios…"}
            </small>
          </button>
        }
      >
        <div className="service-directory-filters">
          <label>
            <Search size={14} />
            <input
              aria-label="Buscar negocios por iniciar servicio"
              placeholder="Buscar negocio, industria…"
              value={devQuery}
              onChange={(event) => setDevQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar por propietario del negocio"
            value={devOwner}
            onChange={(event) => setDevOwner(event.target.value)}
          >
            <option value="">Todos los propietarios del negocio</option>
            {[...new Set(data?.development.map((row) => row.owner))].sort().map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <p className="service-planning-note">
          {undated} sin fecha de inicio · {overdue} con fecha prevista vencida.{" "}
          {upcoming
            ? "Las fechas pendientes o vencidas no se incluyen como inicios futuros."
            : "Las fechas son las registradas en HubSpot, no una promesa confirmada de salida."}
        </p>
        <div className="service-directory-results">
          <p className="service-result-count">
            {rows.length} negocios · {money(rows.reduce((sum, row) => sum + row.mrr, 0))} MRR
          </p>
          {serviceMonths(rows).map((group) => (
            <section key={group.key}>
              <h5>
                {monthLabel(group.key)}
                <small>
                  {group.deals.length} · {money(group.deals.reduce((sum, row) => sum + row.mrr, 0))}{" "}
                  MRR
                </small>
              </h5>
              {group.deals.map((deal) => (
                <div className="service-directory-row" key={deal.id}>
                  <div>
                    <a
                      href={`https://app.hubspot.com/contacts/23480943/deal/${deal.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {deal.name}
                      <ExternalLink size={12} />
                    </a>
                    <small>
                      {deal.stage} · {deal.owner}
                    </small>
                    <small>{deal.industry}</small>
                  </div>
                  <div className="service-directory-value">
                    <strong>{money(deal.mrr)}</strong>
                    <small>{dateLabel(deal.date)}</small>
                    {deal.date && deal.date < today ? (
                      <small className="service-date-overdue">Fecha prevista vencida</small>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          ))}
          {!rows.length ? <p className="service-empty">No hay negocios que coincidan.</p> : null}
        </div>
        <footer>
          Orden por inicio del servicio, del más próximo al más lejano. Sin fecha, al final.
        </footer>
      </DirectoryPopup>
    );
  };
  return (
    <section
      className="service-overview"
      aria-label="Clientes y entrada a servicio · foto global de hoy"
    >
      <DirectoryPopup
        title="Clientes"
        description="Empresas únicas con ciclo de vida Cliente en HubSpot. Industria Adereso tomada de sus negocios del pipeline comercial; el responsable es el propietario de la empresa."
        trigger={
          <button type="button" className="service-overview-metric" disabled={!data}>
            <span>Clientes</span>
            <strong>{data ? data.customers.length : "—"}</strong>
            <small>Ciclo de vida · Cliente</small>
          </button>
        }
      >
        <div className="service-directory-filters">
          <label>
            <Search size={14} />
            <input
              aria-label="Buscar clientes"
              placeholder="Buscar empresa, negocio o responsable…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar clientes por industria Adereso"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          >
            <option value="">Todas las industrias</option>
            {industries.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div
          className="service-owner-shortcuts"
          role="group"
          aria-label="Propietario de la empresa · KAM o AE"
        >
          <button type="button" aria-pressed={!owner} onClick={() => setOwner("")}>
            Todos
          </button>
          {owners.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={owner === name}
              onClick={() => setOwner(owner === name ? "" : name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="service-directory-results">
          <p className="service-result-count">
            {customers.length} de {data?.customers.length ?? 0} clientes · agrupados por industria
            más frecuente
          </p>
          {clusters.map((cluster) => (
            <section key={cluster}>
              <h5>
                {cluster}
                <small>
                  {customers.filter((row) => customerIndustryCluster(row) === cluster).length}{" "}
                  empresas
                </small>
              </h5>
              {customers
                .filter((row) => customerIndustryCluster(row) === cluster)
                .map((customer) => (
                  <div className="service-directory-row" key={customer.id}>
                    <div>
                      <a
                        href={`https://app.hubspot.com/contacts/23480943/company/${customer.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {customer.name}
                        <ExternalLink size={12} />
                      </a>
                      <small>Propietario empresa · {customer.owner}</small>
                      <small>
                        {customer.industries
                          .filter((name) => name !== "Sin industria")
                          .join(" · ") || "Sin industria"}
                      </small>
                      {customer.deals.length ? (
                        <details className="service-customer-deals">
                          <summary>
                            {customer.deals.length}{" "}
                            {customer.deals.length === 1
                              ? "negocio asociado"
                              : "negocios asociados"}
                          </summary>
                          {customer.deals.map((deal) => (
                            <a
                              className="service-linked-deal"
                              key={deal.id}
                              href={`https://app.hubspot.com/contacts/23480943/deal/${deal.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {deal.name} · {deal.industry}
                              <ExternalLink size={10} />
                            </a>
                          ))}
                        </details>
                      ) : null}
                      {!customer.deals.length ? (
                        <small>Sin negocio comercial asociado · industria no disponible</small>
                      ) : null}
                    </div>
                  </div>
                ))}
            </section>
          ))}
          {!customers.length ? (
            <p className="service-empty">No hay clientes que coincidan.</p>
          ) : null}
        </div>
        <footer>
          Una empresa cuenta una vez. Cada empresa se agrupa por la industria más frecuente en sus
          negocios; puedes ver todas al expandirlos. Foto global de hoy; independiente de los
          filtros del tablero.
        </footer>
      </DirectoryPopup>
      {children}
      {developmentPopup(false)}
      {developmentPopup(true)}
      {error ? (
        <button
          type="button"
          className="service-overview-error"
          onClick={() => setRetry((value) => value + 1)}
        >
          No se pudo cargar clientes y próximos inicios. Reintentar
        </button>
      ) : null}
    </section>
  );
}
