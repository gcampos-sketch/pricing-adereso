import { describe, expect, test } from "bun:test";
import { buildKamCoverage, kamPeriod } from "../src/lib/kam-brief";
import type { MeetingCompany, MeetingReport } from "../src/lib/meeting-metrics";
const ownerId = "91603512",
  other = "93662868";
const company = (id: string, holdingId?: string, owner = ownerId): MeetingCompany => ({
  id,
  name: id,
  url: `https://example.com/${id}`,
  ownerId: owner,
  ...(holdingId ? { holdingId } : {}),
});
const companies = [
  company("1", "10"),
  company("2", "10"),
  company("3"),
  company("4", undefined, other),
];
const now = new Date("2026-11-20T14:00:00Z");
const meetings: MeetingReport = {
  fetchedAt: "2026-11-12T12:00:00Z",
  events: [
    {
      id: "m1",
      date: "2026-10-10",
      type: "C",
      dealIds: [],
      companies: [company("1", "10")],
      companyAttributionComplete: true,
      participants: [{ ownerId, name: "KAM" }],
    },
  ],
  candidateDeals: 0,
  scannedDeals: 0,
  unresolved: 0,
  conflicts: 0,
  complete: false,
  participationAuthority: "diio-recording",
  accountIdentityAuthority: "hubspot-id-holding",
};
const build = (report: MeetingReport | null = meetings, portfolio = companies) =>
  buildKamCoverage({
    ownerId,
    period: "2026-Q4",
    companies: portfolio,
    portfolioCheckedAt: now.toISOString(),
    meetings: report,
    now,
  });
describe("KAM brief evidence", () => {
  test("uses current portfolio, deduplicates holding, separates source dates and labels lower bound", () => {
    const r = build();
    expect(r.denominator).toBe(2);
    expect(r.confirmed).toBe(1);
    expect(r.value).toBe("≥ 50.0 %");
    expect(r.status).toBe("partial");
    expect(r.meetingsCheckedAt).not.toBe(r.portfolioCheckedAt);
    expect(r.rows.find((row) => !row.met)?.meetingState).toBe("not_verified_in_edition");
  });
  test("current ownership and holding supersede historical company assignment", () => {
    const r = build(meetings, [company("1", "20"), company("2", "10")]);
    expect(r.denominator).toBe(2);
    expect(r.confirmed).toBe(1);
    expect(r.rows.find((row) => row.key === "holding:20")?.met).toBe(true);
  });
  test("no caller participation, uncertain company or other quarter cannot establish contact", () => {
    for (const event of [
      { ...meetings.events[0]!, participants: [{ ownerId: other, name: "other" }] },
      { ...meetings.events[0]!, companyAttributionComplete: false },
      { ...meetings.events[0]!, date: "2026-09-30" },
    ]) {
      const r = build({ ...meetings, events: [event] });
      expect(r.value).toBeNull();
      expect(r.status).toBe("unavailable");
    }
  });
  test("missing authority or future edition never turns into a zero percentage", () => {
    expect(build(null).value).toBeNull();
    expect(build({ ...meetings, participationAuthority: undefined }).value).toBeNull();
    expect(build({ ...meetings, fetchedAt: "2026-11-21T14:00:00Z" }).value).toBeNull();
  });
  test("does not infer contact by a stale holding on another company", () => {
    expect(
      build({ ...meetings, events: [{ ...meetings.events[0]!, companies: [company("99", "10")] }] })
        .confirmed,
    ).toBe(0);
  });
  test("local quarter and invalid role", () => {
    expect(kamPeriod(new Date("2027-01-01T01:00:00Z"))).toBe("2026-Q4");
    expect(() =>
      buildKamCoverage({
        ownerId: "82596016",
        period: "2026-Q4",
        companies,
        portfolioCheckedAt: now.toISOString(),
        meetings,
        now,
      }),
    ).toThrow();
  });
});
