import { COMMERCIAL_PIPELINE, gateway, type RawDeal } from "./hubspot.server";
import type { LossHistoryVersion } from "./loss-prior-score";
import { STAGE_FULL_LABELS } from "./pulse.server";
import { WARNING_PROPERTIES, WARNING_STAGE, warningTimeline, type WarningDetail, type WarningProperty } from "./warning-deals";

type DealWithHistory = RawDeal & { propertiesWithHistory?: { dealstage?: LossHistoryVersion[] } };
type Options = { options?: { value: string; label: string }[] };
const warningOrigins: Record<string, string> = {
  "174677684": "E6 · Sin kick off",
  "1086544542": "E6.2 · Desarrollo",
};
const fields = Object.keys(WARNING_PROPERTIES) as WarningProperty[];

export async function readWarningDeals(ids: string[]): Promise<Record<string, WarningDetail | null>> {
  const [response, finance] = await Promise.all([
    gateway<{ results?: DealWithHistory[] }>("/crm/v3/objects/deals/batch/read", {
      method: "POST",
      body: JSON.stringify({
        inputs: ids.map(id => ({ id })),
        properties: ["pipeline", "dealstage", `hs_v2_date_entered_${WARNING_STAGE}`, ...fields],
        propertiesWithHistory: ["dealstage"],
      }),
    }),
    gateway<Options>("/crm/v3/properties/deals/alerta_finanazas_negocio").catch(() => null),
  ]);
  const allowedIds = new Set(ids);
  const labels = new Map(finance?.options?.map(option => [option.value, option.label]));
  const now = Date.now();
  return Object.fromEntries((response.results ?? []).filter(deal => allowedIds.has(deal.id)).map(deal => {
    const { properties } = deal;
    if (properties["pipeline"] !== COMMERCIAL_PIPELINE || properties["dealstage"] !== WARNING_STAGE) return [deal.id, null];
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
    return [deal.id, {
      ...timeline,
      previousStage: previousStageId ? warningOrigins[previousStageId] ?? STAGE_FULL_LABELS[previousStageId] ?? `Etapa ${previousStageId}` : null,
      fields: recorded,
    }];
  }));
}
