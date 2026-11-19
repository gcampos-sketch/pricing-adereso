import type { InsightDeal } from "./insights-types";

export const LOSS_CLUSTERS = [
  ["conversations", "Cantidad de conversaciones"],
  ["companySize", "Tamaño empresa"],
  ["mrr", "MRR"],
  ["employees", "Tamaño por empleados"],
  ["industry", "Industria Adereso"],
] as const;
export type LossCluster = typeof LOSS_CLUSTERS[number][0];
export type LossClusterDate = "entry" | "creation";

export type LossClusterFields = {
  conversations: number | null;
  companySize: string | null;
  monthlyRevenue: number | null;
  currency: string | null;
  employees: string | null;
  industry: string | null;
  entry: string | null;
};

export const LOSS_CLUSTER_VERSION = "loss-clusters/v1";
const missing = "Sin dato";
const conversationBands = ["0", "1–999", "1.000–4.999", "5.000–9.999", "10.000 o más"];
const revenueBands = ["USD 0", "Menos de USD 500", "USD 500 a <1.000", "USD 1.000 a <2.500", "USD 2.500 o más"];
const bands = (value: number | null, limits: number[], labels: string[]) =>
  value === null ? missing : labels[limits.filter(limit => value >= limit).length]!;
const formatMonth = new Intl.DateTimeFormat("es-CL", { month: "short", year: "2-digit", timeZone: "UTC" });

function groupOf(fields: LossClusterFields, cluster: LossCluster): string {
  switch (cluster) {
    case "conversations":
      return bands(fields.conversations, [1, 1000, 5000, 10000], conversationBands);
    case "mrr":
      if (fields.monthlyRevenue === null) return missing;
      if (fields.currency !== "USD") return fields.currency ? "MRR en otra moneda" : "Moneda sin dato";
      return bands(fields.monthlyRevenue, [Number.MIN_VALUE, 500, 1000, 2500], revenueBands);
    default:
      return fields[cluster] || missing;
  }
}

export function lossMonthlyClusters(
  candidates: readonly InsightDeal[], periods: readonly string[], readAt: string,
  basis: LossClusterDate, cluster: LossCluster,
) {
  const readTime = Date.parse(readAt);
  const months = new Map<string, { label: string; total: number; counts: Map<string, number> }>();
  for (const period of [...new Set(periods)].sort()) {
    const [year, quarter] = period.split("-Q").map(Number);
    if (!year || !quarter || quarter < 1 || quarter > 4) continue;
    for (let offset = 0; offset < 3; offset++) {
      const date = new Date(Date.UTC(year, (quarter - 1) * 3 + offset, 1));
      if (date.getTime() <= readTime) months.set(date.toISOString().slice(0, 7), {
        label: formatMonth.format(date), total: 0, counts: new Map(),
      });
    }
  }

  const groups = new Set<string>();
  let unassigned = 0;
  const lost = new Map(candidates.filter(deal => deal.status === "lost" && deal.lossClusters).map(deal => [deal.id, deal]));
  for (const deal of lost.values()) {
    const fields = deal.lossClusters!;
    const rawDate = basis === "entry" ? fields.entry : deal.createdAt;
    const date = rawDate && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(rawDate) ? Date.parse(rawDate) : NaN;
    if (!Number.isFinite(date) || !(date <= readTime)) {
      unassigned++;
      continue;
    }
    const month = months.get(new Date(date).toISOString().slice(0, 7));
    if (!month) continue;
    const group = groupOf(fields, cluster);
    groups.add(group);
    month.counts.set(group, (month.counts.get(group) ?? 0) + 1);
    month.total++;
  }

  const ordered = cluster === "conversations" ? conversationBands : cluster === "mrr" ? revenueBands : [];
  const order = [...ordered, ...[...groups].filter(group => group !== missing && !ordered.includes(group)).sort((a, b) => a.localeCompare(b, "es")), missing]
    .filter(group => groups.has(group));
  return {
    unassigned,
    groups: order,
    months: [...months].map(([month, row]) => ({
      month, label: row.label, total: row.total,
      counts: order.map(group => row.counts.get(group) ?? 0),
    })),
  };
}
