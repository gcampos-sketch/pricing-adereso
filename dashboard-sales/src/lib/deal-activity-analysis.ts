export const ACTIVITY_CHANNELS = {
  emails: "Correos",
  communications: "WhatsApp",
  calls: "Llamadas",
  meetings: "Reuniones",
} as const;
export type ActivityChannel = keyof typeof ACTIVITY_CHANNELS;
export const activityChannels = Object.keys(ACTIVITY_CHANNELS) as ActivityChannel[];
export const DAY_MS = 86_400_000;
export const CLOSE_WINDOW = 14;

export type ActivityOutcome = "active" | "won" | "lost";
export type ActivityDeal = {
  id: string;
  name: string;
  url: string;
  ownerId: string;
  owner: string;
  segment: string;
  stage: string;
  industry: string;
  lossReason: string;
  lossType: string;
  outcome: ActivityOutcome;
  created: number | null;
  cutoff: number;
  stageFrom: number | null;
};

export type DealActivity = {
  id: string;
  at: number;
  actor: string;
  actorId: string;
  status: string;
  counted: boolean;
};

export type ActivityReport = {
  readAt: number;
  deals: ActivityDeal[];
  undated: Array<Pick<ActivityDeal, "ownerId" | "segment" | "outcome">>;
  channels: Record<
    ActivityChannel,
    {
      events: Record<string, DealActivity[]>;
      unavailable: string[];
      undated: string[];
    }
  >;
};

export type ActivityWindow = "all" | "recent" | "stage";
export type ActivityEvent = DealActivity & { channel: ActivityChannel };

export function observeActivity(
  deal: ActivityDeal,
  report: ActivityReport,
  channels: ActivityChannel[],
  window: ActivityWindow,
) {
  const start =
    deal.created == null
      ? null
      : window === "stage"
        ? deal.stageFrom
        : window === "recent"
          ? Math.max(deal.created, deal.cutoff - CLOSE_WINDOW * DAY_MS)
          : deal.created;
  const events: ActivityEvent[] = [];
  let complete = start !== null;
  for (const channel of channels) {
    const data = report.channels[channel];
    if (data.unavailable.includes(deal.id) || data.undated.includes(deal.id)) complete = false;
    for (const event of data.events[deal.id] ?? []) {
      if (
        start !== null &&
        event.at >= start &&
        (deal.outcome === "active" ? event.at <= deal.cutoff : event.at < deal.cutoff)
      )
        events.push({ ...event, channel });
    }
  }
  events.sort((a, b) => b.at - a.at);
  return { deal, events, counted: events.filter((event) => event.counted), complete };
}

export type ActivityObservation = ReturnType<typeof observeActivity>;

export function summarizeActivity(rows: ActivityObservation[]) {
  const covered = rows.filter((row) => row.complete);
  const counts = covered.map((row) => row.counted.length).sort((a, b) => a - b);
  const mid = Math.floor(counts.length / 2);
  return {
    deals: rows.length,
    covered: covered.length,
    zero: covered.filter((row) => !row.counted.length).length,
    average: counts.length ? counts.reduce((sum, n) => sum + n, 0) / counts.length : null,
    median: counts.length
      ? (counts[mid]! + counts[Math.floor((counts.length - 1) / 2)]!) / 2
      : null,
  };
}

export function isUnconfirmedWhatsApp(event: ActivityEvent) {
  return event.channel === "communications" && event.status === "Sin dirección confirmada";
}

export function activityByActor(rows: ActivityObservation[]) {
  const actors = new Map<
    string,
    {
      name: string;
      rows: Set<ActivityObservation>;
      counts: Record<ActivityChannel, number>;
      unconfirmedWhatsApp: number;
    }
  >();
  const seen = new Set<string>();
  for (const row of rows) {
    for (const event of row.events) {
      if (!event.counted && !isUnconfirmedWhatsApp(event)) continue;
      const key = event.actorId;
      const actor = actors.get(key) ?? {
        name: event.actor,
        rows: new Set(),
        counts: { emails: 0, communications: 0, calls: 0, meetings: 0 },
        unconfirmedWhatsApp: 0,
      };
      actors.set(key, actor);
      actor.rows.add(row);
      const eventKey = `${event.channel}:${event.id}`;
      if (seen.has(eventKey)) continue;
      seen.add(eventKey);
      if (event.counted) actor.counts[event.channel]++;
      else actor.unconfirmedWhatsApp++;
    }
  }
  return [...actors.entries()]
    .map(([id, actor]) => ({
      id,
      ...actor,
      total: Object.values(actor.counts).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total || b.unconfirmedWhatsApp - a.unconfirmedWhatsApp);
}
