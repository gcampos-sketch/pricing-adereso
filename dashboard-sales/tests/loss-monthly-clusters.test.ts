import { expect, test } from "bun:test";
import type { InsightDeal } from "../src/lib/insights-types";
import { lossMonthlyClusters, type LossClusterFields } from "../src/lib/loss-monthly-clusters";

function deal(id: string, createdAt: string, fields: Partial<LossClusterFields>): InsightDeal {
  return {
    id, createdAt, status: "lost", closeDateValue: "2026-12-15",
    lossClusters: {
      conversations: null, meetings: null, companySize: null, monthlyRevenue: null, currency: null,
      employees: null, industry: null, entry: null, ...fields,
    },
  } as InsightDeal;
}

const readAt = "2026-06-15T12:00:00Z";

test("applies the selected period to the chosen date, keeps zero months and never substitutes close dates", () => {
  const one = deal("one", "2026-03-30", { entry: "2026-05-13", conversations: 5000 });
  const two = deal("two", "2026-04-30", { entry: "2026-06-20", conversations: 0 });
  const three = deal("three", "2026-06-10", {});
  const open = { ...one, id: "open", status: "open" as const };
  const input = [one, two, three, open, one];
  const byEntry = lossMonthlyClusters(input, ["2026-Q2", "2026-Q3"], readAt, "entry", "conversations");
  const byCreation = lossMonthlyClusters(input, ["2026-Q2"], readAt, "creation", "conversations");
  expect(byEntry.months.map(row => [row.month, row.total])).toEqual([
    ["2026-04", 0], ["2026-05", 1], ["2026-06", 0],
  ]);
  expect(byEntry.unassigned).toBe(2);
  expect(byEntry.groups).toEqual(["5.000–9.999"]);
  expect(byCreation.unassigned).toBe(0);
  expect(byCreation.groups).toEqual(["0", "Sin dato"]);
  expect(byCreation.months.map(row => row.counts)).toEqual([[1, 0], [0, 0], [0, 1]]);
  expect(byEntry.months[1]?.cohorts.map(group => group.map(row => row.id))).toEqual([["one"]]);
  expect(byCreation.months.map(row => row.cohorts.map(group => group.map(deal => deal.id))))
    .toEqual([[["two"], []], [[], []], [[], ["three"]]]);
});

test("aggregates native MRR, employee size, company size and industry as distinct dimensions", () => {
  const input = [
    deal("one", "2026-06-10", { monthlyRevenue: 0, currency: "USD", companySize: "T2", employees: "Grande: +300", industry: "Salud" }),
    deal("two", "2026-06-10", { monthlyRevenue: 999.95, currency: "USD", companySize: "T3", employees: "Grande: +300", industry: "Salud" }),
    deal("three", "2026-06-10", { monthlyRevenue: 999.95, currency: "CLP" }),
    deal("four", "2026-06-11", {}),
  ];
  const series = (cluster: Parameters<typeof lossMonthlyClusters>[4]) => lossMonthlyClusters(input, ["2026-Q2"], readAt, "creation", cluster);
  expect(series("mrr").groups).toEqual(["USD 0", "USD 500 a <1.000", "MRR en otra moneda", "Sin dato"]);
  expect(series("companySize").groups).toEqual(["T2", "T3", "Sin dato"]);
  expect(series("employees").groups).toEqual(["Grande: +300", "Sin dato"]);
  expect(series("industry").months.at(-1)?.counts).toEqual([2, 2]);
});


test("groups recorded meetings per deal and preserves zero separately from unknown", () => {
  const input = [null, 0, 1, 2, 3, 4, 5, 14].map((meetings, index) =>
    deal(String(index), "2026-06-10", { meetings, entry: "2026-06-14" }),
  );
  for (const basis of ["creation", "entry"] as const) {
    const series = lossMonthlyClusters(input, ["2026-Q2"], readAt, basis, "meetings");
    expect(series.groups).toEqual([
      "0 reuniones", "1 reunión", "2 reuniones", "3 reuniones", "4 reuniones", "5 o más reuniones", "Sin dato",
    ]);
    expect(series.months.at(-1)?.counts).toEqual([1, 1, 1, 1, 1, 2, 1]);
    expect(series.months.at(-1)?.total).toBe(8);
  }
});
