import { test, expect } from "bun:test";
import type { StageJourney, DealDTO } from "../src/lib/pulse-types";
import { generationStageEntries, generationSourceRows } from "../src/lib/pipeline-generation";
const journey = (
  id: string,
  entered: Record<string, string>,
  ownerId = "82596016",
  extra = {},
): StageJourney =>
  ({
    deal: {
      id,
      name: id,
      ownerId,
      amountValue: 100,
      stageId: "173990327",
      closeDateValue: "2026-10-01",
      ...extra,
    },
    entered,
    days: {},
    createdAt: "2026-10-01",
  }) as StageJourney;
test("each card uses its own recorded entry, independent of creation, close and current stage", () => {
  const rows = [
    journey("old", { E0: "2025-01-01", E1: "2026-10-02", E4: "2026-11-01", LOST: "2026-11-02" }),
    journey("new", { E1: "2026-10-03" }),
    journey("missing", {}),
  ];
  const result = generationStageEntries(rows, ["2026-Q4"]);
  expect(result.generated.map((r) => r.deal.id)).toEqual(["new"]);
  expect(result.activated.map((r) => r.deal.id)).toEqual(["old", "new"]);
  expect(result.valued.map((r) => r.deal.id)).toEqual(["old"]);
  expect(result.lost.map((r) => r.deal.id)).toEqual(["old"]);
});
test("KAM activation requires ordered E0→E1 and the loss cannot precede activation", () => {
  const result = generationStageEntries(
    [
      journey("ordered", { E0: "2026-01-01", E1: "2026-10-01", LOST: "2026-10-05" }, "91603512"),
      journey("reverse", { E0: "2026-10-03", E1: "2026-10-01" }, "91603512"),
      journey("late", { E1: "2026-11-01", LOST: "2026-10-01" }),
    ],
    ["2026-Q4"],
  );
  expect(result.activated.map((r) => r.deal.id)).toEqual(["ordered", "late"]);
  expect(result.lost.map((r) => r.deal.id)).toEqual(["ordered"]);
});
test("no close-date fallback, no inferred E1 from a later current stage, deduplicated event populations", () => {
  const row = journey("same", { E4: "2026-10-01" });
  const result = generationStageEntries(
    [row, row, journey("zero", { E4: "2026-10-01" }, "82596016", { amountValue: 0 })],
    ["2026-Q4"],
  );
  expect(result.generated).toHaveLength(0);
  expect(result.activated).toHaveLength(0);
  expect(result.valued).toHaveLength(1);
  expect(result.lost).toHaveLength(0);
});
const sourceDeal = (id: string, source: string | null): DealDTO => ({ id, source }) as DealDTO;
test("AE attribution groups Adereso prospecting and inbound under SDR, retaining exact other/missing sources", () => {
  const rows = generationSourceRows(
    [
      sourceDeal("1", "Account Exec"),
      sourceDeal("2", "Prospección SDR"),
      sourceDeal("3", "Form de Contacto Inbound"),
      sourceDeal("4", "CS Cassper"),
      sourceDeal("5", null),
    ],
    "AE",
  );
  expect(rows.map((r) => [r.label, r.deals.length])).toEqual([
    ["AE Adereso", 1],
    ["SDR Adereso", 2],
    ["CS Cassper", 1],
    ["Sin fuente registrada", 1],
  ]);
  expect(rows.reduce((sum, r) => sum + r.deals.length, 0)).toBe(5);
});
test("KAM and CS use native creation-source values, not owner roles or Cassper labels", () => {
  const rows = generationSourceRows(
    [
      sourceDeal("1", "KAM"),
      sourceDeal("2", "Customer Success"),
      sourceDeal("3", "KAM Adereso - Recuperación"),
      sourceDeal("4", "KAM Cassper"),
    ],
    "KAM",
  );
  expect(rows.map((r) => [r.label, r.deals.length])).toEqual([
    ["KAM Adereso", 2],
    ["CS Adereso", 1],
    ["KAM Cassper", 1],
  ]);
});
