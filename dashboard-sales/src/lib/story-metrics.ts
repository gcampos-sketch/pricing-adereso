/** Calendar periods share an elapsed window when the selected period is still open. */
export function creationComparisonWindow(year: number, quarter: string, now: number) {
  const allYear = quarter === "all";
  const month = allYear ? 0 : (Number(quarter) - 1) * 3;
  const currentStart = Date.UTC(year, month, 1);
  const currentEnd = Date.UTC(year, month + (allYear ? 12 : 3), 1);
  const previousStart = allYear ? Date.UTC(year - 1, 0, 1) : Date.UTC(year, month - 3, 1);
  const previousEnd = currentStart;
  const partial = now >= currentStart && now < currentEnd;
  const elapsed = Math.max(0, Math.min(now, currentEnd) - currentStart);
  return {
    currentStart,
    currentEnd: Math.min(now, currentEnd),
    previousStart,
    previousEnd: partial ? Math.min(previousEnd, previousStart + elapsed) : previousEnd,
    partial,
    future: now < currentStart,
  };
}

export function hasOrderedActivation(entered: Record<string, string>) {
  const from = Date.parse(entered["E0"] ?? "");
  const to = Date.parse(entered["E1"] ?? "");
  return Number.isFinite(from) && Number.isFinite(to) && to >= from;
}