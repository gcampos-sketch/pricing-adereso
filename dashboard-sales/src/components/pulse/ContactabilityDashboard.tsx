import { useState, type ReactNode } from "react";
import { Mail, MessageCircle, Phone, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CONTACT_CHANNELS,
  type ContactabilityReport,
  type ContactChannel,
} from "@/lib/contactability";
import { ROLE_OPTIONS, roleOfOwner, type RoleFilter } from "@/lib/owner-roles";
import "./ContactabilityDashboard.css";

const meta = {
  calls: { label: "Llamadas registradas", short: "Llamadas", Icon: Phone },
  whatsapp: { label: "WhatsApp registrados", short: "WhatsApp", Icon: MessageCircle },
  emails: { label: "Correos enviados", short: "Correos", Icon: Mail },
};
const date = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Coyhaique",
});
const number = new Intl.NumberFormat("es-CL");
const PAGE_SIZE = 25;

export function ContactabilityDashboard({
  report,
  tabs,
  role,
  onRole,
}: {
  report: ContactabilityReport;
  tabs: ReactNode;
  role: RoleFilter;
  onRole: (role: RoleFilter) => void;
}) {
  const [days, setDays] = useState(30);
  const [owner, setOwner] = useState("team");
  const [channel, setChannel] = useState<ContactChannel>("calls");
  const [page, setPage] = useState(1);
  const owners = report.owners.filter(({ id }) => role === "all" || roleOfOwner(id) === role);
  const ownerNames = new Map(owners.map(({ id, name }) => [id, name]));
  const start = Date.parse(report.generatedAt) - days * 86_400_000;
  const rows = (kind: ContactChannel, selected: string) =>
    report.channels[kind]?.filter(
      (row) =>
        ownerNames.has(row.ownerId) &&
        (selected === "team" || row.ownerId === selected) &&
        Date.parse(row.at) >= start,
    );
  const counted = (kind: ContactChannel, selected: string) =>
    rows(kind, selected)?.filter(({ outcome }) => kind !== "whatsapp" || outcome !== "Borrador");
  const scopedOwners = owners.filter(({ id }) => owner === "team" || id === owner);
  const details = rows(channel, owner);
  const pageCount = Math.ceil((details?.length ?? 0) / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, pageCount));
  const countLabel = (count: number | undefined) =>
    count === undefined ? "Sin datos" : number.format(count);
  function selectChannel(kind: ContactChannel) {
    setChannel(kind);
    setPage(1);
  }

  return (
    <main className="pulse-main contactability">
      {tabs}
      <header className="team-header">
        <div>
          <h1 className="pulse-h1">Contactabilidad</h1>
          <p className="eyebrow">
            Actividad de AE y KAM registrada en HubSpot y asociada a deals del Pipeline Comercial.
          </p>
        </div>
      </header>

      <div className="contactability-filters">
        <label>
          Período
          <select
            value={days}
            onChange={(event) => {
              setDays(Number(event.target.value));
              setPage(1);
            }}
          >
            <option value={30}>Últimos 30 días</option>
            <option value={7}>Últimos 7 días</option>
          </select>
        </label>
        <label>
          Rol
          <select
            value={role}
            onChange={(event) => {
              onRole(event.target.value as RoleFilter);
              setOwner("team");
              setPage(1);
            }}
          >
            {ROLE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Comercial
          <select
            value={owner}
            onChange={(event) => {
              setOwner(event.target.value);
              setPage(1);
            }}
          >
            <option value="team">Todos los comerciales</option>
            {owners.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="contactability-metrics" aria-label="Resumen por canal">
        {CONTACT_CHANNELS.map((kind) => {
          const { label, Icon } = meta[kind];
          const count = counted(kind, owner)?.length;
          const channelRows = rows(kind, owner);
          const connected = channelRows?.filter(({ outcome }) => outcome === "Conectada").length;
          const sent = channelRows?.filter(({ outcome }) => outcome === "Enviado").length;
          const received = channelRows?.filter(({ outcome }) => outcome === "Recibido").length;
          const note =
            count === undefined
              ? "Lectura de HubSpot incompleta"
              : kind === "calls"
                ? `${countLabel(connected)} conectadas`
                : kind === "whatsapp"
                  ? `${countLabel(sent)} enviados · ${countLabel(received)} recibidos · ${count - (sent ?? 0) - (received ?? 0)} sin dirección confirmada`
                  : `${new Set(channelRows?.flatMap(({ deals }) => deals.map(({ id }) => id))).size} deals con correo`;
          return (
            <button
              type="button"
              key={kind}
              className="metric contactability-metric"
              aria-pressed={channel === kind}
              aria-controls="contactability-detail"
              onClick={() => selectChannel(kind)}
            >
              <span className="metric-label">
                <Icon size={16} aria-hidden="true" />
                {label}
              </span>
              <strong className="metric-value">{countLabel(count)}</strong>
              <span className="metric-note">{note}</span>
            </button>
          );
        })}
      </section>

      <section aria-labelledby="contactability-by-owner">
        <h2 id="contactability-by-owner">Actividad por comercial</h2>
        <div className="table-wrap">
          <table className="pulse-table">
            <thead>
              <tr>
                <th scope="col">Comercial</th>
                {CONTACT_CHANNELS.map((kind) => (
                  <th scope="col" key={kind}>
                    {meta[kind].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scopedOwners.map(({ id, name }) => (
                <tr key={id}>
                  <th scope="row">{name}</th>
                  {CONTACT_CHANNELS.map((kind) => (
                    <td key={kind}>{countLabel(counted(kind, id)?.length)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="contactability-detail" aria-labelledby="contactability-detail-title">
        <h2 id="contactability-detail-title">Detalle · {meta[channel].short}</h2>
        {channel === "whatsapp" && (
          <p className="eyebrow">
            El total incluye registros sin dirección confirmada. Los borradores solo aparecen en el
            detalle.
          </p>
        )}
        {details === undefined ? (
          <div className="empty-state" role="status">
            No pudimos confirmar la cobertura de este canal. Usa Actualizar para volver a consultar
            HubSpot.
          </div>
        ) : details.length === 0 ? (
          <div className="empty-state">
            HubSpot no registra actividad asociada a deals para estos filtros.
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="pulse-table">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Comercial</th>
                    <th scope="col">Resultado</th>
                    <th scope="col">Deal en HubSpot</th>
                  </tr>
                </thead>
                <tbody>
                  {details
                    .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                    .map((row) => (
                      <tr key={row.id}>
                        <td>
                          <time dateTime={row.at}>{date.format(new Date(row.at))}</time>
                        </td>
                        <td>{ownerNames.get(row.ownerId)}</td>
                        <td>
                          {row.outcome}
                          {row.direction ? ` · ${row.direction}` : ""}
                        </td>
                        <td>
                          {row.deals.map(({ id, name }) => (
                            <a
                              key={id}
                              className="contactability-deal"
                              target="_blank"
                              rel="noreferrer"
                              href={`https://app.hubspot.com/contacts/23480943/deal/${id}?utm_source=hub_comercial&utm_medium=contactabilidad`}
                            >
                              {name} <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="contactability-pagination" aria-label="Paginación de actividades">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Anterior
                </Button>
                <span aria-live="polite">
                  {currentPage} de {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
