/** Customer identity and current deal evidence, independent of lifecycle labels. */
export type CustomerRecord = { id: string; properties: Record<string, string | null> };
export type CustomerEvidence = {
  companies: CustomerRecord[];
  deals: CustomerRecord[];
  associations: Record<string, { id: string; primary: boolean }[]>;
};
export const CUSTOMER_WON_STAGES = new Set([
  "174677684",
  "1278792585",
  "1086544542",
  "213244763",
  "171385868",
  "173990327",
]);
export const CUSTOMER_CHURN_STAGE = "178228041";
export function accountNumericId(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!/^\d+(?:\.0+)?$/.test(value)) return "";
  const id = value.replace(/\.0+$/, "").replace(/^0+(?=\d)/, "");
  return id === "0" ? "" : id;
}
export function reconcileCustomerAccounts(evidence: CustomerEvidence) {
  const companies = new Map(evidence.companies.map((row) => [row.id, row]));
  const parents = new Map([...companies.keys()].map((id) => [id, id]));
  function root(id: string): string {
    const parent = parents.get(id)!;
    if (parent === id) return id;
    const result = root(parent);
    parents.set(id, result);
    return result;
  }
  const holding = (id: string) => accountNumericId(companies.get(id)?.properties["id_holding"]);
  const byHolding = new Map<string, string[]>();
  const byInstance = new Map<string, Set<string>>();
  for (const company of companies.values()) {
    const h = holding(company.id);
    if (h) byHolding.set(h, [...(byHolding.get(h) ?? []), company.id]);
    const instance = accountNumericId(company.properties["id_empresa"]);
    if (instance)
      byInstance.set(instance, new Set([...(byInstance.get(instance) ?? []), company.id]));
  }
  for (const ids of byHolding.values()) for (const id of ids) parents.set(root(id), root(ids[0]!));
  function targets(dealId: string) {
    const links = evidence.associations[dealId] ?? [];
    const primary = links.filter((row) => row.primary);
    return [
      ...new Set(
        (primary.length ? primary : links).map((row) => row.id).filter((id) => companies.has(id)),
      ),
    ];
  }
  const mismatchedDealInstances: string[] = [];
  for (const deal of evidence.deals) {
    if (
      !CUSTOMER_WON_STAGES.has(deal.properties["dealstage"] ?? "") &&
      deal.properties["dealstage"] !== CUSTOMER_CHURN_STAGE
    )
      continue;
    const ids = targets(deal.id);
    const instance = accountNumericId(deal.properties["id_de_backoffice__negocio_"]);
    if (!instance || new Set(ids.map(root)).size !== 1) continue;
    const members = [...companies.keys()].filter((id) => root(id) === root(ids[0]!));
    const native = members
      .map((id) => accountNumericId(companies.get(id)?.properties["id_empresa"]))
      .filter(Boolean);
    if (native.length && !native.includes(instance)) {
      if (CUSTOMER_WON_STAGES.has(deal.properties["dealstage"] ?? ""))
        mismatchedDealInstances.push(deal.id);
      continue;
    }
    byInstance.set(instance, new Set([...(byInstance.get(instance) ?? []), ...ids]));
  }
  // Validate the whole instance component before joining anything. A missing-ID
  // company must never bridge two known holdings based on iteration order.
  const proposed = new Map([...companies.keys()].map((id) => [root(id), root(id)]));
  const proposedRoot = (id: string): string => {
    const parent = proposed.get(id)!;
    if (parent === id) return id;
    const result = proposedRoot(parent);
    proposed.set(id, result);
    return result;
  };
  for (const ids of byInstance.values()) {
    const list = [...ids].map(root);
    for (const id of list) proposed.set(proposedRoot(id), proposedRoot(list[0]!));
  }
  const proposedHoldings = new Map<string, Set<string>>();
  for (const id of companies.keys()) {
    const key = proposedRoot(root(id));
    const values = proposedHoldings.get(key) ?? new Set<string>();
    if (holding(id)) values.add(holding(id));
    proposedHoldings.set(key, values);
  }
  const conflictingInstances: string[] = [];
  for (const [instance, ids] of byInstance) {
    const list = [...ids];
    if ((proposedHoldings.get(proposedRoot(root(list[0]!)))?.size ?? 0) > 1) {
      conflictingInstances.push(instance);
      continue;
    }
    for (const id of list) parents.set(root(id), root(list[0]!));
  }
  const groups = new Map<
    string,
    {
      key: string;
      holdingId: string;
      companies: CustomerRecord[];
      deals: CustomerRecord[];
      instanceIds: string[];
    }
  >();
  for (const company of companies.values()) {
    const key = root(company.id);
    const group = groups.get(key) ?? {
      key,
      holdingId: "",
      companies: [],
      deals: [],
      instanceIds: [],
    };
    group.companies.push(company);
    group.holdingId ||= holding(company.id);
    groups.set(key, group);
  }
  for (const [instance, ids] of byInstance) {
    const roots = new Set([...ids].map(root));
    if (roots.size === 1 && !conflictingInstances.includes(instance))
      groups.get([...roots][0]!)!.instanceIds.push(instance);
  }
  const unresolvedWon: string[] = [];
  for (const deal of evidence.deals) {
    const ids = targets(deal.id);
    const instance = accountNumericId(deal.properties["id_de_backoffice__negocio_"]);
    const exact = ids.filter(
      (id) =>
        accountNumericId(companies.get(id)?.properties["id_empresa"]) === instance && instance,
    );
    let roots = new Set((exact.length ? exact : ids).map(root));
    if (!roots.size) {
      if (instance && !conflictingInstances.includes(instance))
        roots = new Set([...(byInstance.get(instance) ?? [])].map(root));
    }
    if (roots.size === 1) groups.get([...roots][0]!)!.deals.push(deal);
    else if (CUSTOMER_WON_STAGES.has(deal.properties["dealstage"] ?? ""))
      unresolvedWon.push(deal.id);
  }
  const all = [...groups.values()];
  const candidates = all.filter((group) =>
    group.deals.some((deal) => CUSTOMER_WON_STAGES.has(deal.properties["dealstage"] ?? "")),
  );
  const churnOnly = all.filter(
    (group) =>
      !candidates.includes(group) &&
      group.deals.some((deal) => deal.properties["dealstage"] === CUSTOMER_CHURN_STAGE),
  );
  const pending = candidates.filter(
    (group) =>
      !group.deals.some(
        (deal) =>
          CUSTOMER_WON_STAGES.has(deal.properties["dealstage"] ?? "") &&
          targets(deal.id).some(
            (id) =>
              root(id) === root(group.companies[0]!.id) &&
              companies.get(id)?.properties["tipo_de_cliente"] !== "Churn",
          ),
      ) ||
      (!group.holdingId && !group.instanceIds.length),
  );
  const active = candidates.filter((group) => !pending.includes(group));
  return {
    active,
    pending,
    churnOnly,
    audit: {
      lifecycleCompanies: evidence.companies.filter(
        (row) => row.properties["lifecyclestage"] === "customer",
      ).length,
      activeAccounts: active.length,
      pendingAccounts: pending.length,
      mismatchedDealInstances,
      churnOnlyAccounts: churnOnly.length,
      lifecycleWithoutWon: all.filter(
        (group) =>
          !candidates.includes(group) &&
          !churnOnly.includes(group) &&
          group.companies.some((row) => row.properties["lifecyclestage"] === "customer"),
      ).length,
      activeWithoutCustomerLabel: active.filter(
        (group) => !group.companies.some((row) => row.properties["lifecyclestage"] === "customer"),
      ).length,
      activeWithChurnLabel: candidates.filter((group) =>
        group.companies.some((row) => row.properties["tipo_de_cliente"] === "Churn"),
      ).length,
      withoutHolding: active.filter((group) => !group.holdingId).length,
      withoutInstance: active.filter((group) => !group.instanceIds.length).length,
      conflictingInstances,
      unresolvedWon,
    },
  };
}
