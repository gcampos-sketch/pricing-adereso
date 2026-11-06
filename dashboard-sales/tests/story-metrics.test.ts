import { describe, expect, test } from "bun:test";
import { creationComparisonWindow, hasOrderedActivation } from "../src/lib/story-metrics";

describe("creation comparison", () => {
  test("compares a partial quarter with the same elapsed time", () => {
    const window = creationComparisonWindow(2026, "4", Date.UTC(2026, 9, 12));
    expect(window.partial).toBe(true);
    expect(window.previousEnd - window.previousStart).toBe(window.currentEnd - window.currentStart);
  });
  test("uses full prior quarter for completed quarters and crosses years", () => {
    const window = creationComparisonWindow(2026, "1", Date.UTC(2026, 9, 12));
    expect(window.previousStart).toBe(Date.UTC(2025, 9, 1));
    expect(window.previousEnd).toBe(Date.UTC(2026, 0, 1));
    expect(window.partial).toBe(false);
  });
  test("compares a partial year with the same elapsed time", () => {
    const window = creationComparisonWindow(2026, "all", Date.UTC(2026, 9, 12));
    expect(window.previousEnd - window.previousStart).toBe(window.currentEnd - window.currentStart);
  });
  test("marks future periods", () => {
    expect(creationComparisonWindow(2027, "1", Date.UTC(2026, 9, 12)).future).toBe(true);
  });
});
test("activation must have valid dates in chronological order", () => {
  expect(hasOrderedActivation({ E0: "2026-10-01", E1: "2026-10-02" })).toBe(true);
  expect(hasOrderedActivation({ E0: "2026-10-02", E1: "2026-10-01" })).toBe(false);
  expect(hasOrderedActivation({ E1: "2026-10-02" })).toBe(false);
});