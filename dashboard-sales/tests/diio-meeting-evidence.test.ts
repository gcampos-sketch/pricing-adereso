import { expect, test } from "bun:test";
import {
  diioIdsFromNote,
  diioMeetingDate,
  typeFromVerifiedPlaybook,
  classificationFromDiio,
} from "../src/lib/diio-meeting-evidence";
const id = "343f605a-0bde-11f0-a454-06254876e271";
test("Rosa's verified Diio upsell is C even when the legacy record says A", () => {
  const analysis = {
    status: "finished",
    legacyAdoboType: "A",
    playbook: { id: "0196baf0-11c7-11f1-8fd1-06254876e271", name: "Upsell", version: 5 },
  };
  expect(classificationFromDiio(analysis)).toEqual({
    type: "C",
    classification: "Diio: Upsell · versión 5",
  });
  expect(classificationFromDiio({ legacyAdoboType: "A" }).type).toBe("unknown");
  expect(classificationFromDiio({ ...analysis, status: "pending" }).type).toBe("unknown");
});
test("only exact tenant meeting links prove a note association", () => {
  const link = `<a href="https://adereso.diio.com/meetings/${id}">Diio</a>`;
  expect(diioIdsFromNote(link + link, "https://adereso.diio.com")).toEqual([id]);
  expect(
    diioIdsFromNote(
      `${id} <a href="https://adereso.diio.com.evil.test/meetings/${id}">fake</a><a href="https://other.diio.com/meetings/${id}">other</a>`,
      "https://adereso.diio.com",
    ),
  ).toEqual([]);
});
test("classification requires verified identity, name and the exact historical playbook version", () => {
  const p = { id: "43f5710a-c0ca-11f0-8233-06254876e271", name: "Discovery", version: 7 };
  expect(typeFromVerifiedPlaybook(p)).toBe("A");
  expect(typeFromVerifiedPlaybook({ ...p, version: 6 })).toBe("unknown");
  expect(typeFromVerifiedPlaybook({ ...p, id: "unverified" })).toBe("unknown");
  expect(typeFromVerifiedPlaybook({ ...p, name: "Internal" })).toBe("unknown");
  expect(typeFromVerifiedPlaybook({ name: "Tipo B" })).toBe("unknown");
});
test("meeting dates exclude future/ambiguous timezones and follow the Chilean business calendar", () => {
  const now = Date.parse("2026-11-11T20:00:00Z");
  expect(diioMeetingDate("2026-10-01T01:00:00Z", now)).toBe("2026-09-30");
  expect(diioMeetingDate("2026-11-12T01:00:00Z", now)).toBeNull();
  expect(diioMeetingDate("2026-11-10T01:00:00", now)).toBeNull();
});
