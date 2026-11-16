import { expect, test } from "bun:test";
import {
  meetingCompanySummary,
  resolveMeetingAccountCompanies,
} from "../src/lib/meeting-companies";
import type { MeetingEvent } from "../src/lib/meeting-metrics";
const company = { id: "one-account", name: "One account", url: "https://example.com/company/one" };
const event = (id: string): MeetingEvent => ({
  id,
  date: "2026-10-01",
  type: "A",
  dealIds: ["d1", "d2"],
  companies: [company],
  companyAttributionComplete: true,
});
test("20 real meetings at one account are one company; deals/contact copies add no companies", () => {
  const events = Array.from({ length: 20 }, (_, i) => event(String(i)));
  const summary = meetingCompanySummary([...events, events[0]!]);
  expect(summary.uniqueCompanies).toBe(1);
  expect(summary.rows[0]!.meetings).toHaveLength(20);
  expect(summary.repeatedCompanies).toBe(1);
  expect(summary.singleMeetingCompanies).toBe(0);
});
test("20 meetings at 20 account IDs are 20 companies; equal names never establish identity", () => {
  const summary = meetingCompanySummary(
    Array.from({ length: 20 }, (_, i) => ({
      ...event(String(i)),
      companies: [{ ...company, id: String(i) }],
    })),
  );
  expect(summary.uniqueCompanies).toBe(20);
  expect(summary.singleMeetingCompanies).toBe(20);
  expect(summary.repeatedCompanies).toBe(0);
});
test("missing identity remains pending and company metrics use only supplied filtered meetings", () => {
  const missing: MeetingEvent = {
    id: "missing",
    date: "2026-10-02",
    type: "unknown",
    dealIds: [],
    companies: [],
    companyAttributionComplete: false,
  };
  const summary = meetingCompanySummary([event("known"), missing]);
  expect(summary.uniqueCompanies).toBe(1);
  expect(summary.unresolvedMeetings).toBe(1);
  expect(meetingCompanySummary([missing]).uniqueCompanies).toBe(0);
  expect(
    meetingCompanySummary([{ id: "legacy", date: "2026-10-02", type: "A", dealIds: [] }]).available,
  ).toBe(false);
});
test("a joint meeting counts once per verified company and is explicitly non-exclusive", () => {
  const summary = meetingCompanySummary([
    { ...event("joint"), companies: [company, company, { ...company, id: "other" }] },
  ]);
  expect(summary.uniqueCompanies).toBe(2);
  expect(summary.multiCompanyMeetings).toBe(1);
  expect(summary.rows.map((row) => row.meetings.length)).toEqual([1, 1]);
});

test("multiple deals at the same company do not add accounts; ambiguous companies are not counted as extra clients", () => {
  expect(
    resolveMeetingAccountCompanies({
      dealCompanies: [[company], [company]],
      candidateCompanies: [],
    }).companies,
  ).toEqual([company]);
  expect(
    resolveMeetingAccountCompanies({
      dealCompanies: [[company], [{ ...company, id: "possible-duplicate" }]],
      candidateCompanies: [],
    }).companies,
  ).toEqual([]);
});
test("a client's contractor is not another customer account; explicit reviewed representation selects the client", () => {
  const contractor = { ...company, id: "contractor", name: "External contractor" };
  expect(
    resolveMeetingAccountCompanies({ dealCompanies: [], candidateCompanies: [company, contractor] })
      .companyAttributionComplete,
  ).toBe(false);
  expect(
    resolveMeetingAccountCompanies({
      dealCompanies: [],
      candidateCompanies: [company, contractor],
      review: { companyId: company.id },
    }).companies,
  ).toEqual([company]);
  expect(
    resolveMeetingAccountCompanies({
      dealCompanies: [],
      candidateCompanies: [contractor],
      review: { pending: true },
    }).companies,
  ).toEqual([]);
});
