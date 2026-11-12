import { test, expect } from "bun:test";
import {
  calendarDate,
  serviceMonths,
  upcomingThisQuarter,
  type ServiceDeal,
} from "../src/lib/service-overview";
const deal = (id: string, date: string): ServiceDeal => ({
  id,
  date,
  name: id,
  owner: "AE",
  industry: "Retail",
  stage: "6.2",
  mrr: 100,
});
test("upcoming uses service date from today through current quarter, not close date or expired plans", () => {
  const rows = [
    deal("expired", "2026-11-10"),
    deal("today", "2026-11-11"),
    deal("end", "2026-12-31"),
    deal("next", "2027-01-01"),
    deal("missing", ""),
  ];
  expect(upcomingThisQuarter(rows, "2026-11-11").map((row) => row.id)).toEqual(["today", "end"]);
  expect(
    upcomingThisQuarter(
      [deal("march", "2027-03-31"), deal("april", "2027-04-01")],
      "2027-03-01",
    ).map((row) => row.id),
  ).toEqual(["march"]);
});
test("month groups sort by exact service date and keep undated plans explicit at the end", () => {
  const rows = [
    deal("missing", ""),
    deal("late", "2026-12-30"),
    deal("early", "2026-11-12"),
    deal("first", "2026-11-01"),
  ];
  expect(serviceMonths(rows).map((group) => [group.key, group.deals.map((row) => row.id)])).toEqual(
    [
      ["2026-11", ["first", "early"]],
      ["2026-12", ["late"]],
      ["undated", ["missing"]],
    ],
  );
  expect(rows[0].id).toBe("missing");
});
test("service date accepts HubSpot ISO dates and epoch milliseconds; invalid remains unknown", () => {
  expect(calendarDate("2026-11-11T00:00:00.000Z")).toBe("2026-11-11");
  expect(calendarDate(String(Date.UTC(2026, 10, 11)))).toBe("2026-11-11");
  expect(calendarDate("invalid")).toBe("");
  expect(calendarDate(null)).toBe("");
});

test("customer clusters use one recorded industry by frequency, ignoring unknown values and preserving all deals", async () => {
  const { customerIndustryCluster } = await import("../src/lib/service-overview");
  const customer = {
    id: "company",
    name: "Company",
    owner: "Company owner",
    industries: ["Retail", "Salud", "Sin industria"],
    deals: [
      { id: "1", name: "A", industry: "Retail" },
      { id: "2", name: "B", industry: "Retail" },
      { id: "3", name: "C", industry: "Salud" },
      { id: "4", name: "D", industry: "Sin industria" },
    ],
  };
  expect(customerIndustryCluster(customer)).toBe("Retail");
  expect(customer.deals).toHaveLength(4);
  expect(customerIndustryCluster({ ...customer, deals: [] })).toBe("Sin industria");
});

test("quarter clusters preserve every deal, chronological order, year boundaries and undated plans", async () => {
  const { servicePeriodGroups } = await import("../src/lib/service-overview");
  const rows = [
    deal("missing", ""),
    deal("next-year", "2027-01-05"),
    deal("dec", "2026-12-20"),
    deal("oct", "2026-10-01"),
    deal("sep", "2026-09-30"),
  ];
  const groups = servicePeriodGroups(rows, "quarter");
  expect(groups.map((group) => [group.key, group.deals.map((row) => row.id)])).toEqual([
    ["2026-Q3", ["sep"]],
    ["2026-Q4", ["oct", "dec"]],
    ["2027-Q1", ["next-year"]],
    ["undated", ["missing"]],
  ]);
  expect(groups.flatMap((group) => group.deals).reduce((sum, row) => sum + row.mrr, 0)).toBe(500);
  expect(servicePeriodGroups(rows, "month")).toEqual(serviceMonths(rows));
});
