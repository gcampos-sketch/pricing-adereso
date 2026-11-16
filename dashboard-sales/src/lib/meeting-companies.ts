import { meetingAccountKey, meetingAccountName } from "./meeting-accounts";
import { uniqueMeetingEvents, type MeetingEvent, type MeetingCompany } from "./meeting-metrics";
export function meetingCompanySummary(input: MeetingEvent[]) {
  const events = uniqueMeetingEvents(input);
  const grouped = new Map<string, { company: MeetingCompany; meetings: MeetingEvent[] }>();
  for (const event of events) {
    for (const company of new Map(
      (event.companies ?? []).map((company) => [meetingAccountKey(company), company]),
    ).values()) {
      const bucket = grouped.get(meetingAccountKey(company)) ?? {
        company: { ...company, name: meetingAccountName(company) },
        meetings: [],
      };
      bucket.meetings.push(event);
      grouped.set(meetingAccountKey(company), bucket);
    }
  }
  const rows = [...grouped.values()].sort(
    (a, b) => b.meetings.length - a.meetings.length || a.company.name.localeCompare(b.company.name),
  );
  return {
    available: events.some((event) => event.companies !== undefined),
    rows,
    uniqueCompanies: rows.length,
    unresolvedMeetings: events.filter((event) => event.companyAttributionComplete !== true).length,
    singleMeetingCompanies: rows.filter((row) => row.meetings.length === 1).length,
    repeatedCompanies: rows.filter((row) => row.meetings.length > 1).length,
    multiCompanyMeetings: events.filter(
      (event) => new Set(event.companies?.map(meetingAccountKey) ?? []).size > 1,
    ).length,
  };
}

/** Resolve the represented account, keeping duplicate/related deal-company records ambiguous. */
export function resolveMeetingAccountCompanies(input: {
  dealCompanies: MeetingCompany[][];
  candidateCompanies: MeetingCompany[];
  review?: { companyId?: string; pending?: boolean };
}) {
  if (input.dealCompanies.length) {
    const companies = [
      ...new Map(
        input.dealCompanies.flat().map((company) => [meetingAccountKey(company), company]),
      ).values(),
    ];
    return {
      companies: companies.length === 1 ? companies : [],
      companyAttributionComplete:
        companies.length === 1 && input.dealCompanies.every((rows) => rows.length === 1),
    };
  }
  if (input.review?.pending) return { companies: [], companyAttributionComplete: false };
  const reviewed = input.review?.companyId
    ? input.candidateCompanies.filter((company) => company.id === input.review!.companyId)
    : [];
  const unique = [
    ...new Map(
      input.candidateCompanies.map((company) => [meetingAccountKey(company), company]),
    ).values(),
  ];
  const companies = reviewed.length === 1 ? reviewed : unique.length === 1 ? unique : [];
  return { companies, companyAttributionComplete: companies.length === 1 };
}
