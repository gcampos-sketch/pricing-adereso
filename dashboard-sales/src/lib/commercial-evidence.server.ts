import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  parseCommercialEvidence,
  EVIDENCE_PREFIX,
  type CommercialEvidence,
} from "./commercial-evidence";
/** Service-only table, behind the existing corporate MFA report handlers. No public write route. */
export async function readCommercialEvidence(): Promise<CommercialEvidence | null> {
  const { data, error } = await supabaseAdmin
    .from("report_cache")
    .select("key,payload")
    .like("key", `${EVIDENCE_PREFIX}%`)
    .order("key", { ascending: false })
    .limit(1);
  if (error) throw Error("No se pudo leer la edición privada de reuniones y coaching.");
  const row = data?.[0];
  if (!row) return null;
  const edition = parseCommercialEvidence(row.payload);
  if (row.key !== EVIDENCE_PREFIX + edition.sourceAt)
    throw Error("La fecha de la edición no coincide con su registro.");
  return edition;
}

/** Metadata-only check invalidates an older coaching report after a newer source edition is published. */
export async function readCommercialEvidenceDate(): Promise<string | undefined> {
  const { data, error } = await supabaseAdmin
    .from("report_cache")
    .select("key")
    .like("key", `${EVIDENCE_PREFIX}%`)
    .order("key", { ascending: false })
    .limit(1);
  if (error) throw Error("No se pudo comprobar la fecha de la edición privada.");
  const value = data?.[0]?.key.slice(EVIDENCE_PREFIX.length);
  if (value && !Number.isFinite(Date.parse(value))) throw Error("Fecha de edición inválida.");
  return value;
}
