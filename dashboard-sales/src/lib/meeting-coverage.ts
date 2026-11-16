import type { MeetingEvent, MeetingReport } from "./meeting-metrics";
import { diioIdsFromNote } from "./diio-meeting-evidence";
export type CalendarObservation = {
  id: string;
  name: string;
  status: string;
  start: string;
  end: string;
  url: string;
  calendarId: string;
  organizer?: string | null;
};
export type CalendarAudit = {
  checkedAt: string;
  start: string;
  end: string;
  complete: boolean;
  calendars: { id: string; complete: boolean; events: Omit<CalendarObservation, "calendarId">[] }[];
};
export type RegistryRecord = {
  hubspotMeetingId: string;
  name: string;
  startedAt: string;
  outcome: string;
  dealIds: string[];
  ownerId: string;
  externalUrl: string | null;
  recordingUrl: string | null;
  body?: string | null;
  ownerName?: string;
};
export type CalendarState =
  | "verified"
  | "guest_copy"
  | "different_date"
  | "cancelled"
  | "missing_id"
  | "not_found"
  | "outside_coverage"
  | "calendar_not_covered"
  | "ambiguous";
export const CALENDAR_STATES: Record<CalendarState, string> = {
  verified: "Cita verificada en calendario",
  guest_copy: "Mismo ID, fecha y organizador en una agenda invitada",
  different_date: "Fecha distinta en calendario",
  cancelled: "Cita cancelada en calendario",
  missing_id: "Sin enlace de calendario verificable",
  not_found: "Sin coincidencia visible en calendario",
  outside_coverage: "Período de calendario sin revisar",
  calendar_not_covered: "Agenda fuera de la cobertura revisada",
  ambiguous: "Varios enlaces de calendario: revisar",
};
export const MEETING_OUTCOMES: Record<string, string> = {
  COMPLETED: "Marcada como realizada",
  SCHEDULED: "Agendada",
  RESCHEDULED: "Reprogramada",
  NO_SHOW: "No asistió",
  CANCELED: "Cancelada",
  UNKNOWN: "Estado sin registrar",
};
export const calendarIsVerified = (state: CalendarState) =>
  state === "verified" || state === "guest_copy";
export const isPerformedMeeting = (row: { outcome: string; startedAt: string }, now: number) =>
  row.outcome === "COMPLETED" &&
  Number.isFinite(Date.parse(row.startedAt)) &&
  Date.parse(row.startedAt) <= now;
export type RegistryMeeting = MeetingEvent & {
  hubspotUrl: string;
  startedAt: string;
  outcome: string;
  activityOwnerId: string;
  activityOwnerName: string;
  calendarReference?: { calendarId: string; url: string };
  diioIds: string[];
  diioState: "verified" | "different_date" | "ambiguous" | "not_verified";
  calendarState: CalendarState;
  calendars: CalendarObservation[];
};
export type MeetingCoverage = {
  checkedAt: string;
  start: string;
  end: string;
  complete: boolean;
  calendarStart: string;
  calendarEnd: string;
  calendarComplete: boolean;
  calendarCount: number;
  globalRecords: number;
  withoutCommercialDeal: number;
  events: RegistryMeeting[];
};
/** Google Calendar's URL embeds the exact event + calendar key, not a title/time guess. */
export function googleCalendarKey(
  raw: string | null,
): { eventId: string; calendarId: string } | null {
  try {
    if (!raw) return null;
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !["www.google.com", "calendar.google.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      !/^\/calendar\/event\/?$/.test(url.pathname)
    )
      return null;
    const encoded = url.searchParams.get("eid");
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const separator = decoded.lastIndexOf(" ");
    if (separator < 1) return null;
    const eventId = decoded.slice(0, separator),
      calendarId = decoded.slice(separator + 1).toLowerCase();
    return eventId && calendarId.includes("@") ? { eventId, calendarId } : null;
  } catch {
    return null;
  }
}
export function businessMeetingDay(raw: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Coyhaique",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.parse(raw));
}
export function buildMeetingCoverage(
  records: RegistryRecord[],
  calendar: CalendarAudit,
  diio: MeetingReport,
  window: { start: string; end: string; checkedAt: string; complete: boolean },
): MeetingCoverage {
  const byCalendar = new Map<string, CalendarObservation[]>();
  for (const cal of calendar.calendars)
    for (const event of cal.events) {
      const key = `${cal.id.toLowerCase()}\n${event.id}`;
      byCalendar.set(key, [
        ...(byCalendar.get(key) ?? []),
        {
          id: event.id,
          name: event.name,
          status: event.status,
          start: event.start,
          end: event.end,
          url: event.url,
          calendarId: cal.id,
          organizer: event.organizer ?? null,
        },
      ]);
    }
  const diioById = new Map(diio.events.map((event) => [event.id, event]));
  const events: RegistryMeeting[] = [];
  for (const row of new Map(records.map((row) => [row.hubspotMeetingId, row])).values()) {
    if (!row.dealIds.length || !Number.isFinite(Date.parse(row.startedAt))) continue;
    const direct = [row.externalUrl, row.recordingUrl].filter((s): s is string => !!s);
    const found = diioIdsFromNote(
      direct.map((url) => `<a href="${url}">Diio</a>`).join("") + (row.body ?? ""),
      "https://adereso.diio.com",
    );
    const diioIds = found.filter((id) =>
      diioById.get(id)?.dealIds.some((deal) => row.dealIds.includes(deal)),
    );
    const match = diioIds.length === 1 ? diioById.get(diioIds[0]!) : undefined;
    const date = businessMeetingDay(row.startedAt);
    const verifiedType = diio.classificationAuthority === "diio" && match?.date === date;
    const references = new Map(
      direct.flatMap((url) => {
        const key = googleCalendarKey(url);
        return key ? [[`${key.calendarId}\n${key.eventId}`, key] as const] : [];
      }),
    );
    let calendarState: CalendarState = "missing_id",
      calendars: CalendarObservation[] = [];
    if (
      Date.parse(row.startedAt) < Date.parse(calendar.start) ||
      Date.parse(row.startedAt) >= Date.parse(calendar.end)
    )
      calendarState = "outside_coverage";
    else if (references.size > 1) calendarState = "ambiguous";
    else if (references.size === 1) {
      const [key, ref] = [...references][0]!;
      calendars = byCalendar.get(key) ?? [];
      if (
        !calendars.length &&
        !calendar.calendars.some((cal) => cal.id.toLowerCase() === ref.calendarId && cal.complete)
      ) {
        calendarState = "calendar_not_covered";
        const copies = [...byCalendar.values()]
          .flat()
          .filter(
            (event) =>
              event.id === ref.eventId &&
              event.organizer?.toLowerCase() === ref.calendarId &&
              event.status !== "cancelled" &&
              Date.parse(event.start) === Date.parse(row.startedAt),
          );
        if (copies.length) {
          calendars = copies;
          calendarState = "guest_copy";
        }
      } else if (!calendars.length) calendarState = "not_found";
      else if (calendars.some((event) => event.status === "cancelled")) calendarState = "cancelled";
      else if (calendars.every((event) => Date.parse(event.start) === Date.parse(row.startedAt)))
        calendarState = "verified";
      else calendarState = "different_date";
    }
    events.push({
      id: `hubspot:${row.hubspotMeetingId}`,
      name: row.name,
      date,
      type: verifiedType ? match!.type : "unknown",
      dealIds: [...new Set(row.dealIds)],
      hubspotUrl: `https://app.hubspot.com/contacts/23480943/record/0-47/${row.hubspotMeetingId}`,
      startedAt: row.startedAt,
      outcome: row.outcome,
      activityOwnerId: row.ownerId,
      activityOwnerName:
        row.ownerName ||
        (row.ownerId ? "Nombre de responsable no disponible" : "Sin responsable registrado"),
      ...(references.size === 1
        ? {
            calendarReference: {
              calendarId: [...references.values()][0]!.calendarId,
              url: direct.find((url) => googleCalendarKey(url))!,
            },
          }
        : {}),
      diioIds,
      diioState:
        diioIds.length > 1
          ? "ambiguous"
          : match
            ? match.date === date
              ? "verified"
              : "different_date"
            : "not_verified",
      calendarState,
      calendars,
      classification: verifiedType
        ? (match!.classification ?? "Clasificación verificada en Diio")
        : "Sin cruce de clasificación verificable con Diio",
      ...(match?.diioUrl ? { diioUrl: match.diioUrl } : {}),
    });
  }
  return {
    checkedAt: window.checkedAt,
    start: window.start,
    end: window.end,
    complete: window.complete,
    calendarStart: calendar.start,
    calendarEnd: calendar.end,
    calendarComplete: calendar.complete && calendar.calendars.every((cal) => cal.complete),
    calendarCount: calendar.calendars.filter((cal) => cal.complete).length,
    globalRecords: records.length,
    withoutCommercialDeal: records.filter((row) => !row.dealIds.length).length,
    events,
  };
}
