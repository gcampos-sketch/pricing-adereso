export type GhostingActivity = {
  calls: number | null;
  whatsapp: number | null;
  emails: number | null;
  meetings: { completedIds: string[]; unverified: number } | null;
  originStage: string | null;
};

export const GHOSTING_CHANNELS = [
  ["calls", "Llamadas"],
  ["whatsapp", "WhatsApp"],
  ["emails", "Correos"],
] as const;
export const GHOSTING_MINIMUM = 2;
export const GHOSTING_STATUS_LABELS = { met: "Cumple el mínimo", short: "Bajo el mínimo", unknown: "Mínimo sin verificar" };
export const GHOSTING_BATCH_SIZE = 50;

export function isGhostingLoss(reason: string | null | undefined) {
  return /\bghost(?:ing)?\b/i.test(reason ?? "");
}

export function ghostingMinimum(activity?: GhostingActivity) {
  const counts = GHOSTING_CHANNELS.map(([channel]) => activity?.[channel] ?? null);
  if (counts.some(count => count !== null && count < GHOSTING_MINIMUM)) return "short";
  return counts.some(count => count === null) ? "unknown" : "met";
}

export const GHOSTING_STATUS_ORDER = ["short", "unknown", "met"] as const;

export function groupGhostingDeals<T extends { id: string }>(
  deals: readonly T[],
  evidence: Readonly<Record<string, GhostingActivity>> | undefined,
) {
  const groups: Record<ReturnType<typeof ghostingMinimum>, T[]> = { short: [], unknown: [], met: [] };
  for (const deal of deals) groups[ghostingMinimum(evidence?.[deal.id])].push(deal);
  return groups;
}

export function summarizeGhosting(
  deals: readonly { id: string }[],
  evidence: Readonly<Record<string, GhostingActivity>> | undefined,
) {
  const activities = [...new Set(deals.map(deal => deal.id))].map(id => evidence?.[id]);
  const metrics = [
    ...GHOSTING_CHANNELS.map(([channel, label]) => ({
      label, counts: activities.map(activity => activity?.[channel]),
    })),
    { label: "Reuniones completadas", counts: activities.map(activity => {
      const meetings = activity?.meetings;
      return meetings?.unverified === 0 ? meetings.completedIds.length : null;
    }) },
  ].map(({ label, counts }) => {
    const verified = counts.flatMap(count => typeof count === "number" && Number.isFinite(count) ? [count] : [])
      .sort((a, b) => a - b);
    const size = verified.length;
    return { label, covered: size, median: size ? (verified[Math.floor((size - 1) / 2)]! + verified[Math.floor(size / 2)]!) / 2 : null };
  });

  const stages = new Map<string, number>();
  for (const activity of activities) {
    const stage = activity?.originStage;
    if (stage) stages.set(stage, (stages.get(stage) ?? 0) + 1);
  }
  const stageCovered = [...stages.values()].reduce((total, count) => total + count, 0);
  const stageFrequency = Math.max(0, ...stages.values());
  const modalStages = [...stages].filter(([, count]) => count === stageFrequency)
    .map(([stage]) => stage).sort((a, b) => a.localeCompare(b, "es"));
  return { metrics, modalStages, stageCovered, stageFrequency };
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
