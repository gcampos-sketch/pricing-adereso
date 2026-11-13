import { expect, test } from "bun:test";
import {
  reconcileCustomerAccounts,
  type CustomerEvidence,
  type CustomerRecord,
} from "../src/lib/customer-accounts";
const company = (id: string, props: Record<string, string | null> = {}): CustomerRecord => ({
  id,
  properties: { name: id, ...props },
});
const deal = (id: string, stage = "173990327", instance: string | null = null): CustomerRecord => ({
  id,
  properties: { dealstage: stage, id_de_backoffice__negocio_: instance },
});
const evidence = (
  companies: CustomerRecord[],
  deals: CustomerRecord[],
  links: Record<string, string[]>,
): CustomerEvidence => ({
  companies,
  deals,
  associations: Object.fromEntries(
    Object.entries(links).map(([id, ids]) => [id, ids.map((id) => ({ id, primary: false }))]),
  ),
});
test("one holding across subsidiaries and instances, regardless of lifecycle label", () => {
  const result = reconcileCustomerAccounts(
    evidence(
      [
        company("a", { id_holding: "0012", id_empresa: "10" }),
        company("b", { id_holding: "12.0", id_empresa: "11" }),
      ],
      [deal("x"), deal("y")],
      { x: ["a"], y: ["b"] },
    ),
  );
  expect(result.active).toHaveLength(1);
  expect(result.active[0]?.instanceIds.sort()).toEqual(["10", "11"]);
  expect(result.audit.activeWithoutCustomerLabel).toBe(1);
});
test("lifecycle customer and company instance do not substitute for a won associated deal; churn-only excluded", () => {
  const result = reconcileCustomerAccounts(
    evidence(
      [
        company("a", { lifecyclestage: "customer", id_holding: "1" }),
        company("b", { lifecyclestage: "customer", id_empresa: "2" }),
      ],
      [deal("churn", "178228041"), deal("open", "171385867")],
      { churn: ["a"], open: ["b"] },
    ),
  );
  expect(result.active).toHaveLength(0);
  expect(result.audit.churnOnlyAccounts).toBe(1);
  expect(result.audit.lifecycleWithoutWon).toBe(1);
});
test("same instance deduplicates missing-holding companies and can recover the holding", () => {
  const result = reconcileCustomerAccounts(
    evidence(
      [company("a", { id_empresa: "10", id_holding: "1" }), company("b")],
      [deal("x", "173990327", "10"), deal("y", "173990327", "10")],
      { x: ["a"], y: ["b"] },
    ),
  );
  expect(result.active).toHaveLength(1);
  expect(result.active[0]?.companies).toHaveLength(2);
});
test("a mismatched deal instance never merges two companies with different native IDs", () => {
  const result = reconcileCustomerAccounts(
    evidence(
      [company("a", { id_empresa: "10" }), company("b", { id_empresa: "11" })],
      [deal("x", "173990327", "11"), deal("y", "173990327", "11")],
      { x: ["a"], y: ["b"] },
    ),
  );
  expect(result.active).toHaveLength(2);
  expect(result.audit.mismatchedDealInstances).toEqual(["x"]);
});
test("same instance never fuses conflicting holding IDs", () => {
  const result = reconcileCustomerAccounts(
    evidence(
      [
        company("a", { id_holding: "1", id_empresa: "10" }),
        company("b", { id_holding: "2", id_empresa: "10" }),
      ],
      [deal("x"), deal("y")],
      { x: ["a"], y: ["b"] },
    ),
  );
  expect(result.active).toHaveLength(2);
  expect(result.audit.conflictingInstances).toEqual(["10"]);
});
test("churn-label versus won conflict and missing identity stay pending, not zero or confirmed", () => {
  const result = reconcileCustomerAccounts(
    evidence(
      [company("a", { id_empresa: "10", tipo_de_cliente: "Churn" }), company("b")],
      [deal("x"), deal("y")],
      { x: ["a"], y: ["b"] },
    ),
  );
  expect(result.active).toHaveLength(0);
  expect(result.pending).toHaveLength(2);
});
test("a churned subsidiary cannot cancel a different live won subsidiary in the same holding", () => {
  const result = reconcileCustomerAccounts(
    evidence(
      [
        company("a", { id_holding: "1", tipo_de_cliente: "Churn" }),
        company("b", { id_holding: "1", tipo_de_cliente: "T2" }),
      ],
      [deal("x", "178228041"), deal("y")],
      { x: ["a"], y: ["b"] },
    ),
  );
  expect(result.active).toHaveLength(1);
  expect(result.pending).toHaveLength(0);
});
test("exact instance disambiguates multiple associations; orphan and ambiguous won remain unresolved", () => {
  const result = reconcileCustomerAccounts(
    evidence(
      [
        company("a", { id_holding: "1", id_empresa: "10" }),
        company("b", { id_holding: "2", id_empresa: "11" }),
      ],
      [deal("exact", "173990327", "10"), deal("ambiguous"), deal("orphan")],
      { exact: ["a", "b"], ambiguous: ["a", "b"], orphan: [] },
    ),
  );
  expect(result.active).toHaveLength(1);
  expect(result.active[0]?.holdingId).toBe("1");
  expect(result.audit.unresolvedWon).toEqual(["ambiguous", "orphan"]);
});

test("a company without identity cannot bridge two known holdings in either input order", () => {
  const companies = [
    company("a", { id_holding: "1", id_empresa: "10" }),
    company("b"),
    company("c", { id_holding: "2", id_empresa: "11" }),
  ];
  const deals = [deal("x", "173990327", "10"), deal("y", "173990327", "11"), deal("a"), deal("c")];
  for (const rows of [deals, [...deals].reverse()]) {
    const result = reconcileCustomerAccounts(
      evidence(companies, rows, { x: ["b"], y: ["b"], a: ["a"], c: ["c"] }),
    );
    expect(result.active).toHaveLength(2);
    expect(result.pending).toHaveLength(1);
    expect(result.audit.conflictingInstances.sort()).toEqual(["10", "11"]);
  }
});

test("churn accounts are unique holdings and never overlap a holding with a current won deal", () => {
  const result = reconcileCustomerAccounts(evidence(
    [company("a", { id_holding:"10", id_empresa:"1" }), company("b", { id_holding:"10", id_empresa:"2" }), company("c", { id_holding:"20", id_empresa:"3" }), company("d", { id_holding:"20", id_empresa:"4" })],
    [deal("churn1", "178228041", "1"), deal("churn2", "178228041", "2"), deal("churn3", "178228041", "3"), deal("live", "173990327", "4")],
    {churn1:["a"],churn2:["b"],churn3:["c"],live:["d"]},
  ));
  expect(result.churnOnly.length).toBe(1);
  expect(result.churnOnly[0]?.holdingId).toBe("10");
  expect(result.churnOnly[0]?.deals.length).toBe(2);
  expect(result.active.length).toBe(1);
});
