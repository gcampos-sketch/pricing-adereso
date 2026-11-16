import type { DealDTO } from "./pulse-types";
import { wonAcquisitionSource } from "./won-distribution";
export type MeetingType = "A" | "B" | "C" | "unknown";
export type MeetingCompany = {
  id: string;
  name: string;
  url: string;
  holdingId?: string;
  holdingName?: string;
  ownerId?: string;
};
export type MeetingEvent = {
  id: string;
  date: string;
  type: MeetingType;
  dealIds: string[];
  name?: string;
  startedAt?: string;
  accountView?: {
    key: string;
    name: string;
    meetings: { id: string; date: string; name: string; type: MeetingType; diioUrl?: string }[];
  };
  diioUrl?: string;
  classification?: string;
  companies?: MeetingCompany[];
  companyAttributionComplete?: boolean;
  /** Confirmed intervention in the recording; never inferred from deal ownership. */
  participants?: { ownerId: string; name: string }[];
};
export type MeetingReport = {
  fetchedAt: string;
  events: MeetingEvent[];
  candidateDeals: number;
  scannedDeals: number;
  unresolved: number;
  conflicts: number;
  complete: boolean;
  source?: "diio-hubspot";
  classificationAuthority?: "diio";
  participationAuthority?: "diio-recording";
  coverage?: import("./meeting-coverage").MeetingCoverage;
  portfolio?: { checkedAt: string; complete: boolean; companies: MeetingCompany[] };
  accountIdentityAuthority?: "hubspot-id-holding";
  validation?: {
    listed: number;
    linked: number;
    pending: number;
    classified: number;
    nativeCompleted: number;
    nativeMatched: number;
  };
};
export type HistoryValue = { value?: string | null; timestamp?: string };
export const MEETING_PROPS = [
  "adobo_last_diio_meeting_id",
  "adobo_last_reu_date",
  "adobo_last_reu_tipo",
] as const;
const latest = (versions: HistoryValue[], at: number) =>
  versions
    .filter(
      (row) => Number.isFinite(Date.parse(row.timestamp ?? "")) && Date.parse(row.timestamp!) <= at,
    )
    .sort((a, b) => Date.parse(b.timestamp!) - Date.parse(a.timestamp!))[0];
export function meetingType(raw: string | null | undefined): MeetingType {
  const value = (raw ?? "").trim().toLowerCase();
  return (
    (
      {
        tipo_a: "A",
        tipo_b: "B",
        tipo_c: "C",
        tipo_d: "C",
        a: "A",
        b: "B",
        c: "C",
        d: "C",
      } as Record<string, MeetingType>
    )[value] ?? "unknown"
  );
}
/** Reconstruct explicit recorded CRM states. Never pair a new meeting ID with the previous meeting date. */
export function meetingsFromHistory(dealId: string, history: Record<string, HistoryValue[]>) {
  const [idKey, dateKey, typeKey] = MEETING_PROPS;
  const times = [
    ...new Set(
      MEETING_PROPS.flatMap((key) =>
        (history[key] ?? []).map((row) => Date.parse(row.timestamp ?? "")),
      ),
    ),
  ]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const records = new Map<
    string,
    { id: string; date: string; type: MeetingType; at: number; dealId: string }
  >();
  let unresolved = 0;
  for (const at of times) {
    const id = latest(history[idKey] ?? [], at),
      date = latest(history[dateKey] ?? [], at),
      type = latest(history[typeKey] ?? [], at);
    if (!id?.value?.trim()) continue;
    const stamp = Date.parse(date?.value ?? "");
    if (
      !date?.timestamp ||
      Date.parse(date.timestamp) < Date.parse(id.timestamp!) ||
      !Number.isFinite(stamp)
    )
      continue;
    records.set(id.value.trim(), {
      id: id.value.trim(),
      date: new Date(stamp).toISOString().slice(0, 10),
      type: meetingType(type?.value),
      at,
      dealId,
    });
  }
  for (const id of new Set((history[idKey] ?? []).map((row) => row.value?.trim()).filter(Boolean)))
    if (!records.has(id!)) unresolved++;
  return { records: [...records.values()], unresolved };
}
export function mergeMeetingRecords(records: ReturnType<typeof meetingsFromHistory>["records"]) {
  const grouped = new Map<string, typeof records>();
  for (const row of records) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);
  const events: MeetingEvent[] = [];
  let conflicts = 0;
  for (const [id, rows] of grouped) {
    const dates = new Set(rows.map((row) => row.date));
    const types = new Set(rows.map((row) => row.type).filter((type) => type !== "unknown"));
    if (dates.size !== 1 || types.size > 1) {
      conflicts++;
      continue;
    }
    events.push({
      id,
      date: rows[0]!.date,
      type: [...types][0] ?? "unknown",
      dealIds: [...new Set(rows.map((row) => row.dealId))],
    });
  }
  return { events: events.sort((a, b) => a.date.localeCompare(b.date)), conflicts };
}
export type ScopedMeeting = MeetingEvent & {
  deals: DealDTO[];
  owner: string;
  ownerId: string;
  source: string;
};
/** One real provider identity contributes once, regardless of deals or participant copies. */
export function uniqueMeetingEvents(events: MeetingEvent[]): MeetingEvent[] {
  const grouped = new Map<string, MeetingEvent[]>();
  for (const event of events) {
    if (!event.id.trim()) continue;
    grouped.set(event.id, [...(grouped.get(event.id) ?? []), event]);
  }
  return [...grouped.values()].flatMap((copies) => {
    if (new Set(copies.map((event) => event.date)).size !== 1) return [];
    const types = new Set(copies.map((event) => event.type));
    const participants = new Map(
      copies.flatMap((event) => event.participants ?? []).map((person) => [person.ownerId, person]),
    );
    return [
      {
        ...copies[0]!,
        dealIds: [...new Set(copies.flatMap((event) => event.dealIds))],
        ...(copies.some((event) => event.companies !== undefined)
          ? {
              companies: [
                ...new Map(
                  copies
                    .flatMap((event) => event.companies ?? [])
                    .map((company) => [company.id, company]),
                ).values(),
              ],
              companyAttributionComplete: copies.every(
                (event) => event.companyAttributionComplete === true,
              ),
            }
          : {}),
        ...(copies.some((event) => event.participants !== undefined)
          ? { participants: [...participants.values()] }
          : {}),
        ...(types.size > 1
          ? {
              type: "unknown" as const,
              classification:
                "Clasificación en revisión: evidencia contradictoria para la misma reunión.",
            }
          : {}),
      },
    ];
  });
}
export function scopeMeetings(
  events: MeetingEvent[],
  deals: DealDTO[],
  periods: string[],
  participantScope?: { ownerId: string; ownerIds: string[]; includeUnlinked?: boolean },
): ScopedMeeting[] {
  const byId = new Map(deals.map((deal) => [deal.id, deal]));
  const selected = new Set(periods);
  return uniqueMeetingEvents(events).flatMap((event) => {
    const month = Number(event.date.slice(5, 7));
    const period = `${event.date.slice(0, 4)}-Q${Math.ceil(month / 3)}`;
    if (!selected.has(period)) return [];
    const linked = event.dealIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    if (!linked.length && !participantScope?.includeUnlinked) return [];
    const participants =
      event.participants?.filter((person) => participantScope?.ownerIds.includes(person.ownerId)) ??
      [];
    if (
      participantScope &&
      (!participants.length ||
        (participantScope.ownerId !== "team" &&
          !participants.some((person) => person.ownerId === participantScope.ownerId)))
    )
      return [];
    const owners = new Set(linked.map((deal) => deal.ownerId));
    const sources = new Set(linked.map(wonAcquisitionSource));
    return [
      {
        ...event,
        deals: linked,
        ...(participantScope ? { participants } : {}),
        owner: participantScope
          ? participants.map((person) => person.name).join(", ")
          : owners.size === 1
            ? linked[0]!.owner
            : "Varios comerciales",
        ownerId: owners.size === 1 ? linked[0]!.ownerId : "shared",
        source: !linked.length
          ? event.dealIds.length
            ? "linked_unavailable"
            : "unlinked"
          : sources.size === 1
            ? [...sources][0]!
            : "shared",
      },
    ];
  });
}
export const MEETING_TYPES: MeetingType[] = ["A", "B", "C", "unknown"];
export const MEETING_LABELS: Record<MeetingType, string> = {
  A: "Tipo A",
  B: "Tipo B",
  C: "Tipo C",
  unknown: "Sin clasificar",
};
export function meetingCounts(rows: Pick<MeetingEvent, "type">[]) {
  return Object.fromEntries(
    MEETING_TYPES.map((type) => [type, rows.filter((row) => row.type === type).length]),
  ) as Record<MeetingType, number>;
}
export function meetingMonths(periods: string[], rows: ScopedMeeting[]) {
  const months = [
    ...new Set(
      periods.flatMap((period) => {
        const [year, q] = period.split("-Q");
        return [0, 1, 2].map(
          (offset) => `${year}-${String((Number(q) - 1) * 3 + offset + 1).padStart(2, "0")}`,
        );
      }),
    ),
  ].sort();
  return months.map((month) => ({ month, rows: rows.filter((row) => row.date.startsWith(month)) }));
}
