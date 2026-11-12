/** Read-only measurement. Never print or retain CRM contents, only byte counts and verification. */
import { writeFile } from "node:fs/promises";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { encodeStoredReport, decodeStoredReport } from "../src/lib/report-storage";
import { unpackReport } from "../src/lib/report-wire";
const results = [];
for (const key of ["pulse", "pulse-ae", "pulse-kam", "insights"]) {
  const { data, error } = await supabaseAdmin
    .from("report_cache")
    .select("payload,generated_at")
    .eq("key", key)
    .single();
  if (error) throw Error(`No se pudo medir ${key}: ${error.code}`);
  const report = unpackReport(data.payload);
  const encoded = await encodeStoredReport(report);
  const decoded = await decodeStoredReport(encoded.storage);
  if (JSON.stringify(decoded) !== JSON.stringify(report))
    throw Error("La copia comprimida no conserva todo el contenido");
  results.push({
    key,
    generatedAt: data.generated_at,
    rawBytes: encoded.rawBytes,
    storedBytes: encoded.storedBytes,
    reductionPct: Math.round((1 - encoded.storedBytes / encoded.rawBytes) * 1000) / 10,
    lossless: true,
  });
}
await writeFile(
  ".migration-backups/report-transfer-baseline.json",
  JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(results));
