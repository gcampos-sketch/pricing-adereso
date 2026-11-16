import type { MeetingReport } from "./meeting-metrics";
import type { CoachingRow } from "./coaching-types";

export const COACHING_EVIDENCE_VERSION = "coaching-evidence/v3";
export type CoachingCandidate = {
  eventKey: string;
  meetingId: string;
  dealId: string;
  dealName: string;
  ownerId: string;
  date: string | null;
  stage: string;
  categoryKey: string;
  evidence: string | null;
  sourceDocument?: string;
  persisted: boolean;
  status?: string;
  actionNote?: string | null;
  closedAt?: string | null;
};
export type CoachingOwner = { id: string; name: string; email?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (value: string | null) =>
  value && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value))
    ? value.slice(0, 10)
    : null;

/** Reads the observed Memory event contract. It never uses the legacy A/B/C label. */
export function coachingCandidateFromMemory(
  documentId: string,
  text: string,
  owners: CoachingOwner[],
): CoachingCandidate | null {
  const field = (name: string) => text.match(new RegExp(`^${name}: (.*)$`, "m"))?.[1]?.trim() ?? "";
  const meetingId = field("Diio ID").toLowerCase();
  const externalId = text.match(/External ID\*\*: (\S+)/)?.[1];
  const email = field("AE")
    .match(/\(([^()\s]+@[^()\s]+)\)$/)?.[1]
    ?.toLowerCase();
  const matches = owners.filter((owner) => owner.email?.toLowerCase() === email);
  const owner = matches.length === 1 ? matches[0] : null;
  const stageNumber = field("Etapa").match(/^(5\.1|6\.[12]|[0124568])(?:\.|\s|$)/)?.[1];
  if (
    !UUID.test(meetingId) ||
    externalId !== `coaching-improvement/${meetingId}` ||
    !owner ||
    !/^\d+$/.test(field("Deal ID"))
  )
    return null;
  return {
    eventKey: externalId,
    meetingId,
    dealId: field("Deal ID"),
    dealName: field("Deal"),
    ownerId: owner.id,
    date: field("Fecha") || null,
    stage: stageNumber ? `E${stageNumber}` : "",
    categoryKey: field("Categoría key"),
    evidence: field("Evidencia") || null,
    sourceDocument: documentId,
    persisted: false,
  };
}

/** One coaching event per exact Diio ID; failed associations remain pending, never inferred. */
export function reconcileCoachingEvents(
  candidates: CoachingCandidate[],
  meetings: MeetingReport | null,
  owners: CoachingOwner[],
  labels: Map<string, string>,
) {
  const rows: CoachingRow[] = [],
    pending: { eventKey: string; reason: string }[] = [];
  const meetingMap = new Map(meetings?.events.map((event) => [event.id, event]) ?? []);
  const grouped = new Map<string, CoachingCandidate[]>();
  for (const candidate of candidates)
    grouped.set(candidate.eventKey, [...(grouped.get(candidate.eventKey) ?? []), candidate]);
  for (const [key, copies] of grouped) {
    const candidate = copies[0]!;
    const fingerprints = new Set(
      copies.map((row) =>
        JSON.stringify([
          row.meetingId,
          row.dealId,
          row.ownerId,
          day(row.date),
          row.stage,
          row.categoryKey,
          row.evidence,
        ]),
      ),
    );
    const event = meetingMap.get(candidate.meetingId);
    let reason = "";
    if (!UUID.test(candidate.meetingId) || key !== `coaching-improvement/${candidate.meetingId}`)
      reason = "Sin identificador de reunión verificable";
    else if (fingerprints.size !== 1) reason = "Versiones de coaching en conflicto";
    else if (
      !event ||
      meetings?.source !== "diio-hubspot" ||
      meetings.classificationAuthority !== "diio"
    )
      reason = "Reunión pendiente de cruce con Diio";
    else if (!day(candidate.date) || day(candidate.date) !== day(event.date))
      reason = "Fecha de reunión ausente o distinta";
    else if (!event.dealIds.includes(candidate.dealId))
      reason = "Asociación de deal no corroborada";
    else if (
      meetings.participationAuthority !== "diio-recording" ||
      !event.participants?.some((person) => person.ownerId === candidate.ownerId)
    )
      reason = "Comercial no corroborado en la reunión";
    else if (!labels.has(candidate.categoryKey)) reason = "Categoría fuera del esquema actual";
    else if (candidate.categoryKey !== "no_aplica" && !candidate.evidence?.trim())
      reason = "Sin evidencia de la mejora";
    if (reason || !event) {
      pending.push({ eventKey: key, reason });
      continue;
    }
    const stored = copies.find((copy) => copy.persisted);
    rows.push({
      eventKey: key,
      dealId: candidate.dealId,
      dealName: candidate.dealName,
      ownerId: candidate.ownerId,
      ownerName: owners.find((owner) => owner.id === candidate.ownerId)?.name ?? "Sin comercial",
      date: `${day(event.date)}T12:00:00Z`,
      stage: candidate.stage,
      meetingType: event.type === "unknown" ? "Sin tipo verificado" : `Tipo ${event.type}`,
      categoryKey: candidate.categoryKey,
      categoryLabel: labels.get(candidate.categoryKey)!,
      evidence: candidate.evidence,
      status: stored?.status === "abordado" ? "abordado" : "pendiente",
      actionNote: stored?.actionNote ?? null,
      closedAt: stored?.closedAt ?? null,
      meetingId: event.id,
      ...(event.diioUrl ? { meetingUrl: event.diioUrl } : {}),
      ...(event.classification ? { classification: event.classification } : {}),
      persisted: Boolean(stored),
      ...(candidate.sourceDocument ? { sourceDocument: candidate.sourceDocument } : {}),
    });
  }
  return { rows: rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")), pending };
}
