/** Compile reviewed private source editions into a dated, insert-only server edition. Never writes CRM. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseCommercialEvidence, EVIDENCE_PREFIX } from "../src/lib/commercial-evidence";
import { buildMeetingCoverage } from "../src/lib/meeting-coverage";
import { coachingCandidateFromMemory, reconcileCoachingEvents } from "../src/lib/coaching-evidence";
import {
  getOwners,
  getPropertyOptionLabels,
  gateway,
  COMMERCIAL_PIPELINE,
} from "../src/lib/hubspot.server";
const args = process.argv.slice(2),
  directory = args.find((value) => !value.startsWith("--"));
if (!directory)
  throw Error("Indica el directorio privado de fuentes revisadas. Sin --publish solo valida.");
const read = async (name: string) => JSON.parse(await readFile(resolve(directory, name), "utf8"));
const [report, companies, registry, calendar, coaching] = await Promise.all(
  [
    "diio-meetings.json",
    "meeting-companies.json",
    "hubspot-meeting-audit.json",
    "meeting-calendar-audit.json",
    "coaching-memory-events.json",
  ].map(read),
);
if (
  companies.method !== "verified-meeting-account-company/v1" ||
  coaching.source !== "adereso-memory" ||
  !Array.isArray(coaching.documents)
)
  throw Error("Fuente sin identidad verificada");
report.complete = false;
report.events = report.events.map((event: any) => ({
  ...event,
  ...(companies.byMeeting[event.id] ?? { companies: [], companyAttributionComplete: false }),
}));
report.accountIdentityAuthority = companies.accountIdentityAuthority;
report.portfolio = companies.portfolio;
report.coverage = buildMeetingCoverage(registry.records, calendar, report, registry);
const [rawOwners, labels] = await Promise.all([
  getOwners(),
  getPropertyOptionLabels("adobo_oportunidad_de_mejora"),
]);
const owners = rawOwners.map((owner) => ({
  id: owner.id,
  email: owner.email ?? "",
  name: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.id,
}));
let rejectedDocuments = 0;
const candidates = coaching.documents.flatMap((document: { documentId: string; text: string }) => {
  const row = coachingCandidateFromMemory(document.documentId, document.text, owners);
  if (!row) {
    rejectedDocuments++;
    return [];
  }
  return [row];
});
const edition = parseCommercialEvidence({
  schema: "commercial-evidence/v1",
  sourceAt: new Date(
    Math.max(Date.parse(report.fetchedAt), Date.parse(coaching.fetchedAt)),
  ).toISOString(),
  meetings: report,
  coaching: { fetchedAt: coaching.fetchedAt, candidates, rejectedDocuments },
});
// Confirm every linked deal still belongs to the commercial pipeline before this edition can be published.
const ids = [
  ...new Set([
    ...edition.meetings.events.flatMap((row) => row.dealIds),
    ...(edition.meetings.coverage?.events.flatMap((row) => row.dealIds) ?? []),
  ]),
];
for (let start = 0; start < ids.length; start += 100) {
  const batch = ids.slice(start, start + 100);
  const page = await gateway<{
    results: { id: string; properties: { pipeline?: string } }[];
    errors?: unknown[];
  }>("/crm/v3/objects/deals/batch/read", {
    method: "POST",
    body: JSON.stringify({ properties: ["pipeline"], inputs: batch.map((id) => ({ id })) }),
  });
  if (
    page.errors?.length ||
    page.results.length !== batch.length ||
    page.results.some((row) => row.properties.pipeline !== COMMERCIAL_PIPELINE)
  )
    throw Error(
      "Asociaciones comerciales cambiadas o incompletas; conserva la edición anterior y revisa las fuentes.",
    );
}
const validation = reconcileCoachingEvents(
  edition.coaching.candidates,
  edition.meetings,
  owners,
  labels,
);
const payload = JSON.stringify(edition),
  hash = createHash("sha256").update(payload).digest("hex");
if (args.includes("--publish")) {
  const { supabaseAdmin: client } = await import("../src/integrations/supabase/client.server");
  const key = EVIDENCE_PREFIX + edition.sourceAt;
  const result = await client
    .from("report_cache")
    .insert({ key, payload: edition as never, build_ms: 0, generated_at: edition.sourceAt });
  if (result.error && result.error.code !== "23505")
    throw Error("No se pudo publicar la edición privada.");
  const check = await client.from("report_cache").select("payload").eq("key", key).single();
  if (check.error) throw Error("No se pudo verificar la edición.");
  const saved = parseCommercialEvidence(check.data.payload);
  if (JSON.stringify(saved) !== payload)
    throw Error("Existe otra edición para esa fecha; no se reemplazó.");
}
console.log(
  JSON.stringify({
    mode: args.includes("--publish") ? "published" : "validated",
    sourceAt: edition.sourceAt,
    meetings: edition.meetings.events.length,
    coachingVerified: validation.rows.length,
    coachingPending: validation.pending.length + rejectedDocuments,
    partial: true,
    sha256: hash,
    bytes: Buffer.byteLength(payload),
    verified: true,
  }),
);
