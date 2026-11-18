/** Coaching reads are read-only. Deal snapshots never manufacture or overwrite meeting history. */
import {
  COMMERCIAL_PIPELINE,
  getOwners,
  getPropertyOptionLabels,
  invalidateCache,
  gateway, getCached, TTL_DEALS, type RawDeal,
} from "./hubspot.server";
import { ADOBO_INTELLIGENCE_PROPS } from "./adobo-intelligence";
import { activeQualityDeal, completeQualityInventory } from "./adobo-quality";
import { STAGE_KEY, WON_STAGES, LOST_STAGES, toDTO } from "./pulse.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CoachingReport, CoachingSnapshot, CoachingStatus } from "./coaching-types";
import type { MeetingReport } from "./meeting-metrics";
import { roleOfOwner } from "./owner-roles";
import {
  COACHING_EVIDENCE_VERSION,
  coachingCandidateFromMemory,
  reconcileCoachingEvents,
  type CoachingCandidate,
} from "./coaching-evidence";

const PROPS = [
  ...ADOBO_INTELLIGENCE_PROPS,
  "pipeline", "hs_is_closed", "amount", "closedate", "hs_next_step", "dealtype", "fuente_de_creacion",
  "dealname",
  "dealstage",
  "hubspot_owner_id",
  "adobo_oportunidad_de_mejora",
  "adobo_oportunidad_de_mejora_evidencia",
  "adobo_last_reu_date",
  "adobo_last_reu_tipo",
  "adobo_last_diio_meeting_id",
  "adobo_last_reu_quality",
  "adobo_reus_analizadas_count",
];
const iso = (raw: string | null | undefined) =>
  raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
const UUID_KEY =
  /^coaching-improvement\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
async function privateEdition(name: string): Promise<unknown | null> {
  if (!import.meta.env.DEV) return null;
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  try {
    return JSON.parse(await readFile(resolve(process.cwd(), ".migration-backups", name), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function buildCoachingReport(fresh = false): Promise<CoachingReport> {
  if (fresh) invalidateCache("deals:coaching");
  const [deals, rawOwners, labels] = await Promise.all([
    getCached("deals:coaching-adobo-v1", TTL_DEALS, () => completeQualityInventory<RawDeal>(after =>
      gateway("/crm/v3/objects/deals/search", {method:"POST", body:JSON.stringify({
        filterGroups:[{filters:[{propertyName:"pipeline",operator:"EQ",value:COMMERCIAL_PIPELINE}]}],
        properties:[...new Set(PROPS)], sorts:["hs_object_id"], limit:200, ...(after ? {after}:{}),
      })}))),
    getOwners(),
    getPropertyOptionLabels("adobo_oportunidad_de_mejora"),
  ]);
  const owners = rawOwners.map((owner) => ({
    id: owner.id,
    email: owner.email ?? "",
    name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email || owner.id,
  }));
  const names = new Map(owners.map((owner) => [owner.id, owner.name]));
  const adoboDeals = deals.filter(deal => activeQualityDeal(deal.properties, WON_STAGES, LOST_STAGES))
    .map(deal => toDTO(deal, names, Date.now(), Date.now()));
  const snapshots: CoachingSnapshot[] = deals
    .filter((deal) => deal.properties["adobo_oportunidad_de_mejora"])
    .map((deal) => {
      const p = deal.properties,
        count = Number(p["adobo_reus_analizadas_count"]);
      return {
        dealId: deal.id,
        dealName: p["dealname"] || "Sin nombre",
        ownerId: p["hubspot_owner_id"] || "",
        ownerName: names.get(p["hubspot_owner_id"] || "") || "Sin comercial",
        stage: STAGE_KEY.get(p["dealstage"] || "") || "",
        date: iso(p["adobo_last_reu_date"]),
        meetingId: p["adobo_last_diio_meeting_id"] || null,
        rawMeetingType: p["adobo_last_reu_tipo"] || "Sin tipo registrado",
        categoryKey: p["adobo_oportunidad_de_mejora"]!,
        categoryLabel:
          labels.get(p["adobo_oportunidad_de_mejora"]!) || p["adobo_oportunidad_de_mejora"]!,
        evidence: p["adobo_oportunidad_de_mejora_evidencia"] || null,
        informationQuality: p["adobo_last_reu_quality"] || null,
        recordedMeetingCount:
          p["adobo_reus_analizadas_count"] && Number.isInteger(count) && count >= 0 ? count : null,
      };
    });
  const candidates: CoachingCandidate[] = [];
  let legacyRows = 0;
  // Complete stable pagination. A failed read must not become a claim of no history.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("coaching_events")
      .select(
        "event_key,deal_id,deal_name,owner_id,stage,meeting_date,categoria_key,categoria_label,evidencia,status,action_note,closed_at",
      )
      .order("event_key")
      .range(offset, offset + 999);
    if (error) throw Error(`No se pudo leer el histórico de coaching (${error.code}).`);
    for (const row of data ?? []) {
      const meetingId = UUID_KEY.exec(row.event_key)?.[1];
      if (!meetingId) {
        legacyRows++;
        continue;
      }
      candidates.push({
        eventKey: row.event_key,
        meetingId,
        dealId: row.deal_id,
        dealName: row.deal_name || "Sin nombre",
        ownerId: row.owner_id || "",
        stage: row.stage || "",
        date: row.meeting_date,
        categoryKey: row.categoria_key,
        evidence: row.evidencia,
        persisted: true,
        status: row.status,
        actionNote: row.action_note,
        closedAt: row.closed_at,
      });
    }
    if (!data || data.length < 1000) break;
  }
  const published = !import.meta.env.DEV
    ? await (await import('./commercial-evidence.server')).readCommercialEvidence()
    : null;
  if (published) candidates.push(...published.coaching.candidates);
  let meetings: MeetingReport | null = published?.meetings ?? null,
    rejectedDocuments = published?.coaching.rejectedDocuments ?? 0;
  const edition = (await privateEdition("coaching-memory-events.json")) as {
    source?: string;
    fetchedAt?: string;
    documents?: { documentId: string; text: string }[];
  } | null;
  if (edition) {
    if (
      edition.source !== "adereso-memory" ||
      !Array.isArray(edition.documents) ||
      !iso(edition.fetchedAt)
    )
      throw Error("Edición de coaching inválida.");
    for (const document of edition.documents) {
      const candidate = coachingCandidateFromMemory(document.documentId, document.text, owners);
      if (candidate) candidates.push(candidate);
      else rejectedDocuments++;
    }
  }
  const localMeetings = (await privateEdition("diio-meetings.json")) as MeetingReport | null;
  if (localMeetings) {
    if (!Array.isArray(localMeetings.events) || !iso(localMeetings.fetchedAt))
      throw Error("Edición de reuniones inválida.");
    meetings = localMeetings;
  } else if (!meetings && candidates.length) {
    // Existing canonical events can only become history after an authoritative meeting cross-check.
    const { readMeetingMetrics } = await import("./meeting-metrics.server");
    meetings = await readMeetingMetrics("all");
  }
  const { rows, pending } = reconcileCoachingEvents(candidates, meetings, owners, labels);
  const pendingReasons = new Map<string, number>();
  for (const item of pending)
    pendingReasons.set(item.reason, (pendingReasons.get(item.reason) ?? 0) + 1);
  if (rejectedDocuments)
    pendingReasons.set("Documento sin identidad comercial inequívoca", rejectedDocuments);
  const dates = rows.map((row) => row.date!).sort();
  const years = [
    ...new Set(
      [...rows.map((row) => row.date), ...snapshots.map((row) => row.date)]
        .filter((date): date is string => Boolean(date))
        .map((date) => date.slice(0, 4)),
    ),
  ]
    .sort()
    .reverse();
  return {
    generatedAt: new Date().toISOString(),
    evidenceVersion: COACHING_EVIDENCE_VERSION,
    adoboVersion: "adobo-quality/v1",
    adoboDeals,
    ...(published ? { evidenceSourceAt: published.sourceAt } : {}),
    years: years.length ? years : [String(new Date().getUTCFullYear())],
    owners: owners
      .filter(
        (owner) =>
          roleOfOwner(owner.id) !== null ||
          rows.some((row) => row.ownerId === owner.id) ||
          snapshots.some((row) => row.ownerId === owner.id) ||
          adoboDeals.some(row => row.ownerId === owner.id),
      )
      .map(({ id, name }) => ({ id, name })),
    categories: [...labels].map(([key, label]) => ({ key, label })),
    rows,
    snapshots,
    coverage: {
      partial: true,
      source: published
        ? `Memory + Diio · edición del ${published.coaching.fetchedAt.slice(0, 10)} · actualización manual`
        : edition ? "Memory + Diio · validación local" : "Histórico pendiente de conciliación",
      candidates: candidates.length + rejectedDocuments,
      verified: rows.length,
      pending: pending.length + rejectedDocuments,
      pendingReasons: [...pendingReasons].map(([reason, count]) => ({ reason, count })),
      legacyRows,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
      note: "Solo el coaching con reunión, fecha, deal y comercial corroborados alimenta las gráficas. La foto actual y los registros antiguos sin ID verificable se conservan aparte. El histórico disponible no acredita todas las reuniones ni continuidad posterior a su última fecha.",
    },
  };
}

/** Explicit action only; never creates events. Verify the requested persisted row was actually updated. */
export async function saveCoachingStatus(
  eventKey: string,
  status: CoachingStatus,
  note: string | null,
) {
  if (!UUID_KEY.test(eventKey))
    throw Error("Este registro no tiene una reunión verificada para guardar el estado.");
  const { data, error } = await supabaseAdmin
    .from("coaching_events")
    .update({
      status,
      action_note: note,
      closed_at: status === "abordado" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("event_key", eventKey)
    .select("event_key,status")
    .maybeSingle();
  if (error || !data || data.status !== status)
    throw Error("No se pudo verificar el guardado del accionable.");
  return { ok: true };
}
