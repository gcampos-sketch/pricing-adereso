import type { MeetingType } from "./meeting-metrics";

/** Exact provider links, never a UUID mentioned in arbitrary prose or a look-alike host. */
export function diioIdsFromNote(html: string, origin: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1]!.replace(/&amp;/g, "&"));
      const id = url.pathname.match(
        /^\/meetings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i,
      )?.[1];
      if (url.origin === origin && !url.username && !url.password && id) ids.add(id.toLowerCase());
    } catch {
      /* Untrusted link text cannot establish meeting identity. */
    }
  }
  return [...ids];
}

// Definitions verified in the tenant on 11/11/2026. Version is checked against
// the exact analysis: current descriptions cannot reclassify historical versions.
const PLAYBOOK_TYPES: Record<string, { name: string; version: number; type: MeetingType }> = {
  "563bd80e-dd02-11f1-aa03-06fffbd49021": { name: "Descubrimiento", version: 4, type: "A" },
  "43f5710a-c0ca-11f0-8233-06254876e271": { name: "Discovery", version: 7, type: "A" },
  "db93c23a-c0cc-11f0-b75f-06254876e271": {
    name: "Seguimiento de Negociación",
    version: 9,
    type: "B",
  },
  "341836f2-c0cd-11f0-9810-06254876e271": { name: "Kickoff de Proyecto", version: 7, type: "C" },
  "3c3e2d84-1d4b-11f1-a082-06254876e271": { name: "Proyecto en Desarrollo", version: 6, type: "C" },
  "0740383a-11c9-11f1-8c6b-06254876e271": { name: "Renovación", version: 5, type: "C" },
  "3f7ed996-11c8-11f1-aa00-06254876e271": { name: "Cross-sell", version: 5, type: "C" },
  "0196baf0-11c7-11f1-8fd1-06254876e271": { name: "Upsell", version: 5, type: "C" },
};
export function typeFromVerifiedPlaybook(playbook: unknown): MeetingType {
  if (!playbook || typeof playbook !== "object") return "unknown";
  const p = playbook as { id?: string; name?: string; version?: number };
  const known = p.id ? PLAYBOOK_TYPES[p.id] : null;
  return known && known.name === p.name && known.version === p.version ? known.type : "unknown";
}
/** Classification authority is exclusively the finished analysis of this Diio meeting. */
export function classificationFromDiio(analysis: unknown): {
  type: MeetingType;
  classification: string;
} {
  const data =
    analysis && typeof analysis === "object"
      ? (analysis as { status?: string; playbook?: unknown })
      : null;
  if (data?.status !== "finished")
    return { type: "unknown", classification: "Pendiente de análisis verificable en Diio" };
  const type = typeFromVerifiedPlaybook(data.playbook);
  const playbook = data.playbook as { name?: string; version?: number } | undefined;
  return {
    type,
    classification:
      type === "unknown"
        ? "Diio: sin equivalencia A/B/C verificada para este playbook y versión"
        : `Diio: ${playbook?.name} · versión ${playbook?.version}`,
  };
}
export function diioMeetingDate(raw: string, now: number): string | null {
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return null;
  const stamp = Date.parse(raw);
  if (!Number.isFinite(stamp) || stamp > now) return null;
  // Use the business calendar, independent of browser/server timezone.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Coyhaique",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(stamp);
}
