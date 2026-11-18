import { test, expect } from "bun:test";
import {
  activeQualityDeal,
  completeQualityInventory,
  qualityScope,
  propertyCoverage,
  qualityScore,
  qualityBuckets,
  scoreBand,
  qualityInPeriod,
} from "../src/lib/adobo-quality";
import {
  ADOBO_COMMERCIAL_GROUPS,
  ADOBO_DELIVERY_GROUPS,
  ADOBO_INTELLIGENCE_PROPS,
} from "../src/lib/adobo-intelligence";
import type { DealDTO } from "../src/lib/pulse-types";
const deal = (id: string, score: string | null, ownerId = "82596016") =>
  ({
    id,
    ownerId,
    stage: "E2",
    closeDateValue: "2020-01-01",
    adobo: { properties: { adobo_closing_score: score } },
  }) as DealDTO;
test("all current commercial fields including four alerts; delivery separate, archived kickoff absent", () => {
  const fields = ADOBO_COMMERCIAL_GROUPS.flatMap((g) => g.fields.map((f) => f[0]));
  for (const key of [
    "adobo_alertas_estado",
    "adobo_alertas_riesgo",
    "adobo_alertas_evidencia",
    "adobo_alertas_ultima_revision",
    "adobo_oportunidad_de_mejora_evidencia",
    "adobo_last_diio_meeting_id",
  ])
    expect(fields).toContain(key);
  expect(fields).not.toContain("adobo_handoff_ready");
  expect(ADOBO_DELIVERY_GROUPS.flatMap((g) => g.fields.map((f) => f[0]))).toContain(
    "adobo_handoff_ready",
  );
  expect(ADOBO_INTELLIGENCE_PROPS).not.toContain("adobo_avance_kickoff_pct");
});
test("active universe retains unknown owners and stages but excludes native closed, won and lost", () => {
  const won = new Set(["won"]),
    lost = new Set(["lost"]);
  for (const stage of ["won", "lost"])
    expect(activeQualityDeal({ dealstage: stage, hs_is_closed: "false" }, won, lost)).toBe(false);
  expect(activeQualityDeal({ dealstage: "new-stage", hs_is_closed: "false" }, won, lost)).toBe(
    true,
  );
  expect(activeQualityDeal({ dealstage: "open", hs_is_closed: "true" }, won, lost)).toBe(false);
  const rows = [deal("1", "0"), deal("2", null, ""), deal("3", "76", "91603512")];
  expect(qualityScope([...rows, rows[0]!], "team", "all", []).length).toBe(3);
  expect(qualityScope(rows, "__unassigned", "all", []).map((d) => d.id)).toEqual(["2"]);
  expect(qualityScope(rows, "team", "AE", []).map((d) => d.id)).toEqual(["1"]);
  expect(qualityScope(rows, "team", "all", ["E3"])).toEqual([]);
});
test("zero is valid, missing/invalid not zero; buckets and property drilldowns conserve exact IDs", () => {
  const rows = [deal("0", "0"), deal("1", "100"), deal("2", ""), deal("3", "101")];
  expect(qualityScore(rows[0]!)).toBe(0);
  expect(qualityScore(rows[2]!)).toBeNull();
  expect(qualityScore(rows[3]!)).toBeNull();
  expect(qualityBuckets(rows, scoreBand).flatMap((b) => b.deals).length).toBe(rows.length);
  for (const g of propertyCoverage(rows))
    for (const f of g.fields)
      expect([...f.present, ...f.missing].map((d) => d.id).sort()).toEqual(
        rows.map((d) => d.id).sort(),
      );
  expect(qualityInPeriod("2026-11-17T10:00:00Z", "2026", "4")).toBe(true);
  expect(qualityInPeriod("2026-11-17T10:00:00Z", "2026", "3")).toBe(false);
});
test("complete stable inventory requires every page and exact total; refuses changing, partial or duplicated sources", async () => {
  const a = { id: "1" },
    b = { id: "2" };
  expect(
    await completeQualityInventory(async (after) =>
      after
        ? { total: 2, results: [b] }
        : { total: 2, results: [a], paging: { next: { after: "1" } } },
    ),
  ).toEqual([a, b]);
  await expect(completeQualityInventory(async () => ({ total: 2, results: [a] }))).rejects.toThrow(
    "faltan",
  );
  await expect(
    completeQualityInventory(async (after) => ({
      total: after ? 3 : 2,
      results: [a],
      paging: { next: { after: "1" } },
    })),
  ).rejects.toThrow("cambió");
  await expect(
    completeQualityInventory(async () => ({ total: 2, results: [a, a] })),
  ).rejects.toThrow("duplicados");
  await expect(completeQualityInventory(async () => ({ results: [] }))).rejects.toThrow("total");
  await expect(
    completeQualityInventory(async () => {
      throw Error("source failed");
    }),
  ).rejects.toThrow("source failed");
});
