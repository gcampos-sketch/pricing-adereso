import { activityChannels, DAY_MS, type ActivityChannel, type ActivityReport } from "./deal-activity-analysis";
import type { LossHistoryVersion } from "./loss-prior-score";

export const WARNING_STAGE = "1278792585";
const DAY = DAY_MS;
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Coyhaique" });
export const PRE_KICKOFF_STAGE = "174677684";
const WARNING_ENTRY = `hs_v2_date_entered_${WARNING_STAGE}`;

export const WARNING_PROPERTIES = {
  motivo_deal_warning: "Motivo Warning",
  motivo_de_retraso: "Motivo de retraso",
  alerta_finanazas_negocio: "Alerta Finanzas",
  alerta_sspp: "Alerta SSPP",
} as const;

export type WarningProperty = keyof typeof WARNING_PROPERTIES;
export type WarningDetail = {
  enteredAt: string | null;
  previousStage: string | null;
  previousDays: number | null;
  days: number | null;
  fields: Partial<Record<WarningProperty, string[]>>;
  kickoffPending?: boolean;
  activity?: WarningActivity;
};

const timestamp = (value?: string | null) => value && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;

export function warningTimeline(
  properties: Record<string, string | null>,
  history: LossHistoryVersion[],
  now: number,
): Omit<WarningDetail, "fields" | "activity" | "kickoffPending"> & { previousStageId: string | null } {
  const entry = timestamp(properties[WARNING_ENTRY]);
  const hasEntry = Number.isFinite(entry) && entry <= now;
  const result = {
    enteredAt: hasEntry ? new Date(entry).toISOString() : null,
    days: hasEntry ? Math.floor((now - entry) / DAY) : null,
    previousStage: null,
    previousStageId: null,
    previousDays: null,
  };
  const byTime = new Map<number, Set<string>>();
  for (const version of history) {
    const at = timestamp(version.timestamp);
    if (!Number.isFinite(at) || at > now) return result;
    const values = byTime.get(at) ?? new Set<string>();
    values.add(version.value?.trim() ?? "");
    byTime.set(at, values);
  }
  const stages = [...byTime].sort(([a], [b]) => b - a);
  const stageAt = (index: number) => {
    const values = stages[index]?.[1];
    return values?.size === 1 ? [...values][0] || null : null;
  };
  if (stageAt(0) !== WARNING_STAGE) return result;
  let previous = 1;
  while (stageAt(previous) === WARNING_STAGE) previous++;

  const warningAt = stages[previous - 1]![0];
  if (hasEntry && warningAt !== entry) return result;
  const previousStageId = stageAt(previous);
  // Entered dates give the current stay; exact history supplies the adjacent stage and its own stay.
  const current = { enteredAt: new Date(warningAt).toISOString(), days: Math.floor((now - warningAt) / DAY) };
  if (!previousStageId) return { ...result, ...current };
  let start = previous;
  while (stageAt(start + 1) === previousStageId) start++;
  const precedingStage = stageAt(start + 1);
  return {
    ...result,
    ...current,
    previousStageId,
    previousDays: precedingStage ? Math.floor((warningAt - stages[start]![0]) / DAY) : null,
  };
}

export const WARNING_CONTACT = {
  continuous: "Contacto sostenido",
  recent: "Contacto reciente",
  attempts: "Gestión reciente · sin respuesta registrada",
  logged: "Contacto en CRM · sin interacción verificada",
  stale: "Sin contacto hace 14 días o más",
  none: "Sin contacto ni gestión reciente registrados",
  unknown: "Cobertura insuficiente",
} as const;

export type WarningContact = keyof typeof WARNING_CONTACT;
export type WarningActivity = {
  lastContact: string | null;
  lastActivity: string | null;
  lastMeeting: string | null;
  lastReply: string | null;
  lastConnectedCall: string | null;
  nextActivity: string | null;
  nextStep: string | null;
  recentCounts: Record<ActivityChannel, number>;
  complete: boolean;
  contact: WarningContact;
};

export function warningActivity(id: string, properties: Record<string, string | null>,
  channels: ActivityReport["channels"], now: number): WarningActivity {
  const nativeDate = (name: string, future = false) => {
    const at = timestamp(properties[name]);
    return Number.isFinite(at) && (future ? at >= now : at <= now) ? at : null;
  };
  const format = (at: number | null) => at === null ? null : new Date(at).toISOString();
  const cutoff = now - 14 * DAY;
  const lastContact = nativeDate("notes_last_contacted");
  const lastActivity = nativeDate("notes_last_updated");
  const contactDays = new Set<string>();
  let latestReply: number | null = null;
  let latestMeeting: number | null = null;
  let latestConnectedCall: number | null = null;
  let recentOutreach = false;
  let complete = true;
  const recentCounts = { emails: 0, communications: 0, calls: 0, meetings: 0 };
  for (const channel of activityChannels) {
    const data = channels[channel];
    if (data.unavailable.includes(id) || data.undated.includes(id)) complete = false;
    for (const event of data.events[id] ?? []) {
      if (!event.counted || event.at > now) continue;
      const reply = (channel === "emails" && event.status === "Entrante")
        || (channel === "communications" && event.status === "Recibido");
      const meeting = channel === "meetings" && event.status === "Realizada";
      const connected = channel === "calls" && /^Conectada(?: ·|$)/.test(event.status);
      if (connected) latestConnectedCall = Math.max(latestConnectedCall ?? 0, event.at);
      if (reply) latestReply = Math.max(latestReply ?? 0, event.at);
      if (meeting) latestMeeting = Math.max(latestMeeting ?? 0, event.at);
      if (event.at <= cutoff) continue;
      recentCounts[channel]++;
      if (reply || meeting || connected) {
        contactDays.add(localDate.format(event.at));
      } else if (event.status === "Enviado" || (channel === "calls" && event.status.endsWith("Saliente"))) {
        recentOutreach = true;
      }
    }
  }

  const lastInteraction = Math.max(latestReply ?? 0, latestMeeting ?? 0, latestConnectedCall ?? 0);
  const contact: WarningContact = contactDays.size >= 2 ? "continuous"
    : contactDays.size ? "recent"
    : !complete ? "unknown"
    : recentOutreach ? "attempts"
    : lastContact !== null && lastContact > cutoff ? "logged"
    : lastInteraction || lastContact !== null ? "stale"
    : "none";
  return {
    lastContact: format(lastContact), lastActivity: format(lastActivity),
    lastMeeting: format(latestMeeting), lastReply: format(latestReply), lastConnectedCall: format(latestConnectedCall),
    nextActivity: format(nativeDate("notes_next_activity_date", true)),
    nextStep: properties["hs_next_step"]?.trim() || null,
    recentCounts, complete, contact,
  };
}

export const WARNING_HEALTH = {
  critical: "Crítica",
  priority: "Prioritaria",
  watch: "En observación",
  unknown: "Sin evaluar",
} as const;

export function warningHealth(detail?: WarningDetail): keyof typeof WARNING_HEALTH {
  if (!detail) return "unknown";
  const operationalAlert = detail.fields.alerta_finanazas_negocio?.some(value => value !== "Deal en warning")
    || detail.fields.alerta_sspp?.length;
  const contact = detail.activity?.contact;
  if (detail.days !== null && detail.days >= 30 && (contact === "stale" || contact === "attempts" || contact === "none")) {
    return "critical";
  }
  if (operationalAlert || (detail.days !== null && detail.days >= 7)) return "priority";
  return detail.days === null ? "unknown" : "watch";
}
