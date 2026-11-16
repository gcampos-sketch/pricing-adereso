import { expect, test } from "bun:test";
import {
  coachingCandidateFromMemory,
  reconcileCoachingEvents,
  type CoachingCandidate,
} from "../src/lib/coaching-evidence";
import type { MeetingReport } from "../src/lib/meeting-metrics";
const id = "749c5eea-c1c8-11f1-9bdb-06fffbd49021";
const owners = [{ id: "old-owner", name: "Comercial en la reunión", email: "sales@example.com" }];
const labels = new Map([
  ["levantamiento_dolores", "Dolor"],
  ["no_aplica", "No aplica"],
]);
const candidate: CoachingCandidate = {
  eventKey: `coaching-improvement/${id}`,
  meetingId: id,
  dealId: "123",
  dealName: "Cuenta",
  ownerId: "old-owner",
  date: "2026-10-08",
  stage: "E1",
  categoryKey: "levantamiento_dolores",
  evidence: "Faltó cuantificar el dolor.",
  persisted: false,
};
const meetings: MeetingReport = {
  fetchedAt: "2026-11-12T12:00:00Z",
  source: "diio-hubspot",
  classificationAuthority: "diio",
  participationAuthority: "diio-recording",
  events: [
    {
      id,
      date: "2026-10-08",
      type: "C",
      classification: "Diio: Upsell · versión 5",
      dealIds: ["123"],
      participants: [{ ownerId: "old-owner", name: "Comercial" }],
    },
  ],
  candidateDeals: 1,
  scannedDeals: 1,
  unresolved: 0,
  conflicts: 0,
  complete: false,
};
const reconcile = (c: CoachingCandidate[], m: MeetingReport | null = meetings) =>
  reconcileCoachingEvents(c, m, owners, labels);
test("Diio supplies classification, independently of current deal state and legacy type", () => {
  const { rows } = reconcile([candidate]);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.meetingType).toBe("Tipo C");
  expect(rows[0]!.stage).toBe("E1");
  expect(rows[0]!.ownerId).toBe("old-owner");
  expect(rows[0]!.evidence).toBe(candidate.evidence);
  expect(rows[0]!.persisted).toBe(false);
});
test("deduplicates exact events while preserving recorded action state", () => {
  const { rows } = reconcile([
    candidate,
    { ...candidate, persisted: true, status: "abordado", actionNote: "Trabajado" },
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.status).toBe("abordado");
  expect(rows[0]!.persisted).toBe(true);
});
test("conflicting events and unverified associations remain pending", () => {
  expect(reconcile([candidate, { ...candidate, categoryKey: "no_aplica" }]).rows).toHaveLength(0);
  expect(reconcile([{ ...candidate, dealId: "456" }]).pending[0]!.reason).toContain("Asociación");
});
test("legacy keys, different dates and a deal owner who did not participate cannot establish meetings", () => {
  for (const row of [
    { ...candidate, eventKey: "coaching-improvement/123-2026-10-08", meetingId: "123-2026-10-08" },
    { ...candidate, date: "2026-10-09" },
    { ...candidate, ownerId: "new-owner" },
  ])
    expect(reconcile([row]).rows).toHaveLength(0);
});
test("missing evidence, category or Diio authority stays pending", () => {
  expect(reconcile([candidate], null).rows).toHaveLength(0);
  expect(
    reconcile([candidate], { ...meetings, classificationAuthority: undefined }).rows,
  ).toHaveLength(0);
  expect(reconcile([{ ...candidate, categoryKey: "inventada" }]).rows).toHaveLength(0);
  expect(reconcile([{ ...candidate, evidence: "" }]).rows).toHaveLength(0);
});
test("unmapped Diio playbook never inherits the Adobo type", () => {
  expect(
    reconcile([candidate], { ...meetings, events: [{ ...meetings.events[0]!, type: "unknown" }] })
      .rows[0]!.meetingType,
  ).toBe("Sin tipo verificado");
});
test("reads native Memory event, including decimal historical stage, without trusting its type", () => {
  const text = `- **External ID**: coaching-improvement/${id}\nAE: Name (sales@example.com)\nDiio ID: ${id}\nFecha: 2026-10-08\nTipo: tipo_a\nEtapa: 6.2 Proyecto en desarrollo\nDeal ID: 123\nDeal: Cuenta\nCategoría key: levantamiento_dolores\nEvidencia: Faltó cuantificar el dolor.`;
  const parsed = coachingCandidateFromMemory("doc", text, owners)!;
  expect(parsed.stage).toBe("E6.2");
  expect(reconcile([parsed]).rows[0]!.meetingType).toBe("Tipo C");
  expect(
    coachingCandidateFromMemory(
      "doc",
      text.replace(id, "00000000-0000-0000-0000-000000000000"),
      owners,
    ),
  ).toBeNull();
});
