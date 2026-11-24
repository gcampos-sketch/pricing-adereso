import { COMMERCIAL_PIPELINE, gateway, type RawDeal } from "./hubspot.server";
import { readConnectedCallDispositions } from "./contactability.server";
import { readDealActivityChannel } from "./deal-activity-analysis.server";
import type { LossHistoryVersion } from "./loss-prior-score";
import { STAGE_FULL_LABELS } from "./pulse.server";
import { PRE_KICKOFF_STAGE, WARNING_PROPERTIES, WARNING_STAGE, warningActivity, warningTimeline, type WarningDetail, type WarningProperty } from "./warning-deals";

type DealWithHistory = RawDeal & { propertiesWithHistory?: { dealstage?: LossHistoryVersion[] } };
type Options = { options?: { value: string; label: string }[] };
const warningOrigins: Record<string, string> = {
  [PRE_KICKOFF_STAGE]: "E6 · Sin kick off",
  "1086544542": "E6.2 · Desarrollo",
};
const fields = Object.keys(WARNING_PROPERTIES) as WarningProperty[];

export async function readWarningDeals(ids: string[]): Promise<Record<string, WarningDetail | null>> {
  const [response, finance] = await Promise.all([
    gateway<{ results?: DealWithHistory[] }>("/crm/v3/objects/deals/batch/read", {
      method: "POST",
      body: JSON.stringify({
        inputs: ids.map(id => ({ id })),
        properties: ["pipeline", "dealstage", `hs_v2_date_entered_${WARNING_STAGE}`,
          "notes_last_contacted", "notes_last_updated", "notes_next_activity_date", "hs_next_step", ...fields],
        propertiesWithHistory: ["dealstage"],
      }),
    }),
    gateway<Options>("/crm/v3/properties/deals/alerta_finanazas_negocio").catch(() => null),
  ]);
  const allowedIds = new Set(ids);
  const labels = new Map(finance?.options?.map(option => [option.value, option.label]));
  const now = Date.now();
  const requested = (response.results ?? []).filter(deal => allowedIds.has(deal.id));
  const eligible = requested.filter(({ properties }) =>
    properties["pipeline"] === COMMERCIAL_PIPELINE && properties["dealstage"] === WARNING_STAGE);
  const names = new Map<string, string>();
  const [emails, communications, calls, meetings] = await Promise.all([
    readDealActivityChannel("emails", eligible, names),
    readDealActivityChannel("communications", eligible, names),
    (async () => {
      const connected = eligible.length > 0 ? await readConnectedCallDispositions().catch(() => undefined) : undefined;
      const result = await readDealActivityChannel("calls", eligible, names, connected);
      if (!connected) result.unavailable = eligible.map(deal => deal.id);
      return result;
    })(),
    readDealActivityChannel("meetings", eligible, names),
  ]);
  const details: Record<string, WarningDetail | null> = Object.fromEntries(requested.map(deal => [deal.id, null]));
  for (const deal of eligible) {
    const { properties } = deal;
    const { previousStageId, ...timeline } = warningTimeline(properties, deal.propertiesWithHistory?.dealstage ?? [], now);
    const recorded: WarningDetail["fields"] = {};
    for (const field of fields) {
      const raw = properties[field]?.trim();
      if (!raw) continue;
      const values = field === "alerta_finanazas_negocio"
        ? raw.split(";").map(value => value.trim()).filter(Boolean).map(value => labels.get(value) || value)
        : [raw];
      if (values.length) recorded[field] = values;
    }
    details[deal.id] = {
      ...timeline,
      previousStage: previousStageId ? warningOrigins[previousStageId] ?? STAGE_FULL_LABELS[previousStageId] ?? `Etapa ${previousStageId}` : null,
      kickoffPending: previousStageId === PRE_KICKOFF_STAGE,
      activity: warningActivity(deal.id, properties, { emails, communications, calls, meetings }, now),
      fields: recorded,
    };
  }
  return details;
}
