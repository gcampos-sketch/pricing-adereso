import { kamMeetingCoverage } from "./meeting-accounts";
import type { MeetingCompany, MeetingReport } from "./meeting-metrics";
import { KAM_OWNER_IDS } from "./owner-roles";

export function kamPeriod(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Coyhaique",
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-Q${Math.ceil(Number(parts.find((p) => p.type === "month")!.value) / 3)}`;
}

/** Same account/attendance definition as the dashboard; a partial edition only establishes a lower bound. */
export function buildKamCoverage(input: {
  ownerId: string;
  period: string;
  companies: MeetingCompany[];
  portfolioCheckedAt: string;
  meetings: MeetingReport | null;
  now: Date;
}) {
  if (!KAM_OWNER_IDS.has(input.ownerId)) throw Error("El owner no pertenece al rol KAM.");
  if (!/^\d{4}-Q[1-4]$/.test(input.period)) throw Error("Período inválido. Usa YYYY-Qn.");
  const [year, quarter] = input.period.split("-Q");
  const start = `${year}-${String((Number(quarter) - 1) * 3 + 1).padStart(2, "0")}-01`;
  const end =
    Number(quarter) === 4
      ? `${Number(year) + 1}-01-01`
      : `${year}-${String(Number(quarter) * 3 + 1).padStart(2, "0")}-01`;
  const report = input.meetings;
  const valid =
    report?.participationAuthority === "diio-recording" &&
    report.accountIdentityAuthority === "hubspot-id-holding" &&
    Number.isFinite(Date.parse(report.fetchedAt)) &&
    Date.parse(report.fetchedAt) <= input.now.getTime();
  const byCompany = new Map(input.companies.map((company) => [company.id, company]));
  const events = valid
    ? report.events
        .filter((event) => {
          const day = event.date.slice(0, 10);
          return (
            day >= start &&
            day < end &&
            Date.parse(event.startedAt ?? event.date) <= input.now.getTime() &&
            event.companyAttributionComplete === true
          );
        })
        .map((event) => ({
          ...event,
          companies: (event.companies ?? []).flatMap((company) =>
            byCompany.has(company.id) ? [byCompany.get(company.id)!] : [],
          ),
        }))
    : [];
  const result = kamMeetingCoverage(input.companies, events, input.ownerId);
  // Missing meetings/ambiguous attribution cannot establish an absence or an exact percentage.
  const complete =
    !!valid &&
    report.complete &&
    report.events.every((event) => event.companyAttributionComplete === true);
  return {
    status:
      !valid || !result.total || (!complete && !result.met)
        ? "unavailable"
        : complete
          ? "verified"
          : "partial",
    value:
      !valid || !result.total || (!complete && !result.met)
        ? null
        : `${complete ? "" : "≥ "}${(complete ? result.percent! : Math.floor(result.percent! * 10) / 10).toFixed(1)} %`,
    period: input.period,
    periodStart: start,
    periodEndExclusive: end,
    portfolioCheckedAt: input.portfolioCheckedAt,
    meetingsCheckedAt: valid ? report.fetchedAt : null,
    complete,
    denominator: result.total,
    confirmed: valid ? result.met : null,
    methodology:
      "Cartera actual por company owner; una cuenta por id_holding o company ID. Reunión con participación KAM y asociación de empresa verificadas. Sin filtro lifecycle.",
    reason: !valid
      ? "No hay una edición de reuniones con participación e identidad verificadas."
      : !result.total
        ? "La cartera consultada no contiene cuentas asignadas."
        : complete
          ? null
          : "Historial parcial: el porcentaje es un mínimo confirmado. Las cuentas restantes no prueban falta de contacto; la fecha de reuniones es independiente del corte de cartera.",
    rows: result.rows.map((row) => ({
      ...row,
      meetingState: row.met ? "confirmed" : "not_verified_in_edition",
    })),
  };
}
