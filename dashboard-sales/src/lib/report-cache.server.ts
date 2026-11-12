/**
 * Copia persistida de cada reporte: permite abrir la página al instante con el
 * último resultado conocido y refrescar en segundo plano.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encodeStoredReport, decodeStoredReport } from "./report-storage";
import { acquireReportRefresh, type RefreshClaim } from "./report-refresh";
const runtimeKey = (key: string) => `report-v2/${key}`;
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(name as never, args as never);
  if (error)
    throw Error(`No se pudo coordinar la actualización del reporte (${error.code ?? "database"}).`);
  return data as T;
}
import { SERVICE_MRR_CALCULATION } from "./service-mrr";

export type SnapshotMeta = { generatedAt: string; buildMs: number };

export async function readSnapshot<T>(
  key: string,
): Promise<{ report: T; meta: SnapshotMeta } | null> {
  // A separate namespace keeps legacy versions and immutable diagnostic editions intact.
  for (const candidate of [runtimeKey(key), key]) {
    const { data: row, error } = await supabaseAdmin
      .from("report_cache")
      .select("key,payload,build_ms,generated_at")
      .eq("key", candidate)
      .maybeSingle();
    if (error) throw Error(`No se pudo leer la última copia del reporte (${error.code}).`);
    if (!row?.payload) continue;
    try {
      const report = await decodeStoredReport<T>(row.payload);
      const verified =
        report && typeof report === "object" && "generatedAt" in report
          ? { ...report, generatedAt: row.generated_at }
          : report;
      return {
        report: verified as T,
        meta: { generatedAt: row.generated_at, buildMs: row.build_ms },
      };
    } catch {
      console.warn("No se pudo decodificar una copia del reporte", { key: candidate });
    }
  }
  return null;
}

/** Automatic callers share one verified refresh per minute. Manual refresh remains available. */
export async function withSnapshot<T>(
  key: string,
  fresh: boolean,
  build: () => Promise<T>,
  accepts: (report: T) => boolean = () => true,
  force = false,
): Promise<T> {
  if (!fresh) {
    const stored = await readSnapshot<T>(key);
    if (stored && accepts(stored.report)) return stored.report;
  }
  const cacheKey = runtimeKey(key);
  const claim = await acquireReportRefresh(
    () => rpc<RefreshClaim>("report_claim_refresh", { p_key: cacheKey, p_force: force }),
    () => new Promise((resolve) => setTimeout(resolve, 1000)),
  );
  if (!claim.token) {
    const stored = await readSnapshot<T>(key);
    if (stored && accepts(stored.report)) return stored.report;
    throw Error("La copia del reporte requiere una nueva actualización. Vuelve a intentar.");
  }
  const token = claim.token;
  try {
    const started = Date.now();
    const report = await build();
    if (!accepts(report))
      throw Error("El reporte generado no cumple la versión de cálculo requerida.");
    const encoded = await encodeStoredReport(report);
    const unchanged = encoded.hash === claim.hash;
    const sentBytes = unchanged ? 0 : encoded.storedBytes;
    const committed = await rpc<boolean>("report_finish_refresh", {
      p_key: cacheKey,
      p_token: token,
      p_hash: encoded.hash,
      p_payload: unchanged ? null : encoded.storage,
      p_build_ms: Date.now() - started,
      p_raw_bytes: encoded.rawBytes,
      p_sent_bytes: sentBytes,
    });
    if (!committed)
      throw Error("Otra actualización reemplazó esta lectura; se conserva la última copia válida.");
    console.info(
      "[report-transfer]",
      JSON.stringify({ key, rawBytes: encoded.rawBytes, sentBytes, unchanged }),
    );
    return report;
  } finally {
    await rpc("report_release_refresh", { p_key: cacheKey, p_token: token }).catch(() => {
      console.warn("La reserva del reporte se liberará por vencimiento", { key });
    });
  }
}

/** Lee solo el historial de MRR activo de la copia guardada (evita cargar el reporte completo). */
export async function readActiveMrrHistory(key: string): Promise<unknown[] | undefined> {
  try {
    const { data, error } = await supabaseAdmin
      .from("report_cache")
      .select(
        "key,history:payload->activeMrr->history, compact_history:payload->payload->activeMrr->history, calculation:payload->activeMrr->calculation, compact_calculation:payload->payload->activeMrr->calculation",
      )
      .in("key", [runtimeKey(key), key]);
    if (error || !data) return undefined;
    const row =
      data.find((row) => row.key === runtimeKey(key)) ?? data.find((row) => row.key === key);
    if (!row) return undefined;
    if ((row.compact_calculation ?? row.calculation) !== SERVICE_MRR_CALCULATION) return undefined;
    const history = row.compact_history ?? row.history;
    return Array.isArray(history) ? history : undefined;
  } catch {
    return undefined;
  }
}

/** Metadatos para estimar cuánto tarda el refresco (usado por el loading). */
export async function readMeta(keys: string[]): Promise<Record<string, SnapshotMeta>> {
  try {
    const { data, error } = await supabaseAdmin
      .from("report_cache")
      .select("key, build_ms, generated_at")
      .in("key", [...keys, ...keys.map(runtimeKey)]);
    if (error || !data) return {};
    const out: Record<string, SnapshotMeta> = {};
    for (const key of keys) {
      const row =
        data.find((row) => row.key === runtimeKey(key)) ?? data.find((row) => row.key === key);
      if (row) out[key] = { generatedAt: row.generated_at, buildMs: row.build_ms };
    }
    return out;
  } catch {
    return {};
  }
}
