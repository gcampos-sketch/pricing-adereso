export type GhostingActivity = {
  calls: number | null;
  whatsapp: number | null;
  emails: number | null;
  meetings: { completedIds: string[]; unverified: number } | null;
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

type GhostingMeetingWindow = { created: number; lost: number };

function activityTime(raw: string | null | undefined) {
  const value = raw?.trim() ?? "";
  if (/^\d{13}$/.test(value)) return Number(value);
  const day = /^(\d{4}-\d{2}-\d{2})T.*(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1];
  if (!day) return NaN;
  const midnight = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(midnight.getTime()) && midnight.toISOString().slice(0, 10) === day ? Date.parse(value) : NaN;
}

export function ghostingMeetingWindow(properties: Record<string, string | null>, stage: string, now: number): GhostingMeetingWindow | null {
  const created = activityTime(properties["createdate"]);
  const lost = activityTime(properties[`hs_v2_date_entered_${stage}`]);
  return Number.isFinite(created) && Number.isFinite(lost) && created <= lost && lost <= now ? { created, lost } : null;
}

export function completedMeeting(properties: Record<string, string | null>, window: GhostingMeetingWindow): boolean | null {
  const outcome = properties["hs_meeting_outcome"]?.trim();
  if (outcome && outcome !== "COMPLETED") return false;
  const at = activityTime(properties["hs_meeting_start_time"]?.trim() || properties["hs_timestamp"]);
  if (!Number.isFinite(at)) return null;
  if (at < window.created || at >= window.lost) return false;
  return outcome ? true : null;
}
