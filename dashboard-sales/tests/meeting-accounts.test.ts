import { expect, test } from "bun:test";
import {
  canonicalHoldingId,
  meetingAccountKey,
  meetingAccountRows,
  kamMeetingCoverage,
} from "../src/lib/meeting-accounts";
import {
  meetingCompanySummary,
  resolveMeetingAccountCompanies,
} from "../src/lib/meeting-companies";
import type { MeetingCompany, ScopedMeeting } from "../src/lib/meeting-metrics";
const a: MeetingCompany = {
  id: "a",
  name: "Subsidiary A",
  url: "https://example.com/a",
  holdingId: "42",
  holdingName: "Holding",
  ownerId: "91603512",
};
const b: MeetingCompany = { ...a, id: "b", name: "Subsidiary B", holdingId: "042.0" };
const c: MeetingCompany = { ...a, id: "c", holdingId: "99", holdingName: "Another holding" };
const row = (
  id: string,
  date: string,
  companies: MeetingCompany[],
  type: "A" | "C" = "C",
): ScopedMeeting => ({
  id,
  date,
  type,
  dealIds: [],
  deals: [],
  owner: "Naty",
  ownerId: "91603512",
  source: "kam",
  companies,
  companyAttributionComplete: true,
  participants: [{ ownerId: "91603512", name: "Naty" }],
});
test("native holding identifiers collapse subsidiaries while missing/invalid IDs stay separate", () => {
  expect(canonicalHoldingId("00042.00")).toBe("42");
  expect(canonicalHoldingId("0")).toBeUndefined();
  expect(canonicalHoldingId("N/A")).toBeUndefined();
  expect(meetingAccountKey(a)).toBe(meetingAccountKey(b));
  expect(meetingAccountKey({ ...a, holdingId: "" })).toBe("company:a");
  expect(
    meetingCompanySummary([row("one", "2026-10-01", [a]), row("two", "2026-10-02", [b])])
      .uniqueCompanies,
  ).toBe(1);
  expect(
    resolveMeetingAccountCompanies({ dealCompanies: [[a], [b]], candidateCompanies: [] })
      .companyAttributionComplete,
  ).toBe(true);
});
test("unique account mode partitions by the latest meeting, preserving every related meeting and participant", () => {
  const first = { ...row("one", "2026-10-01", [a], "A"), source: "inbound" };
  const last = {
    ...row("two", "2026-11-01", [b]),
    source: "kam",
    participants: [{ ownerId: "93662868", name: "Felipe" }],
  };
  const result = meetingAccountRows([first, last, row("three", "2026-10-02", [c])]);
  expect(result).toHaveLength(2);
  const holding = result.find((item) => item.accountView?.key === "holding:42")!;
  expect(holding.type).toBe("C");
  expect(holding.source).toBe("kam");
  expect(holding.accountView!.meetings).toHaveLength(2);
  expect(holding.participants).toHaveLength(2);
  expect(meetingAccountRows([first])[0]!.type).toBe("A");
});
test("portfolio coverage uses company owner and actual participation, deduping repeated meetings and subsidiaries", () => {
  const unknown = { ...a, id: "standalone", holdingId: "" };
  const outside = { ...a, id: "outside", holdingId: "777", ownerId: "93662868" };
  const events = [
    row("m1", "2026-10-01", [a]),
    row("m2", "2026-10-02", [b]),
    row("outside", "2026-10-03", [outside]),
    {
      ...row("other-person", "2026-10-04", [c]),
      participants: [{ ownerId: "93662868", name: "Felipe" }],
    },
  ];
  const coverage = kamMeetingCoverage([a, b, c, unknown, outside], events, "91603512");
  expect(coverage.total).toBe(3);
  expect(coverage.met).toBe(1);
  expect(coverage.unmet).toBe(2);
  expect(coverage.withoutHolding).toBe(1);
  expect(coverage.percent).toBeCloseTo(100 / 3);
  expect(kamMeetingCoverage([a, b, c], events.slice(0, 0), "91603512").met).toBe(0);
  expect(kamMeetingCoverage([], events, "91603512").percent).toBeNull();
});

test("an ambiguous latest instant never invents a unique account type or source", () => {
  const first = { ...row("first", "2026-10-01", [a], "A"), source: "inbound" };
  const last = { ...row("last", "2026-10-01", [b], "C"), source: "kam" };
  const unknown = meetingAccountRows([first, last])[0]!;
  expect(unknown.type).toBe("unknown");
  expect(unknown.source).toBe("shared");
  const timed = meetingAccountRows([
    { ...first, startedAt: "2026-10-01T10:00:00Z" },
    { ...last, startedAt: "2026-10-01T15:00:00Z" },
  ])[0]!;
  expect(timed.type).toBe("C");
  expect(timed.source).toBe("kam");
});
