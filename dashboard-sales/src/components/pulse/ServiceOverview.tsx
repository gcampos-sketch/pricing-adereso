import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Info, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getServiceOverview } from "@/lib/pulse.functions";
import {
  customerIndustryCluster,
  serviceClientProjection,
  servicePeriodGroups,
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
    : key.includes("-Q")
      ? `Q${key.slice(-1)} · ${key.slice(0, 4)}`
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
  compact = false,
  headerTools,
  information,
  className = "",
}: {
  information?: ReactNode;
  className?: string;
  compact?: boolean;
  headerTools?: ReactNode;
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
        className={`service-directory-popup won-mix-popover${compact ? " service-planning-popup" : ""} ${className}`}
        align="end"
        sideOffset={10}
        collisionPadding={12}
      >
        <header>
          <div>
            <h4>{title}</h4>
            {!compact ? <p>{description}</p> : null}
          </div>
          {headerTools}
          {compact ? (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label={`Información de ${title}`}>
                  <Info size={15} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className={`service-planning-info${className === "customer-directory-popup" ? " customer-directory-info" : ""}`}
                side="bottom"
                align="end"
              >
                <p>{description}</p>
                {information ?? (
                  <p>
                    Fechas previstas de HubSpot, no inicios confirmados. Los vencidos aún figuran
                    pendientes; los negocios sin fecha se agrupan al final.
                  </p>
                )}
              </PopoverContent>
            </Popover>
          ) : null}
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
  currentServiceMrr,
}: {
  children: ReactNode;
  refreshKey: string;
  currentServiceMrr: number;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [customerStatus, setCustomerStatus] = useState<"service" | "won" | "churn" | "review">("service");
  const [industry, setIndustry] = useState("");
  const [devQuery, setDevQuery] = useState("");
  const [devOwner, setDevOwner] = useState("");
  const [serviceGroupUnit, setServiceGroupUnit] = useState<"month" | "quarter">("month");
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
  const clientProjection = data ? serviceClientProjection(data) : null;
  const next = upcomingThisQuarter(data?.development ?? [], today);
  const devTotal = data?.development.reduce((sum, row) => sum + row.mrr, 0) ?? 0;
  const nextTotal = next.reduce((sum, row) => sum + row.mrr, 0);
  const undated = data?.development.filter((row) => !row.date).length ?? 0;
  const overdue = data?.development.filter((row) => row.date && row.date < today).length ?? 0;
  const quarter = Math.ceil(Number(today.slice(5, 7)) / 3);
  const serviceCustomers = (data?.customers ?? []).filter(account => account.deals.some(deal => deal.stage === "173990327"));
  const customerPopulation = customerStatus === "service" ? serviceCustomers
    : customerStatus === "churn" ? (data?.churnCustomers ?? [])
    : customerStatus === "review" ? (data?.pendingCustomers ?? [])
    : (data?.customers ?? []);
  const customers = customerPopulation.filter(
    (row) =>
      (!owner || (row.owners ?? [row.owner]).includes(owner)) &&
      (!industry ||
        row.industries.includes(industry) ||
        (industry === "Sin industria" && !row.industries.length)) &&
      normalized(
        `${row.name} ${row.owner} ${row.holdingId ?? ""} ${row.instanceIds?.join(" ") ?? ""} ${row.companies?.map((company) => company.name).join(" ") ?? ""} ${row.industries.join(" ")} ${row.deals.map((deal) => deal.name).join(" ")}`,
      ).includes(normalized(query)),
  );
  const clusters = [...new Set(customers.map((row) => customerIndustryCluster(row)))].sort();
  const owners = [
    ...new Set(customerPopulation.flatMap((row) => row.owners ?? [row.owner])),
  ].sort();
  const industries = [
    ...new Set(
      customerPopulation.flatMap((row) =>
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
        compact
        headerTools={
          <div
            className="service-period-toggle"
            role="group"
            aria-label="Agrupar negocios por inicio previsto"
          >
            <button
              type="button"
              aria-pressed={serviceGroupUnit === "month"}
              onClick={() => setServiceGroupUnit("month")}
            >
              Mes
            </button>
            <button
              type="button"
              aria-pressed={serviceGroupUnit === "quarter"}
              onClick={() => setServiceGroupUnit("quarter")}
            >
              Q
            </button>
          </div>
        }
        title={
          upcoming ? `Inicios previstos · Q${quarter} ${today.slice(0, 4)}` : "Por iniciar servicio"
        }
        description={
          upcoming
            ? "Desde hoy hasta el fin del trimestre actual, según inicio del servicio. Son fechas previstas, no ingresos confirmados."
            : "Negocios E6 firmados y 6.2 en desarrollo, excluyendo empresas en churn. Este MRR aún no está en servicio."
        }
        information={
          <>
            <p>MRR proyectado = MRR en servicio + MRR de estos negocios, si todos inician servicio.</p>
            <p>Clientes nuevos por iniciar: cuentas reconciliadas con un negocio en esta lista y sin otro negocio E8 vigente. Una expansión de un cliente en servicio no agrega otra cuenta.</p>
            <p>Clientes proyectados en servicio = {clientProjection?.current ?? "—"} actuales + {clientProjection?.newClients ?? "—"} por incorporar. El total de clientes con ganado también incluye otras etapas pendientes; no es la base de esta suma.</p>
            {clientProjection?.unresolvedDeals ? <p>{clientProjection.unresolvedDeals} negocios sin cuenta reconciliada no suman clientes hasta verificar su identidad; su MRR se conserva.</p> : null}
            <p>Fechas previstas de HubSpot, no inicios confirmados. Los vencidos siguen pendientes; sin fecha se agrupan al final.</p>
          </>
        }
        trigger={
          <button type="button" className="service-overview-metric service-growth-widget" disabled={!data}>
            <span className="service-growth-grid">
              <span className="service-growth-column">
                <span className="service-growth-label">MRR por iniciar</span>
                <strong><span className="service-pending-plus">+</span>{data ? money(devTotal) : "—"}</strong>
                <span className="service-growth-projection" title="Nuevo total de MRR en servicio si todos los negocios pendientes inician servicio.">
                  <span>Nuevo total MRR</span><b>{data ? money(currentServiceMrr + devTotal) : "—"}</b>
                </span>
                <small className="service-growth-footnote">
                  {data ? `${data.development.length} negocios · ${data.development.filter((deal) => deal.stage === "6.2 · En desarrollo").length} en desarrollo · ${data.development.filter((deal) => deal.stage === "E6 · Firmado").length} firmados` : error ? "Datos no disponibles" : "Cargando negocios…"}
                </small>
              </span>
              <span className="service-growth-column">
                <span className="service-growth-label">Clientes por incorporar</span>
                <strong><span className="service-pending-plus">+</span>{clientProjection?.newClients ?? "—"}</strong>
                <span className="service-growth-projection" title="Nuevo total de clientes en servicio si todas las cuentas pendientes se incorporan. Cada holding o instancia cuenta una vez; las expansiones no suman clientes.">
                  <span>Nuevo total clientes</span><b>{clientProjection?.projected ?? "—"}</b>
                </span>
                <small className="service-growth-footnote">
                  {clientProjection?.unresolvedDeals ? `${clientProjection.unresolvedDeals} negocios con cuenta por verificar` : "Si todos inician servicio · cuentas únicas"}
                </small>
              </span>
            </span>
          </button>
        }
      >
        <div
          className="service-planning-widgets"
          aria-label="Resumen de negocios por iniciar servicio"
        >
          <div>
            <span>MRR pendiente</span>
            <strong>{money(rows.reduce((sum, row) => sum + row.mrr, 0))}</strong>
          </div>
          <div>
            <span>Negocios</span>
            <strong>{rows.length}</strong>
          </div>
          <div>
            <span>Sin fecha</span>
            <strong>{rows.filter((row) => !row.date).length}</strong>
          </div>
          <div data-warning="true">
            <span>Vencidos</span>
            <strong>{rows.filter((row) => row.date && row.date < today).length}</strong>
          </div>
        </div>
        <div className="service-directory-filters">
          <label>
            <Search size={14} />
            <input
              aria-label="Buscar negocios por iniciar servicio"
              placeholder="Buscar negocio…"
              value={devQuery}
              onChange={(event) => setDevQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar por propietario del negocio"
            value={devOwner}
            onChange={(event) => setDevOwner(event.target.value)}
          >
            <option value="">Todos los responsables</option>
            {[...new Set(data?.development.map((row) => row.owner))].sort().map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="service-directory-results">
          {servicePeriodGroups(rows, serviceGroupUnit).map((group) => (
            <details
              className="service-start-cluster"
              key={`${serviceGroupUnit}:${group.key}`}
              data-undated={group.key === "undated" || undefined}
            >
              <summary>
                <span>{group.key === "undated" ? "Sin fecha" : monthLabel(group.key)}</span>
                <small>
                  {group.deals.length} {group.deals.length === 1 ? "negocio" : "negocios"} ·{" "}
                  {money(group.deals.reduce((sum, row) => sum + row.mrr, 0))} MRR
                </small>
              </summary>
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
            </details>
          ))}
          {!rows.length ? <p className="service-empty">No hay negocios que coincidan.</p> : null}
        </div>
      </DirectoryPopup>
    );
  };
  return (
    <section
      className="service-overview"
      aria-label="Clientes y entrada a servicio · foto global de hoy"
    >
      <DirectoryPopup
        compact
        className="customer-directory-popup"
        information={
          <>
            {data?.customerAudit ? (
              <details className="service-planning-note">
                <summary>Cómo se revisó el conteo</summary>
                <p>
                  {data.customerAudit.lifecycleCompanies} empresas etiquetadas Cliente no equivalen
                  a cuentas únicas. Se excluyen {data.customerAudit.churnOnlyAccounts} cuentas con
                  churn y sin ningún ganado vigente. {data.customerAudit.activeWithoutCustomerLabel}{" "}
                  cuentas incluidas no tienen etiqueta Cliente.
                </p>
                <p>
                  {data.customerAudit.lifecycleWithoutWon} cuentas etiquetadas Cliente no tienen un
                  ganado comercial vigente verificable. {data.customerAudit.withoutHolding}{" "}
                  cuenta(s) incluida(s) sin holding se identifican por instancia.
                </p>
                <p>
                  {data.customerAudit.conflictingInstances.length} IDs de instancia aparecen en
                  holdings distintos y no se fusionan.{" "}
                  {data.customerAudit.mismatchedDealInstances.length} negocios tienen discrepancias
                  entre ID de instancia del negocio y la empresa; no se usan para fusionar cuentas.{" "}
                  {data.customerAudit.unresolvedWon.length} ganado(s) sin empresa/instancia
                  inequívoca quedan pendientes y no suman otra cuenta.
                </p>
                {data.unresolvedCustomerDeals?.map((deal) => (
                  <p key={deal.id}>
                    <a
                      href={`https://app.hubspot.com/contacts/23480943/deal/${deal.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {deal.name} ↗
                    </a>
                  </p>
                ))}
                <p>
                  Foto del {new Date(data.fetchedAt).toLocaleString("es-CL")}. Revisión de datos
                  CRM; no certifica que una instancia esté operativa en producción.
                </p>
              </details>
            ) : null}
            <p>
              Cada holding cuenta una vez, aunque tenga varias empresas, instancias o negocios. Si
              no hay holding, solo se agrupa por ID de instancia exacto. Las cuentas con etiqueta
              Churn sin otro ganado corroborado y las identidades sin IDs quedan por revisar. Foto
              global de hoy, independiente de los filtros del tablero.
            </p>
          </>
        }
        title="Clientes"
        description="En servicio: cuentas únicas con un negocio E8 vigente, reconciliadas por holding o instancia. Churn: cuentas con negocios en etapa Churn y sin ningún ganado vigente E6–E8 en el mismo holding. Las etiquetas de ciclo de vida no deciden el conteo. Los casos sin identidad verificable quedan fuera del total churn."
        trigger={
          <button type="button" className="service-overview-metric" disabled={!data}>
            <span>Clientes en servicio</span>
            <strong>{data ? serviceCustomers.length : "—"}</strong>
            <small title="Cuentas únicas por holding o instancia, con un negocio en E8 vigente">
              Holding / instancia
              {data?.pendingCustomers?.length ? (
                <span className="service-customer-pending">
                  {data.pendingCustomers.length} por revisar
                </span>
              ) : null}
            </small>
          </button>
        }
      >
        <div
          className="customer-status-widgets"
          role="group"
          aria-label="Estado de validación de clientes"
        >
          {([
            ["service", "En servicio", serviceCustomers.length],
            ["churn", "Clientes churn", data?.churnCustomers?.length ?? 0],
            ["won", "Con ganado vigente", data?.customers.length ?? 0],
            ["review", "Por revisar", data?.pendingCustomers?.length ?? 0],
          ] as const).map(([status, label, count]) => (
            <button key={status} type="button" aria-pressed={customerStatus === status}
              onClick={() => { setCustomerStatus(status); setOwner(""); setIndustry(""); setQuery(""); }}>
              <span>{label}</span><strong>{count}</strong>
            </button>
          ))}
        </div>
        <div className="service-directory-filters">
          <label>
            <Search size={14} />
            <input
              aria-label="Buscar clientes"
              placeholder="Buscar cuenta…"
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
          <select
            aria-label="Filtrar clientes por responsable"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <option value="">Todos los responsables</option>
            {owners.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="service-directory-results">
          {query || owner || industry ? (
            <p className="service-result-count">
              {customers.length} de {customerPopulation.length} cuentas
            </p>
          ) : null}
          {clusters.map((cluster) => (
            <details
              className="service-start-cluster customer-industry-cluster"
              key={`${customerStatus}:${cluster}`}
            >
              <summary>
                <span>{cluster}</span>
                <small>
                  {customers.filter((row) => customerIndustryCluster(row) === cluster).length}{" "}
                  {customers.filter((row) => customerIndustryCluster(row) === cluster).length === 1
                    ? "cuenta"
                    : "cuentas"}
                </small>
              </summary>
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
                      <small>
                        {customer.holdingId ? `Holding ${customer.holdingId}` : "Sin ID Holding"} ·{" "}
                        {customer.instanceIds?.length
                          ? `Instancias ${customer.instanceIds.join(", ")}`
                          : "Sin ID de instancia"}
                      </small>
                      <small>Propietario empresa · {customer.owner}</small>
                      {customer.reviewReasons?.map((reason) => (
                        <small key={reason} className="service-date-overdue">
                          {reason}
                        </small>
                      ))}
                      {customer.companies && customer.companies.length > 1 ? (
                        <details className="service-customer-deals">
                          <summary>{customer.companies.length} empresas del holding</summary>
                          {customer.companies.map((company) => (
                            <a
                              key={company.id}
                              className="service-linked-deal"
                              href={`https://app.hubspot.com/contacts/23480943/company/${company.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {company.name} · {company.owner}
                              <ExternalLink size={10} />
                            </a>
                          ))}
                        </details>
                      ) : null}
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
                              {deal.instanceId
                                ? ` · Instancia ${deal.instanceId}`
                                : " · Sin ID instancia"}
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
            </details>
          ))}
          {!customers.length ? (
            <p className="service-empty">No hay clientes que coincidan.</p>
          ) : null}
        </div>
      </DirectoryPopup>
      {children}
      {developmentPopup(false)}
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
