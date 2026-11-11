import { test, expect } from "bun:test";
import type { StageJourney } from "../src/lib/pulse-types";
import { pipelineHistory } from "../src/lib/pipeline-history";
const journey = (entered: Record<string, string>, extra = {}): StageJourney =>
  ({
    deal: {
      id: "1",
      name: "Deal",
      amountValue: 100,
      source: "Customer Success",
      stageId: "173990327",
      closeDateValue: "2026-12-30",
      ...extra,
    },
    createdAt: "2020-01-01",
    entered,
    days: {},
  }) as StageJourney;
test("milestones use their own stage dates regardless of creation, close or current stage", () => {
  const events = pipelineHistory([
    journey({
      E0: "2024-01-10",
      E1: "2024-02-01",
      E4: "2025-06-01",
      E6: "2025-08-01",
      E6_ignored: "2025-07-01",
      E8: "2026-01-01",
      LOST: "2026-02-01",
    }),
  ]);
  expect(Object.fromEntries(events.map((row) => [row.kind, row.date]))).toEqual({
    generated: "2024-01-10",
    valued: "2025-06-01",
    won: "2025-08-01",
    lost: "2026-02-01",
  });
  expect(events.every((row) => row.source === "cs")).toBe(true);
});
test("E1 direct entry counts once, missing dates never fall back to created or close dates", () => {
  expect(
    pipelineHistory([journey({ E1: "2025-03-01" })]).map((row) => [row.kind, row.stage]),
  ).toEqual([["generated", "E1"]]);
  expect(pipelineHistory([journey({ E0: "invalid" })])).toEqual([]);
});
test("deduplicates deals per milestone; E4 requires positive current amount and records later win evidence explicitly", () => {
  const item = journey({ E4: "2025-01-01", "E6.2": "2025-02-01" }, { amountValue: 0 });
  const events = pipelineHistory([item, item]);
  expect(events).toHaveLength(1);
  expect(events[0].kind).toBe("won");
  expect(events[0].stage).toBe("E6.2");
});
