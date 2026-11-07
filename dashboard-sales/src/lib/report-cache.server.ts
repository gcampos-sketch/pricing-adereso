/**
 * Copia persistida de cada reporte: permite abrir la página al instante con el
 * último resultado conocido y refrescar en segundo plano.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { packReport, unpackReport } from './report-wire';

export type SnapshotMeta = { generatedAt: string; buildMs: number };

export async function readSnapshot<T>(key: string): Promise<{ report: T; meta: SnapshotMeta } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("report_cache")
      .select("payload, build_ms, generated_at")
      .eq("key", key)
      .maybeSingle();
    if (error || !data?.payload) return null;
    return {
      report: unpackReport<T>(data.payload as T),
      meta: { generatedAt: data.generated_at, buildMs: data.build_ms },
    };
  } catch (error) {
    console.warn(`No se pudo leer la copia guardada (${key})`, error);
    return null;
  }
}

async function saveSnapshot(key: string, payload: unknown, buildMs: number) {
  try {
    await supabaseAdmin.from("report_cache").upsert(
      {
        key,
        payload: packReport(payload) as never,
        build_ms: Math.round(buildMs),
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch (error) {
    console.warn(`No se pudo guardar la copia (${key})`, error);
  }
}

/**
 * `fresh=false` devuelve la copia guardada si existe (respuesta inmediata);
 * `fresh=true` reconstruye desde HubSpot y actualiza la copia.
 */
export async function withSnapshot<T>(key: string, fresh: boolean, build: () => Promise<T>): Promise<T> {
  if (!fresh) {
    const stored = await readSnapshot<T>(key);
    if (stored) return stored.report;
  }
  // Sin singleflight entre peticiones: compartir una promesa en curso cuelga a
  // quien espera si la petición original se cancela.
  const started = Date.now();
  const report = await build();
  await saveSnapshot(key, report, Date.now() - started);
  return report;
}

/** Lee solo el historial de MRR activo de la copia guardada (evita cargar el reporte completo). */
export async function readActiveMrrHistory(key: string): Promise<unknown[] | undefined> {
  try {
    const { data, error } = await supabaseAdmin
      .from("report_cache")
      .select("history:payload->activeMrr->history, compact_history:payload->payload->activeMrr->history")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return undefined;
    const row = data as { history?: unknown; compact_history?: unknown };
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
      .in("key", keys);
    if (error || !data) return {};
    const out: Record<string, SnapshotMeta> = {};
    for (const row of data) out[row.key] = { generatedAt: row.generated_at, buildMs: row.build_ms };
    return out;
  } catch {
    return {};
  }
}
