import { load } from "cheerio";
import { LOST_STAGES } from "./commercial-outcomes";
import { readDealActivityLinks } from "./deal-activity-associations.server";
import { COMMERCIAL_PIPELINE, gateway, type RawDeal } from "./hubspot.server";
import { completedMeeting, ghostingMeetingWindow, isGhostingLoss, type GhostingActivity } from "./loss-ghosting";
import { isRecordedWhatsApp } from "./whatsapp-count";

const GHOSTING_REASON_PROPERTY = "razones_de_cierre_perdidos_especifico";
type ActivityProperties = RawDeal["properties"];

async function readObjects(type: "deals" | "communications" | "meetings", ids: string[], properties: string[]) {
  const records = new Map<string, ActivityProperties>();
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    const response = await gateway<{ results: RawDeal[]; status?: string; numErrors?: number; errors?: unknown[] }>(
      `/crm/v3/objects/${type}/batch/read`, {
        method: "POST",
        body: JSON.stringify({ inputs: batch.map(id => ({ id })), properties }),
      },
    );
    if ((response.status && response.status !== "COMPLETE") || response.errors?.length || response.numErrors ||
        response.results?.length !== batch.length) throw new Error("Lectura incompleta de actividades");
    const found = new Map(response.results.map(row => [row.id, row.properties]));
    for (const id of batch) {
      const row = found.get(id);
      if (!row) throw new Error("Falta una actividad de HubSpot");
      records.set(id, row);
    }
  }
  return records;
}

function loggedWhatsApp(properties: ActivityProperties): boolean | null {
  return isRecordedWhatsApp(properties["hs_communication_channel_type"], () => {
    const body = (properties["hs_communication_body"] ?? "").replace(/<(?:br\b[^>]*|\/p|\/div|\/li)>/gi, "\n");
    return load(body, {}, false).text();
  });
}

async function readRegisteredCounts(dealIds: string[], type: "calls" | "emails") {
  const links = await readDealActivityLinks(dealIds, type);
  return new Map([...links].map(([id, ids]) => [id, ids.length]));
}

async function readWhatsAppCounts(dealIds: string[]) {
  const links = await readDealActivityLinks(dealIds, "communications");
  const records = await readObjects("communications", [...new Set([...links.values()].flat())],
    ["hs_communication_channel_type", "hs_communication_body"]);
  const outcomes = new Map([...records].map(([id, row]) => [id, loggedWhatsApp(row)]));
  return new Map([...links].map(([id, ids]) => {
    const included = ids.map(activityId => outcomes.get(activityId));
    return [id, included.some(value => value == null) ? null : included.filter(value => value === true).length];
  }));
}

async function readGhostingMeetings(eligible: string[], deals: Map<string, ActivityProperties>, now: number) {
  const windows = new Map(eligible.flatMap(id => {
    const deal = deals.get(id)!;
    const window = ghostingMeetingWindow(deal, deal["dealstage"]!, now);
    return window ? [[id, window] as const] : [];
  }));
  const links = await readDealActivityLinks([...windows.keys()], "meetings");
  const records = await readObjects("meetings", [...new Set([...links.values()].flat())],
    ["hs_meeting_outcome", "hs_meeting_start_time", "hs_timestamp"]);

  const result = new Map<string, NonNullable<GhostingActivity["meetings"]>>();
  for (const [id, window] of windows) {
    const completedIds: string[] = [];
    let unverified = 0;
    for (const meetingId of links.get(id)!) {
      const qualifies = completedMeeting(records.get(meetingId)!, window);
      if (qualifies === true) completedIds.push(meetingId);
      else if (qualifies === null) unverified++;
    }
    result.set(id, { completedIds, unverified });
  }
  return result;
}

export async function readLossGhostingActivity(ids: string[]): Promise<Record<string, GhostingActivity>> {
  const deals = await readObjects("deals", ids, ["pipeline", "dealstage", GHOSTING_REASON_PROPERTY, "createdate",
    ...[...LOST_STAGES].map(stage => `hs_v2_date_entered_${stage}`)]);
  const eligible = ids.filter(id => {
    const properties = deals.get(id)!;
    return properties["pipeline"] === COMMERCIAL_PIPELINE && LOST_STAGES.has(properties["dealstage"] ?? "") &&
      isGhostingLoss(properties[GHOSTING_REASON_PROPERTY]);
  });
  if (!eligible.length) return {};

  const now = Date.now();
  const [calls, whatsapp, emails, meetings] = await Promise.allSettled([
    readRegisteredCounts(eligible, "calls"),
    readWhatsAppCounts(eligible),
    readRegisteredCounts(eligible, "emails"),
    readGhostingMeetings(eligible, deals, now),
  ]);

  const count = <T,>(result: PromiseSettledResult<Map<string, T>>, id: string) =>
    result.status === "fulfilled" ? result.value.get(id) ?? null : null;
  return Object.fromEntries(eligible.map(id => [id, {
    calls: count(calls, id), emails: count(emails, id), whatsapp: count(whatsapp, id), meetings: count(meetings, id),
  }]));
}
