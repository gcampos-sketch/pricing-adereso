import { load } from "cheerio";
import {
  gateway,
  getCached,
  getOwners,
  getPropertyOptionLabels,
  invalidateCache,
  readCompleteCommercialRecords,
  type Props,
  type RawDeal,
} from "./hubspot.server";
import { MANAGED_STAGES, NICKNAMES, toDTO } from "./pulse.server";
import { LOST_STAGES, WON_STAGES } from "./commercial-outcomes";
import { readDealActivityLinks } from "./deal-activity-associations.server";
import { callOutcome, whatsappOutcome } from "./contactability";
import {
  type ActivityChannel,
  type ActivityDeal,
  type ActivityReport,
  type DealActivity,
} from "./deal-activity-analysis";
import { flowQuarter } from "./stage-date-scope";

const CACHE = "deal-activity-analysis/v1/";
const SIGNED = "174677684";
const OPEN_STAGES = ["1144383754", ...MANAGED_STAGES.map((stage) => stage.id)];
const entry = (stage: string) => `hs_v2_date_entered_${stage}`;
const DEAL_PROPERTIES = [
  "pipeline",
  "dealname",
  "dealstage",
  "createdate",
  "hubspot_owner_id",
  "industria_deal",
  "razones_de_cierre_perdidos_especifico",
  "dealtype",
  "negocio_inbound",
  "fuente_de_creacion",
  ...[...OPEN_STAGES, ...LOST_STAGES, SIGNED, ...WON_STAGES].map(entry),
];
const activityProperties = {
  emails: ["hs_email_direction", "hs_email_status"],
  communications: ["hs_communication_channel_type", "hs_communication_body"],
  calls: ["hs_call_status", "hs_call_direction"],
  meetings: ["hs_meeting_outcome"],
};

function activityStatus(
  channel: ActivityChannel,
  p: Props,
): { status: string; counted: boolean } | null {
  if (channel === "communications") {
    if (!["WHATS_APP", "WHATSAPP"].includes(p["hs_communication_channel_type"] ?? "")) return null;
    const text = load(
      (p["hs_communication_body"] ?? "").replace(/<(?:br\b[^>]*|\/p|\/div|\/li)>/gi, "\n"),
      {},
      false,
    ).text();
    const status = whatsappOutcome(text);
    return { status, counted: status === "Enviado" || status === "Recibido" };
  }
  if (channel === "emails") {
    const received =
      p["hs_email_direction"] === "INCOMING_EMAIL" || p["hs_email_direction"] === "FORWARDED_EMAIL";
    const sent = p["hs_email_direction"] === "EMAIL" && p["hs_email_status"] === "SENT";
    return {
      status: received ? "Entrante" : sent ? "Enviado" : "Envío sin confirmar",
      counted: received || sent,
    };
  }
  if (channel === "calls") {
    const result = callOutcome(p["hs_call_status"], false);
    const direction =
      p["hs_call_direction"] === "OUTBOUND"
        ? " · Saliente"
        : p["hs_call_direction"] === "INBOUND"
          ? " · Entrante"
          : "";
    return { status: (result ?? "Resultado sin confirmar") + direction, counted: !!result };
  }
  const status = p["hs_meeting_outcome"];
  const labels: Record<string, string> = {
    COMPLETED: "Realizada",
    SCHEDULED: "Agendada",
    CANCELED: "Cancelada",
    RESCHEDULED: "Reagendada",
    NO_SHOW: "No asistió",
  };
  return {
    status: labels[status ?? ""] ?? "Realización sin confirmar",
    counted: status === "COMPLETED",
  };
}

async function readChannel(
  channel: ActivityChannel,
  deals: ActivityDeal[],
  names: Map<string, string>,
) {
  const data: ActivityReport["channels"][ActivityChannel] = {
    events: {},
    unavailable: [],
    undated: [],
  };
  const known = new Map<string, DealActivity | "undated" | null>();
  for (let offset = 0; offset < deals.length; offset += 75) {
    const cohort = deals.slice(offset, offset + 75).map((deal) => deal.id);
    try {
      const links = await readDealActivityLinks(cohort, channel);
      const ids = [...new Set([...links.values()].flat())].filter((id) => !known.has(id));
      for (let index = 0; index < ids.length; index += 100) {
        const inputs = ids.slice(index, index + 100);
        try {
          const response = await gateway<{
            results: RawDeal[];
            status?: string;
            numErrors?: number;
          }>(`/crm/v3/objects/${channel}/batch/read`, {
            method: "POST",
            body: JSON.stringify({
              inputs: inputs.map((id) => ({ id })),
              properties: ["hs_timestamp", "hubspot_owner_id", ...activityProperties[channel]],
            }),
          });
          if (response.status && response.status !== "COMPLETE") continue;
          const seen = new Set<string>();
          for (const { id, properties } of response.results) {
            if (!inputs.includes(id) || seen.has(id))
              throw Error("Registro de actividad inesperado");
            seen.add(id);
            const status = activityStatus(channel, properties);
            const at = Date.parse(properties["hs_timestamp"] ?? "");
            const actorId = properties["hubspot_owner_id"] ?? "";
            known.set(
              id,
              !status
                ? null
                : !Number.isFinite(at)
                  ? status.counted
                    ? "undated"
                    : null
                  : {
                      id,
                      at,
                      actorId,
                      actor: actorId
                        ? (names.get(actorId) ?? `Usuario ${actorId}`)
                        : "Sin responsable",
                      ...status,
                    },
            );
          }
        } catch {
          for (const id of inputs) known.delete(id);
          // Deals sharing the missing records are flagged below. Other batches still count.
        }
      }
      for (const id of cohort) {
        const activities = (links.get(id) ?? []).map((activityId) => known.get(activityId));
        if (!links.has(id) || activities.includes(undefined)) data.unavailable.push(id);
        if (activities.includes("undated")) data.undated.push(id);
        const events = activities.filter(
          (value): value is DealActivity => !!value && value !== "undated",
        );
        if (events.length) data.events[id] = events;
      }
    } catch {
      data.unavailable.push(...cohort);
    }
  }
  return data;
}

export async function readDealActivityAnalysis(
  year: string,
  quarter: string,
  fresh = false,
): Promise<ActivityReport> {
  const key = CACHE + year + "/" + quarter;
  if (fresh) {
    invalidateCache(key);
    invalidateCache(CACHE + "deals");
  }
  return getCached(key, 90_000, async () => {
    const [records, owners, industries, reasons] = await Promise.all([
      getCached(CACHE + "deals", 90_000, () =>
        readCompleteCommercialRecords([...new Set(DEAL_PROPERTIES)]),
      ),
      getOwners(),
      getPropertyOptionLabels("industria_deal"),
      getPropertyOptionLabels("razones_de_cierre_perdidos_especifico"),
    ]);
    const readAt = Date.now();
    const names = new Map(
      owners.map((owner) => [
        owner.id,
        NICKNAMES[owner.id] ??
          ([owner.firstName, owner.lastName].filter(Boolean).join(" ") || `Usuario ${owner.id}`),
      ]),
    );
    const deals: ActivityDeal[] = [];
    const undated: ActivityReport["undated"] = [];
    for (const record of records) {
      const p = record.properties;
      const stageId = p["dealstage"] ?? "";
      const outcome = OPEN_STAGES.includes(stageId)
        ? "active"
        : WON_STAGES.has(stageId)
          ? "won"
          : LOST_STAGES.has(stageId)
            ? "lost"
            : null;
      if (!outcome) continue;
      const dto = toDTO(record, names, readAt, readAt);
      const createdAt = Date.parse(p["createdate"] ?? "");
      const created = Number.isFinite(createdAt) && createdAt <= readAt ? createdAt : null;
      const cutoff =
        outcome === "active"
          ? readAt
          : Date.parse(p[entry(outcome === "won" ? SIGNED : stageId)] ?? "");
      if (!Number.isFinite(cutoff) || cutoff > readAt || (created !== null && cutoff < created)) {
        undated.push({ ownerId: dto.ownerId, segment: dto.segment, outcome });
        continue;
      }
      if (outcome !== "active") {
        const period = flowQuarter(new Date(cutoff).toISOString());
        if (
          !period.startsWith(year + "-Q") ||
          (quarter !== "all" && period !== year + "-Q" + quarter)
        )
          continue;
      }
      const latestStage = [...OPEN_STAGES, ...WON_STAGES]
        .map((stage) => ({ stage, at: Date.parse(p[entry(stage)] ?? "") }))
        .filter((row) => row.at < cutoff && (created === null || row.at >= created))
        .sort((a, b) => b.at - a.at);
      const prior = latestStage[0];
      const previousLabel =
        prior && prior.at !== latestStage[1]?.at
          ? toDTO(
              { ...record, properties: { ...p, dealstage: prior.stage } },
              names,
              readAt,
              readAt,
            ).stageFull
          : null;
      const stageFrom = Date.parse(p[entry(stageId)] ?? "");
      const label = (
        options: Map<string, string>,
        raw: string | null | undefined,
        missing: string,
      ) => (raw?.trim() ? (options.get(raw.trim()) ?? raw.trim()) : missing);
      deals.push({
        id: record.id,
        name: dto.name,
        url: dto.url,
        ownerId: dto.ownerId,
        owner: dto.owner,
        segment: dto.segment,
        stage:
          outcome === "active" ? dto.stageFull : (previousLabel ?? "Sin etapa previa registrada"),
        industry: label(industries, p["industria_deal"], "Sin industria"),
        lossReason:
          outcome === "lost"
            ? label(reasons, p["razones_de_cierre_perdidos_especifico"], "Sin motivo registrado")
            : "",
        outcome,
        created,
        cutoff,
        stageFrom:
          outcome === "active" && created !== null && stageFrom >= created && stageFrom <= cutoff
            ? stageFrom
            : null,
        lossType: outcome === "lost" ? dto.stageFull : "",
      });
    }
    const [emails, communications, calls, meetings] = await Promise.all([
      readChannel("emails", deals, names),
      readChannel("communications", deals, names),
      readChannel("calls", deals, names),
      readChannel("meetings", deals, names),
    ]);
    return { readAt, deals, undated, channels: { emails, communications, calls, meetings } };
  });
}
