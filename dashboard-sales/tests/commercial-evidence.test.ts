import { test, expect } from "bun:test";
import { parseCommercialEvidence, scopeEvidenceMeetings } from "../src/lib/commercial-evidence";
const sourceAt = "2026-11-12T12:00:00Z";
const meeting = (id: string, ownerId: string) => ({
  id,
  date: "2026-11-11",
  type: "A",
  dealIds: ["1"],
  participants: [{ ownerId, name: "Comercial" }],
});
const edition = () => ({
  schema: "commercial-evidence/v1",
  sourceAt,
  meetings: {
    fetchedAt: sourceAt,
    events: [
      meeting("11111111-1111-4111-8111-111111111111", "82596016"),
      meeting("22222222-2222-4222-8222-222222222222", "91603512"),
    ],
    complete: false,
    source: "diio-hubspot",
    classificationAuthority: "diio",
    participationAuthority: "diio-recording",
    candidateDeals: 1,
    scannedDeals: 1,
    unresolved: 0,
    conflicts: 0,
    validation: {
      listed: 2,
      linked: 2,
      pending: 0,
      classified: 2,
      nativeCompleted: 2,
      nativeMatched: 2,
    },
  },
  coaching: { fetchedAt: sourceAt, candidates: [], rejectedDocuments: 0 },
});
test("private edition rejects false completeness, fabricated dates and duplicate meeting IDs", () => {
  expect(() =>
    parseCommercialEvidence({ ...edition(), meetings: { ...edition().meetings, complete: true } }),
  ).toThrow();
  expect(() =>
    parseCommercialEvidence({ ...edition(), sourceAt: "2026-11-15T12:00:00Z" }),
  ).toThrow();
  expect(() =>
    parseCommercialEvidence({
      ...edition(),
      meetings: {
        ...edition().meetings,
        events: [edition().meetings.events[0], edition().meetings.events[0]],
      },
    }),
  ).toThrow();
});
test("role scope uses recording participants and does not mutate another role or the source edition", () => {
  const original = parseCommercialEvidence(edition());
  const ae = scopeEvidenceMeetings(original, "AE"),
    kam = scopeEvidenceMeetings(original, "KAM");
  expect(ae.events.map((row) => row.participants?.[0]?.ownerId)).toEqual(["82596016"]);
  expect(kam.events.map((row) => row.participants?.[0]?.ownerId)).toEqual(["91603512"]);
  ae.events[0]!.dealIds.push("99");
  expect(original.meetings.events[0]!.dealIds).toEqual(["1"]);
  expect(scopeEvidenceMeetings(original, "all").events.length).toBe(2);
});
test("unknown source material cannot become public report content", () => {
  const input = edition() as any;
  input.rawMemoryDocuments = ["secret"];
  input.meetings.events[0].transcript = "private transcript";
  const safe = parseCommercialEvidence(input) as any;
  expect(safe.rawMemoryDocuments).toBeUndefined();
  expect(safe.meetings.events[0].transcript).toBeUndefined();
});
