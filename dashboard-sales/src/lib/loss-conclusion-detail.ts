import type { InsightDeal } from "./insights-types";
import { GHOSTING_CHANNELS, GHOSTING_MINIMUM, ghostingMinimum, type GhostingActivity } from "./loss-ghosting";

export const GHOSTING_STATUSES = [
  ["met", "Cumplieron"],
  ["short", "Bajo el mínimo"],
  ["unknown", "Sin verificar"],
] as const;

export function lossDealsByOwner(deals: readonly InsightDeal[]) {
  const groups = new Map<string, { id: string; label: string; deals: InsightDeal[]; mrr: number }>();
  for (const deal of new Map(deals.map(row => [row.id, row])).values()) {
    const id = deal.ownerId || "";
    const group = groups.get(id) ?? { id, label: deal.owner || "Sin comercial", deals: [], mrr: 0 };
    group.deals.push(deal);
    if (Number.isFinite(deal.amountValue)) group.mrr += deal.amountValue;
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => b.mrr - a.mrr || b.deals.length - a.deals.length || a.label.localeCompare(b.label, "es"));
}

export function summarizeGhosting(deals: readonly InsightDeal[], evidence: Readonly<Record<string, GhostingActivity>>) {
  const unique = [...new Map(deals.map(deal => [deal.id, deal])).values()];
  const groups: Record<ReturnType<typeof ghostingMinimum>, InsightDeal[]> = { met: [], short: [], unknown: [] };
  for (const deal of unique) groups[ghostingMinimum(evidence[deal.id])].push(deal);

  const channels = GHOSTING_CHANNELS.map(([channel, label]) => {
    const verified = unique.filter(deal => evidence[deal.id]?.[channel] != null);
    const missing = verified.filter(deal => evidence[deal.id]![channel]! < GHOSTING_MINIMUM);
    return { channel, label, missing, verified: verified.length };
  });
  const highest = Math.max(0, ...channels.map(channel => channel.missing.length));
  const leadingChannels = channels.filter(channel => highest > 0 && channel.missing.length === highest);
  return { groups, channels, leadingChannels, highest };
}

export function ghostingByOwner(deals: readonly InsightDeal[], evidence: Readonly<Record<string, GhostingActivity>>) {
  return lossDealsByOwner(deals).map(owner => {
    const meetings = owner.deals.map(deal => evidence[deal.id]?.meetings);
    return {
      ...owner,
      audit: summarizeGhosting(owner.deals, evidence),
      meetings: {
        completed: new Set(meetings.flatMap(row => row?.completedIds ?? [])).size,
        windowsRead: meetings.filter(Boolean).length,
        incomplete: meetings.filter(row => !row || row.unverified > 0).length,
      },
    };
  })
    .sort((a, b) => b.audit.groups.short.length - a.audit.groups.short.length ||
      b.audit.groups.unknown.length - a.audit.groups.unknown.length ||
      b.deals.length - a.deals.length || a.label.localeCompare(b.label, "es"));
}
