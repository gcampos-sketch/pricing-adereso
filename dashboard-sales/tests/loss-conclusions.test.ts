import { expect, test } from "bun:test";
import type { InsightDeal } from "../src/lib/insights-types";
import { buildLossConclusions } from "../src/lib/loss-conclusions";

const loss = (id: string, reason: string | null, amountValue: number, lostStage = "E3") =>
  ({ id, lostReason: reason, amountValue, lostStage, status: "lost" } as InsightDeal);

test("prioritizes the strongest MRR and frequency signals with exact cohorts and consistent denominators", () => {
  const budget = loss("a", "Presupuesto", 600);
  const ghost = loss("b", "Ghosting", 100);
  const result = buildLossConclusions([
    budget, budget, ghost, loss("c", "Ghosting", 0), loss("d", "Competidor", 180),
    loss("e", "Timing", 20), loss("f", "Otro (explicar)", 100), loss("g", null, 0),
    { ...budget, id: "won", status: "won" },
  ]);
  expect(result.total).toBe(7);
  expect(result.unspecified.map(deal => deal.id)).toEqual(["f", "g"]);
  expect(result.priorities.map(row => row.reason)).toEqual(["Presupuesto", "Ghosting", "Competidor"]);
  expect(result.priorities[0]).toMatchObject({ deals: [budget], mrr: 600, mrrShare: 60, leadsMrr: true, leadsCount: false });
  const ghosting = result.priorities[1]!;
  expect(ghosting).toMatchObject({ count: 2, leadsCount: true, stage: { label: "E3", count: 2 } });
  expect(ghosting.dealShare).toBeCloseTo(200 / 7);
  expect(ghosting.recommendation.measure).toContain("2/2/2");
});

test("empty, generic-only and zero-MRR scopes keep evidence and ranking honest", () => {
  expect(buildLossConclusions([])).toEqual({ total: 0, unspecified: [], priorities: [], sharedStage: null });
  expect(buildLossConclusions([loss("a", "Otro (explicar)", 50)]).priorities).toEqual([]);
  const result = buildLossConclusions([loss("b", "Timing", 0, "Sin recorrido"), loss("c", "Timing", 0, "Sin recorrido")]);
  expect(result.priorities[0]).toMatchObject({ dealShare: 100, mrrShare: null, leadsMrr: false, leadsCount: true, stage: null });
});

test("negative adjustments retain amounts without rendering a misleading share of net MRR", () => {
  const result = buildLossConclusions([loss("a", "Presupuesto", 600), loss("b", "Timing", -100)]);
  expect(result.priorities[0]).toMatchObject({ mrr: 600, mrrShare: null });
});


test("a common stage requires concentration across multiple reasons and shows only its matching deals", () => {
  const rows = [loss("a", "Ghosting", 30, "E5"), loss("b", "Ghosting", 0, "E5"), loss("c", "Ghosting", 0, "E2"),
    loss("d", "Presupuesto", 70, "E5"), loss("e", "Presupuesto", 80, "E5"), loss("f", "Presupuesto", 20, "Sin recorrido")];
  const { sharedStage } = buildLossConclusions(rows);
  expect(sharedStage).toMatchObject({ label: "E5", total: 6 });
  expect(sharedStage?.deals.map(deal => deal.id)).toEqual(["d", "e", "a", "b"]);
  expect(buildLossConclusions(rows.filter(deal => deal.lostStage === "E5")).sharedStage).toBeNull();
});
