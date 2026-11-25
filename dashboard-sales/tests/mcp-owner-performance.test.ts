import { expect, test } from "bun:test";
import { formatOwnerPerformance } from "../src/lib/mcp/tools/owners";

test("owner performance converts Pulse's average fraction to percent independently of weighted Q", () => {
  expect(formatOwnerPerformance({
    name: "Ejemplo",
    openAmount: 20_000,
    openCount: 5,
    weightedQ: 9_000,
    avgProbability: 0.346,
  })).toBe("Ejemplo: abierto $20,000 (5 deals) · ponderado $9,000 · prob. 35%");
});

test("owner performance preserves real 0% and does not turn 100% into 1%", () => {
  const owner = { name: "Ejemplo", openAmount: 100, openCount: 1, weightedQ: 0 };
  expect(formatOwnerPerformance({ ...owner, avgProbability: 0 })).toMatch(/prob\. 0%$/);
  expect(formatOwnerPerformance({ ...owner, avgProbability: 1 })).toMatch(/prob\. 100%$/);
});
