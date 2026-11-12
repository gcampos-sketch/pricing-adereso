export type ServiceDeal = {
  id: string;
  name: string;
  owner: string;
  industry: string;
  date: string;
  mrr: number;
  stage: string;
};
export type ServiceCustomer = {
  id: string;
  name: string;
  owner: string;
  industries: string[];
  holdingId?: string;
  instanceIds?: string[];
  owners?: string[];
  companies?: { id: string; name: string; owner: string; lifecycle: string }[];
  reviewReasons?: string[];
  deals: { id: string; name: string; industry: string; instanceId?: string }[];
};
export type ServiceOverview = {
  fetchedAt: string;
  customers: ServiceCustomer[];
  development: ServiceDeal[];
  pendingCustomers?: ServiceCustomer[];
  customerAudit?: ReturnType<
    typeof import("./customer-accounts").reconcileCustomerAccounts
  >["audit"];
  unresolvedCustomerDeals?: { id: string; name: string }[];
};

/** One cluster per company; unknown values never displace a recorded industry. */
export function customerIndustryCluster(customer: ServiceCustomer): string {
  const counts = new Map<string, number>();
  for (const deal of customer.deals)
    if (deal.industry !== "Sin industria")
      counts.set(deal.industry, (counts.get(deal.industry) ?? 0) + 1);
  return (
    [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "Sin industria"
  );
}

export function calendarDate(raw: string | null | undefined): string {
  if (!raw) return "";
  const date = new Date(/^\d+$/.test(raw) ? Number(raw) : raw);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}
export function upcomingThisQuarter(deals: ServiceDeal[], today: string): ServiceDeal[] {
  const quarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  return deals.filter(
    (deal) =>
      deal.date >= today &&
      deal.date.slice(0, 4) === today.slice(0, 4) &&
      Math.floor((Number(deal.date.slice(5, 7)) - 1) / 3) === quarter,
  );
}
export function servicePeriodGroups(
  deals: ServiceDeal[],
  unit: "month" | "quarter",
): { key: string; deals: ServiceDeal[] }[] {
  const groups = new Map<string, ServiceDeal[]>();
  for (const deal of [...deals].sort(
    (a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name),
  )) {
    const key = !deal.date
      ? "undated"
      : unit === "quarter"
        ? `${deal.date.slice(0, 4)}-Q${Math.ceil(Number(deal.date.slice(5, 7)) / 3)}`
        : deal.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), deal]);
  }
  return [...groups].map(([key, deals]) => ({ key, deals }));
}

export function serviceMonths(deals: ServiceDeal[]) {
  return servicePeriodGroups(deals, "month");
}
