import type { LossHistoryVersion } from "./loss-prior-score";

export const WARNING_STAGE = "1278792585";
const DAY = 86_400_000;
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
};

const timestamp = (value?: string | null) => value && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;

export function warningTimeline(
  properties: Record<string, string | null>,
  history: LossHistoryVersion[],
  now: number,
): Omit<WarningDetail, "fields"> & { previousStageId: string | null } {
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
  if (detail.days !== null && detail.days >= 30) return "critical";
  if (operationalAlert || (detail.days !== null && detail.days >= 7)) return "priority";
  return detail.days === null ? "unknown" : "watch";
}
