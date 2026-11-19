export type GhostingActivity = {
  calls: number | null;
  whatsapp: number | null;
  emails: number | null;
  meetings: { completed: number; unverified: number } | null;
};

export const GHOSTING_CHANNELS = [
  ["calls", "Llamadas"],
  ["whatsapp", "WhatsApp"],
  ["emails", "Correos"],
] as const;
export const GHOSTING_MINIMUM = 2;
export const GHOSTING_BATCH_SIZE = 50;

export function isGhostingLoss(reason: string | null | undefined) {
  return /\bghost(?:ing)?\b/i.test(reason ?? "");
}

export function ghostingMinimum(activity?: GhostingActivity) {
  const counts = GHOSTING_CHANNELS.map(([channel]) => activity?.[channel] ?? null);
  if (counts.some(count => count !== null && count < GHOSTING_MINIMUM)) return "short";
  return counts.some(count => count === null) ? "unknown" : "met";
}

export function completedMeeting(properties: Record<string, string | null>, now: number): boolean | null {
  const outcome = properties["hs_meeting_outcome"]?.trim();
  if (!outcome) return null;
  if (outcome !== "COMPLETED") return false;
  const start = properties["hs_meeting_start_time"]?.trim() || properties["hs_timestamp"]?.trim() || "";
  const at = /^\d{13}$/.test(start) ? Number(start) : Date.parse(start);
  return Number.isFinite(at) ? at <= now : null;
}
