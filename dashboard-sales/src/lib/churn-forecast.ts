export type ConfirmedChurn = {
  name: string;
  month: string;
  mrr: number;
  dealIds: string[];
};

export type ChurnForecast = {
  confirmed: ConfirmedChurn[] | null;
  readOn: string | null;
  pending: { id: string; name: string; serviceEnd: string | null }[] | null;
  risk: { name: string; mrr: number }[];
};

export function plannedChurnMonths(
  confirmed: ConfirmedChurn[],
  snapshot: { month: string; dealIds: string[]; count: number } | null,
) {
  const inServiceIds = new Set(snapshot?.dealIds);
  const months = new Map<string, { month: string; total: number; rows: ConfirmedChurn[] }>();
  for (const row of confirmed) {
    // Only retire a confirmed loss when a complete service snapshot from its effective month
    // (or later) shows that every affected deal has left the MRR baseline.
    if (
      snapshot && snapshot.count > 0 && inServiceIds.size === snapshot.count &&
      snapshot.month >= row.month && row.dealIds.length > 0 && row.dealIds.every((id) => !inServiceIds.has(id))
    ) continue;
    const group = months.get(row.month) ?? { month: row.month, total: 0, rows: [] };
    group.total += row.mrr;
    group.rows.push(row);
    months.set(row.month, group);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
