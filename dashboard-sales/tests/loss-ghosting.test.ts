import { expect, test } from "bun:test";
import { completedMeeting, GHOSTING_STATUS_ORDER, ghostingMeetingWindow, ghostingMinimum, groupGhostingDeals, isGhostingLoss, summarizeGhosting, type GhostingActivity } from "../src/lib/loss-ghosting";
import { corroboratedLossTransition } from "../src/lib/loss-prior-score";

const baseline: GhostingActivity = { calls: 2, whatsapp: 2, emails: 2, meetings: null, originStage: null };

test("each contact channel must individually meet two; meetings do not affect the result", () => {
  expect(ghostingMinimum(baseline)).toBe("met");
  expect(ghostingMinimum({ ...baseline, calls: 8, whatsapp: 1, meetings: { completedIds: ["1"], unverified: 0 } })).toBe("short");
  expect(ghostingMinimum({ ...baseline, emails: 0 })).toBe("short");
});

test("coverage failures stay unknown, while a verified shortfall still settles the minimum", () => {
  expect(ghostingMinimum()).toBe("unknown");
  expect(ghostingMinimum({ ...baseline, whatsapp: null })).toBe("unknown");
  expect(ghostingMinimum({ ...baseline, whatsapp: null, emails: 1 })).toBe("short");
});

test("only current loss reason labels targeting ghosting activate this evidence", () => {
  expect(isGhostingLoss("Ghosting")).toBe(true);
  expect(isGhostingLoss("Sin respuesta (Ghosting)")).toBe(true);
  expect(isGhostingLoss("Competencia")).toBe(false);
  expect(isGhostingLoss("ghostwritten")).toBe(false);
  expect(isGhostingLoss(null)).toBe(false);
});

const created = "2026-10-10T09:00:00Z";
const lost = "2026-11-18T12:00:00Z";
const now = Date.parse("2026-11-19T12:00:00Z");
const properties = { createdate: created, hs_v2_date_entered_lost: lost, closedate: "2026-12-31" };

test("ghosting origin is the immediate predecessor of the current loss run after reopening", () => {
  const stages = [
    { value: "E5", timestamp: "2026-10-19T12:00:00Z" },
    { value: "lost", timestamp: lost },
    { value: "lost", timestamp: "2026-10-20T12:00:00Z" },
    { value: "E2", timestamp: "2026-11-16T12:00:00Z" },
    { value: "lost", timestamp: "2026-11-18T13:00:00Z" },
  ];
  expect(corroboratedLossTransition("lost", lost, stages, now))
    .toEqual({ cutoff: Date.parse(lost), previousStageId: "E2" });
  expect(corroboratedLossTransition("lost", stages[2]!.timestamp, stages, now)).toBeNull();
});

test("ghosting origin stays unknown when a deal starts lost or transitions are ambiguous", () => {
  const end = { value: "lost", timestamp: lost };
  const prior = { value: "E5", timestamp: "2026-11-16T12:00:00Z" };
  expect(corroboratedLossTransition("lost", lost, [end], now)?.previousStageId).toBeNull();
  expect(corroboratedLossTransition("lost", lost, [end, prior, { ...prior, value: "E2" }], now)?.previousStageId).toBeNull();
  expect(corroboratedLossTransition("lost", lost, [end, prior, { ...end, value: "E2" }], now)).toBeNull();
  expect(corroboratedLossTransition("lost", lost, [end, { value: "E2" }], now)).toBeNull();
  expect(corroboratedLossTransition("lost", lost, [end, prior, { ...end, timestamp: "2026-11-20T12:00:00Z" }], now)).toBeNull();
});

test("ghosting uses the native current loss-stage entry and creation, with no close-date fallback", () => {
  expect(ghostingMeetingWindow(properties, "lost", now)).toEqual({ created: Date.parse(created), lost: Date.parse(lost) });
  expect(ghostingMeetingWindow(properties, "lost-other", now)).toBeNull();
  expect(ghostingMeetingWindow({ ...properties, createdate: null }, "lost", now)).toBeNull();
  expect(ghostingMeetingWindow({ ...properties, createdate: "2026-09-31T12:00:00Z" }, "lost", now)).toBeNull();
  expect(ghostingMeetingWindow({ ...properties, createdate: "2026-11-19T12:00:00Z" }, "lost", now)).toBeNull();
  expect(ghostingMeetingWindow({ ...properties, hs_v2_date_entered_lost: "2026-11-20T12:00:00Z" }, "lost", now)).toBeNull();
});

test("only completed meetings from creation inclusive to loss entry exclusive count", () => {
  const window = ghostingMeetingWindow(properties, "lost", now)!;
  const completed = (date: string) => completedMeeting({ hs_meeting_outcome: "COMPLETED", hs_meeting_start_time: date }, window);
  expect(completed("2026-10-10T08:59:59Z")).toBe(false);
  expect(completed(created)).toBe(true);
  expect(completed("2026-11-18T11:59:59Z")).toBe(true);
  expect(completed(lost)).toBe(false);
  expect(completed("2026-11-18T12:00:01Z")).toBe(false);
  expect(completedMeeting({ hs_meeting_outcome: "COMPLETED", hs_timestamp: String(Date.parse(created)) }, window)).toBe(true);
  expect(completedMeeting({ hs_meeting_outcome: "SCHEDULED", hs_meeting_start_time: created }, window)).toBe(false);
  expect(completedMeeting({ hs_meeting_outcome: "COMPLETED" }, window)).toBeNull();
  expect(completedMeeting({ hs_meeting_start_time: created }, window)).toBeNull();
  expect(completedMeeting({ hs_meeting_start_time: lost }, window)).toBe(false);
});


test("ghosting groups put known shortfalls first and maintain order within each status", () => {
  const deals = ["met", "unknown", "short1", "short2"].map(id => ({ id }));
  const groups = groupGhostingDeals(deals, {
    met: baseline,
    short1: { ...baseline, calls: 0, whatsapp: null },
    short2: { ...baseline, emails: 1 },
  });
  expect(GHOSTING_STATUS_ORDER.flatMap(status => groups[status].map(deal => deal.id)))
    .toEqual(["short1", "short2", "unknown", "met"]);
});

test("ghosting summary uses verified values, includes zero and reports tied stages", () => {
  const deals = ["a", "b", "c", "d", "a"].map(id => ({ id }));
  const summary = summarizeGhosting(deals, {
    a: { ...baseline, calls: 0, emails: 3, meetings: { completedIds: [], unverified: 0 }, originStage: "E5" },
    b: { ...baseline, calls: 1, whatsapp: null, meetings: { completedIds: ["1"], unverified: 1 }, originStage: "E2" },
    c: { ...baseline, calls: null, emails: null, meetings: { completedIds: ["2"], unverified: 0 } },
  });
  expect(summary.metrics.map(({ covered, median }) => [covered, median]))
    .toEqual([[2, 0.5], [2, 2], [2, 2.5], [2, 0.5]]);
  expect(summary.modalStages).toEqual(["E2", "E5"]);
  expect(summary.stageFrequency).toBe(1);
  expect(summary.stageCovered).toBe(2);
  expect(summarizeGhosting(deals, {}).metrics.every(metric => metric.median === null)).toBe(true);
  expect(summarizeGhosting(deals, {}).modalStages).toEqual([]);
});
