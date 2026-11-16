import { test, expect } from "bun:test";
import {
  MEETING_PROPS,
  meetingsFromHistory,
  mergeMeetingRecords,
  meetingType,
  scopeMeetings,
  meetingMonths,
  meetingCounts,
  type HistoryValue,
  type MeetingEvent,
} from "../src/lib/meeting-metrics";
import type { DealDTO } from "../src/lib/pulse-types";
const [idKey, dateKey, typeKey] = MEETING_PROPS;
const v = (value: string, timestamp: string): HistoryValue => ({ value, timestamp });
const t1 = "2026-10-01T12:00:00Z",
  t2 = "2026-10-05T12:00:00Z",
  t3 = "2026-10-06T12:00:00Z";
test("recovers multiple real meetings with persisted classification, not just the latest snapshot", () => {
  const result = meetingsFromHistory("1", {
    [idKey]: [v("meeting1", t1), v("meeting2", t2)],
    [dateKey]: [v("2026-09-30", t1), v("2026-10-04", t2)],
    [typeKey]: [v("tipo_a", t1)],
  });
  expect(result.records.map((row) => [row.id, row.date, row.type])).toEqual([
    ["meeting1", "2026-09-30", "A"],
    ["meeting2", "2026-10-04", "A"],
  ]);
  expect(result.unresolved).toBe(0);
});
test("does not bind a new ID to the former meeting date, or classify from score/quality", () => {
  const result = meetingsFromHistory("1", {
    [idKey]: [v("old", t1), v("new", t2)],
    [dateKey]: [v("2026-09-30", t1)],
    [typeKey]: [v("alta", t1)],
  });
  expect(result.records).toHaveLength(1);
  expect(result.records[0].type).toBe("unknown");
  expect(result.unresolved).toBe(1);
  expect(meetingType("tipo_b")).toBe("B");
  expect(meetingType("tipo_c")).toBe("C");
  expect(meetingType("tipo_d")).toBe("C");
  expect(meetingType("D")).toBe("C");
  expect(meetingType("baja")).toBe("unknown");
});
test("a later explicit type correction updates the same meeting, without inventing another one", () => {
  const result = meetingsFromHistory("1", {
    [idKey]: [v("id", t1)],
    [dateKey]: [v("2026-09-30", t1)],
    [typeKey]: [v("tipo_a", t1), v("tipo_b", t3)],
  });
  expect(result.records).toHaveLength(1);
  expect(result.records[0].type).toBe("B");
});
test("deduplicates shared IDs across deals and rejects contradictory dates/types", () => {
  const a = {
    id: "meeting",
    date: "2026-10-01",
    type: "A" as const,
    at: Date.parse(t1),
    dealId: "1",
  };
  const merged = mergeMeetingRecords([a, { ...a, dealId: "2" }]);
  expect(merged.events).toHaveLength(1);
  expect(merged.events[0].dealIds).toEqual(["1", "2"]);
  expect(mergeMeetingRecords([a, { ...a, dealId: "2", type: "C" }]).conflicts).toBe(1);
  expect(mergeMeetingRecords([a, { ...a, dealId: "2", date: "2026-10-02" }]).events).toEqual([]);
});
const deal = (id: string, ownerId: string, source: string) =>
  ({
    id,
    ownerId,
    owner: ownerId,
    name: id,
    source,
    closeDateValue: "2020-01-01",
    segment: "Inbound",
  }) as DealDTO;
const events: MeetingEvent[] = [
  { id: "shared", date: "2026-10-05", type: "A", dealIds: ["1", "2"] },
  { id: "later", date: "2026-11-01", type: "B", dealIds: ["1"] },
  { id: "old", date: "2025-01-01", type: "C", dealIds: ["1"] },
];
test("periods follow meeting dates and source/owner ambiguity stays explicit without duplicate counts", () => {
  const rows = scopeMeetings(
    events,
    [deal("1", "a", "Customer Success"), deal("2", "b", "Form de Contacto Inbound")],
    ["2026-Q4"],
  );
  expect(rows).toHaveLength(2);
  expect(rows[0].source).toBe("shared");
  expect(rows[0].ownerId).toBe("shared");
  expect(meetingCounts(rows)).toEqual({ A: 1, B: 1, C: 0, unknown: 0 });
  const scoped = scopeMeetings(events, [deal("1", "a", "Customer Success")], ["2026-Q4"]);
  expect(scoped[0].ownerId).toBe("a");
  expect(scoped[0].source).toBe("cs");
});
test("month evolution fills all three Q months and all twelve year months without adding meetings", () => {
  const rows = scopeMeetings(events, [deal("1", "a", "Customer Success")], ["2026-Q4"]);
  expect(
    meetingMonths(["2026-Q4"], rows).map((bucket) => [bucket.month, bucket.rows.length]),
  ).toEqual([
    ["2026-10", 1],
    ["2026-11", 1],
    ["2026-12", 0],
  ]);
  expect(meetingMonths(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"], rows)).toHaveLength(12);
});
