import { expect, test } from "bun:test";
import { completedMeeting, ghostingMinimum, isGhostingLoss, type GhostingActivity } from "../src/lib/loss-ghosting";

const baseline: GhostingActivity = { calls: 2, whatsapp: 2, emails: 2, meetings: null };

test("each contact channel must individually meet two; meetings do not affect the result", () => {
  expect(ghostingMinimum(baseline)).toBe("met");
  expect(ghostingMinimum({ ...baseline, calls: 8, whatsapp: 1, meetings: { completed: 12, unverified: 0 } })).toBe("short");
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

test("meetings count only with a completed outcome and a date at or before the read", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  expect(completedMeeting({ hs_meeting_outcome: "COMPLETED", hs_meeting_start_time: "2026-11-18T12:00:00Z" }, now)).toBe(true);
  expect(completedMeeting({ hs_meeting_outcome: "COMPLETED", hs_timestamp: String(now) }, now)).toBe(true);
  expect(completedMeeting({ hs_meeting_outcome: "COMPLETED", hs_meeting_start_time: "2026-11-20T12:00:00Z" }, now)).toBe(false);
  expect(completedMeeting({ hs_meeting_outcome: "SCHEDULED" }, now)).toBe(false);
  expect(completedMeeting({ hs_meeting_outcome: "COMPLETED" }, now)).toBeNull();
  expect(completedMeeting({ hs_meeting_start_time: "2026-11-18T12:00:00Z" }, now)).toBeNull();
});
