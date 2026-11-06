import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import type { PulseReport } from "@/lib/pulse-types";
import { decideMcpAccess } from "./access";

/** Caller-scoped client: queries run as the OAuth user, under RLS. */
function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new ToolError("Falta la autorización.");
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** @adere.so account plus an active MFA-verified grant for this OAuth client. */
export async function assertTeamCaller(ctx: ToolContext) {
  const claims = (ctx.getClaims() ?? {}) as { email?: unknown; aal?: unknown; amr?: unknown };
  const amr = Array.isArray(claims.amr)
    ? claims.amr.map((m) => (typeof m === "object" && m ? (m as { method?: unknown }).method : m))
    : claims.amr;
  console.info("[mcp] auth claims", JSON.stringify({ aal: claims.aal ?? null, amr: amr ?? null }));
  const supabase = supabaseForUser(ctx);
  let lookupFailed = false;
  const decision = await decideMcpAccess(claims, ctx.getClientId(), async (clientId) => {
    const { data, error } = await supabase.rpc("has_active_mcp_grant", { _client_id: clientId });
    if (error) { lookupFailed = true; console.error("[mcp] grant lookup failed", error.code ?? "", error.message); return false; }
    return data === true;
  });
  if (decision.ok) return;
  console.info("[mcp] access denied", JSON.stringify({ reason: lookupFailed ? "lookup_error" : decision.reason, hasClientId: Boolean(ctx.getClientId()) }));
  if (decision.reason === "domain") throw new ToolError("Solo cuentas @adere.so pueden usar estas herramientas.");
  if (lookupFailed) throw new ToolError("No se pudo comprobar la autorización en este momento. Intenta de nuevo en unos segundos.");
  throw new ToolError("Esta conexión no tiene una autorización vigente con verificación en dos pasos. Vuelve a conectar el asistente.");
}

export async function loadPulse(role?: "AE" | "KAM"): Promise<PulseReport> {
  const { readSnapshot } = await import("@/lib/report-cache.server");
  const key = role ? `pulse-${role.toLowerCase()}` : "pulse";
  const snap = await readSnapshot<PulseReport>(key);
  if (!snap) throw new ToolError("El reporte aún no tiene datos guardados. Abre el tablero para generarlos.");
  return snap.report;
}

export const usd = (n: number) => `$${Math.round(n || 0).toLocaleString("en-US")}`;
