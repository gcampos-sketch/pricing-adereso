/** Completed 24-hour days from the real CRM timestamp; unknown/future dates stay unknown. */
export function dealAgeDays(createdAt: string | undefined, now: number): number | null {
  const created = createdAt?.trim() ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(created) || !Number.isFinite(now) || created > now) return null;
  return Math.floor((now - created) / 86_400_000);
}
