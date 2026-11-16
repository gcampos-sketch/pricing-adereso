/** Whitelisted private edition: no transcripts, raw Memory documents or unassociated calendars. */
import { z } from "zod";
import type { CoachingCandidate } from "./coaching-evidence";
import type { MeetingReport } from "./meeting-metrics";
import { roleOwnerIds, type RoleFilter } from "./owner-roles";
export const EVIDENCE_PREFIX = "commercial-evidence/v1/";
const stamp = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Fecha inválida");
const id = z.string().regex(/^\d+$/);
const count = z.number().int().nonnegative();
const company = z.object({
  id,
  name: z.string(),
  url: z.string().url(),
  holdingId: z.string().optional(),
  holdingName: z.string().optional(),
  ownerId: z.string().optional(),
});
const event = z.object({
  id: z.string(),
  date: stamp,
  type: z.enum(["A", "B", "C", "unknown"]),
  dealIds: z.array(id),
  name: z.string().optional(),
  startedAt: stamp.optional(),
  diioUrl: z.string().url().optional(),
  classification: z.string().optional(),
  companies: z.array(company).optional(),
  companyAttributionComplete: z.boolean().optional(),
  participants: z.array(z.object({ ownerId: id, name: z.string() })).optional(),
});
const observation = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  start: stamp,
  end: stamp,
  url: z.string(),
  calendarId: z.string(),
  organizer: z.string().nullable().optional(),
});
const registry = event
  .extend({
    hubspotUrl: z.string().url(),
    startedAt: stamp,
    outcome: z.string(),
    activityOwnerId: z.string(),
    activityOwnerName: z.string(),
    calendarReference: z.object({ calendarId: z.string(), url: z.string() }).optional(),
    diioIds: z.array(z.string()),
    diioState: z.enum(["verified", "different_date", "ambiguous", "not_verified"]),
    calendarState: z.enum([
      "verified",
      "guest_copy",
      "different_date",
      "cancelled",
      "missing_id",
      "not_found",
      "outside_coverage",
      "calendar_not_covered",
      "ambiguous",
    ]),
    calendars: z.array(observation),
  })
  .refine((row) => row.dealIds.length > 0, "Actividad sin deal comercial");
const meetings = z.object({
  fetchedAt: stamp,
  events: z.array(event.extend({ id: z.string().uuid() })),
  candidateDeals: count,
  scannedDeals: count,
  unresolved: count,
  conflicts: count,
  complete: z.literal(false),
  source: z.literal("diio-hubspot"),
  classificationAuthority: z.literal("diio"),
  participationAuthority: z.literal("diio-recording"),
  accountIdentityAuthority: z.literal("hubspot-id-holding").optional(),
  portfolio: z
    .object({ checkedAt: stamp, complete: z.boolean(), companies: z.array(company) })
    .optional(),
  validation: z.object({
    listed: count,
    linked: count,
    pending: count,
    classified: count,
    nativeCompleted: count,
    nativeMatched: count,
  }),
  coverage: z
    .object({
      checkedAt: stamp,
      start: stamp,
      end: stamp,
      complete: z.boolean(),
      calendarStart: stamp,
      calendarEnd: stamp,
      calendarComplete: z.boolean(),
      calendarCount: count,
      globalRecords: count,
      withoutCommercialDeal: count,
      events: z.array(registry),
    })
    .optional(),
});
const candidate = z
  .object({
    eventKey: z.string(),
    meetingId: z.string().uuid(),
    dealId: id,
    dealName: z.string(),
    ownerId: id,
    date: stamp.nullable(),
    stage: z.string(),
    categoryKey: z.string(),
    evidence: z.string().nullable(),
    sourceDocument: z.string().optional(),
    persisted: z.literal(false),
  })
  .refine(
    (row) => row.eventKey === `coaching-improvement/${row.meetingId}`,
    "Identidad de coaching inválida",
  );
export const commercialEvidenceSchema = z
  .object({
    schema: z.literal("commercial-evidence/v1"),
    sourceAt: stamp,
    meetings,
    coaching: z.object({
      fetchedAt: stamp,
      candidates: z.array(candidate),
      rejectedDocuments: count,
    }),
  })
  .superRefine((edition, ctx) => {
    if (
      Date.parse(edition.sourceAt) !==
      Math.max(Date.parse(edition.meetings.fetchedAt), Date.parse(edition.coaching.fetchedAt))
    )
      ctx.addIssue({
        code: "custom",
        message: "La fecha de edición debe corresponder a sus fuentes",
      });
    if (
      new Set(edition.meetings.events.map((row) => row.id)).size !== edition.meetings.events.length
    )
      ctx.addIssue({ code: "custom", message: "Reuniones duplicadas" });
  });
export type CommercialEvidence = {
  schema: "commercial-evidence/v1";
  sourceAt: string;
  meetings: MeetingReport;
  coaching: { fetchedAt: string; candidates: CoachingCandidate[]; rejectedDocuments: number };
};
/** JSON schemas strip unknown keys; the explicit type preserves exact optional-property semantics. */
export const parseCommercialEvidence = (value: unknown): CommercialEvidence =>
  commercialEvidenceSchema.parse(value) as CommercialEvidence;
/** The shared edition is immutable. Role filtering never mutates it or uses deal ownership for attendance. */
export function scopeEvidenceMeetings(input: CommercialEvidence, role: RoleFilter): MeetingReport {
  const report = structuredClone(input.meetings) as MeetingReport;
  const allowed = roleOwnerIds(role);
  if (!allowed) return report;
  report.events = report.events.flatMap((row) => {
    const participants = row.participants?.filter((person) => allowed.has(person.ownerId)) ?? [];
    return participants.length ? [{ ...row, participants }] : [];
  });
  if (report.portfolio)
    report.portfolio.companies = report.portfolio.companies.filter((company) =>
      allowed.has(company.ownerId ?? ""),
    );
  if (report.coverage)
    report.coverage.events = report.coverage.events.filter((row) =>
      allowed.has(row.activityOwnerId),
    );
  return report;
}
