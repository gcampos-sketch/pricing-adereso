import { expect, test } from "bun:test";
import { plannedChurnMonths, type ConfirmedChurn } from "../src/lib/churn-forecast";
import { financeChurn, type ChurnCompany } from "../src/lib/churn-finance";

const company = (overrides: Partial<ChurnCompany> = {}): ChurnCompany => ({
  id: "1", instance: "100", name: "Cuenta", lossDate: "2027-01-01", risk: false,
  holding: "", holdingName: "", dealIds: ["9"], mrr: 100,
  history: [{
    value: "2027-01-01", sourceType: "CRM_UI",
    sourceId: "userId:100", timestamp: "2026-11-18T10:00:00Z",
  }],
  ...overrides,
});

const confirmed: ConfirmedChurn[] = [
  { name: "Cuenta A", month: "2027-01", mrr: 200, dealIds: ["1", "2"] },
  { name: "Cuenta B", month: "2026-12", mrr: 50, dealIds: ["3"] },
  { name: "Cuenta C", month: "2027-01", mrr: 100, dealIds: ["4"] },
];

test("groups confirmed MRR by effective month and keeps future losses", () => {
  const groups = plannedChurnMonths(confirmed, { month: "2026-11", dealIds: ["5"], count: 1 });
  expect(groups.map(({ month, total }) => [month, total])).toEqual([
    ["2026-12", 50], ["2027-01", 300],
  ]);
});

test("requires a complete effective-month snapshot before retiring a loss", () => {
  expect(plannedChurnMonths(confirmed, { month: "2027-01", dealIds: ["2"], count: 2 })).toHaveLength(2);
  const groups = plannedChurnMonths(confirmed, { month: "2027-01", dealIds: ["2"], count: 1 });
  expect(groups[0]?.rows).toEqual([confirmed[0]]);
});

test("finance dates and costs come from company records, with one entry per holding and month", () => {
  const rows = [
    company({ id: "1", instance: "119", mrr: 1159.95, dealIds: ["9"], holding: "70", holdingName: "Holding A" }),
    company({ id: "2", instance: "4156", mrr: 849, dealIds: ["10"], holding: "70", holdingName: "Holding A" }),
  ];
  const result = financeChurn(rows, [], "2026-11-18");
  expect(result.confirmed).toEqual([
    { name: "Holding A", month: "2027-01", mrr: 2008.95, dealIds: ["9", "10"] },
  ]);
});

test("form-only dates and duplicate instances contribute no confirmed MRR", () => {
  const result = financeChurn([
    company(),
    company({ id: "2" }),
    company({ id: "3", instance: "55", history: [{ value: "2027-01-01", sourceType: "FORM", timestamp: "2026-11-18T10:00:00Z" }] }),
    company({ id: "4", instance: "56", lossDate: "", history: [], risk: true }),
  ], [], "2026-11-18");
  expect(result.confirmed).toEqual([]);
  expect(result.pending).toHaveLength(3);
  expect(result.risk).toEqual([{ name: "Cuenta", mrr: 100 }]);
});

test("removes only matched requests from the pending forms", () => {
  const result = financeChurn([company({ name: "Cuenta RRSS", history: [
    ...company().history,
    { value: "2026-12-31", sourceType: "FORM", sourceId: "old-form", timestamp: "2026-11-17T10:00:00Z" },
  ] })], [
    { id: "old-form", name: "Cuenta RRSS", serviceEnd: "2026-12-31", submittedOn: "2026-11-17" },
    { id: "unrelated-instance", name: "Cuenta RRHH", serviceEnd: "2026-12-31", submittedOn: "2026-11-17" },
  ], "2026-11-18");
  expect(result.pending?.map((row) => row.id)).toEqual(["unrelated-instance"]);
});
