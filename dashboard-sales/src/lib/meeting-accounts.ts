import {
  uniqueMeetingEvents,
  type MeetingCompany,
  type MeetingEvent,
  type ScopedMeeting,
} from "./meeting-metrics";
export function canonicalHoldingId(raw: string | undefined | null) {
  const value = (raw ?? "").trim();
  if (!/^\d+(?:\.0+)?$/.test(value)) return undefined;
  const integer = value.replace(/\.0+$/, "").replace(/^0+(?=\d)/, "");
  return integer === "0" ? undefined : integer;
}
export const meetingAccountKey = (company: MeetingCompany) => {
  const holding = canonicalHoldingId(company.holdingId);
  return holding ? `holding:${holding}` : `company:${company.id}`;
};
export const meetingAccountName = (company: MeetingCompany) =>
  company.holdingName?.trim() || company.name;
/** One account per selected period. The latest verified meeting determines its type/source. */
export function meetingAccountRows(input: ScopedMeeting[]): ScopedMeeting[] {
  const buckets = new Map<string, { company: MeetingCompany; meetings: ScopedMeeting[] }>();
  for (const event of input)
    for (const [key, company] of new Map(
      (event.companies ?? []).map((company) => [meetingAccountKey(company), company]),
    )) {
      const bucket = buckets.get(key) ?? { company, meetings: [] };
      bucket.meetings.push(event);
      buckets.set(key, bucket);
    }
  return [...buckets].map(([key, bucket]) => {
    const meetings = [...new Map(bucket.meetings.map((event) => [event.id, event])).values()].sort(
      (a, b) =>
        (b.startedAt ?? b.date).localeCompare(a.startedAt ?? a.date) || b.id.localeCompare(a.id),
    );
    const latest = meetings[0]!;
    const sameLastDay = meetings.filter((event) => event.date === latest.date);
    const tied = sameLastDay.some((event) => !event.startedAt)
      ? sameLastDay
      : meetings.filter((event) => event.startedAt === latest.startedAt);
    const ambiguousType = new Set(tied.map((event) => event.type)).size > 1;
    const ambiguousSource = new Set(tied.map((event) => event.source)).size > 1;
    return {
      ...latest,
      id: `account:${key}`,
      ...(ambiguousType
        ? {
            type: "unknown" as const,
            classification: "Tipo pendiente: no hay una única última reunión verificable.",
          }
        : {}),
      ...(ambiguousSource ? { source: "shared" } : {}),
      name: meetingAccountName(bucket.company),
      companies: [bucket.company],
      deals: [
        ...new Map(
          meetings.flatMap((event) => event.deals).map((deal) => [deal.id, deal]),
        ).values(),
      ],
      dealIds: [...new Set(meetings.flatMap((event) => event.dealIds))],
      participants: [
        ...new Map(
          meetings
            .flatMap((event) => event.participants ?? [])
            .map((person) => [person.ownerId, person]),
        ).values(),
      ],
      accountView: {
        key,
        name: meetingAccountName(bucket.company),
        meetings: meetings.map((event) => ({
          id: event.id,
          date: event.date,
          name: event.name ?? "Reunión",
          type: event.type,
          ...(event.diioUrl ? { diioUrl: event.diioUrl } : {}),
        })),
      },
    };
  });
}
export function kamMeetingCoverage(
  companies: MeetingCompany[],
  events: MeetingEvent[],
  ownerId: string,
) {
  const assigned = companies.filter((company) => company.ownerId === ownerId);
  const accounts = new Map<string, MeetingCompany[]>();
  for (const company of assigned) {
    const key = meetingAccountKey(company);
    accounts.set(key, [...(accounts.get(key) ?? []), company]);
  }
  const met = new Set<string>();
  for (const event of uniqueMeetingEvents(events)) {
    if (!event.participants?.some((person) => person.ownerId === ownerId)) continue;
    for (const company of event.companies ?? []) {
      const key = meetingAccountKey(company);
      if (accounts.has(key)) met.add(key);
    }
  }
  return {
    total: accounts.size,
    met: met.size,
    unmet: accounts.size - met.size,
    percent: accounts.size ? (met.size / accounts.size) * 100 : null,
    withoutHolding: assigned.filter((company) => !canonicalHoldingId(company.holdingId)).length,
    rows: [...accounts]
      .map(([key, rows]) => ({
        key,
        name: meetingAccountName(rows[0]!),
        companies: rows,
        met: met.has(key),
      }))
      .sort((a, b) => Number(b.met) - Number(a.met) || a.name.localeCompare(b.name)),
  };
}
