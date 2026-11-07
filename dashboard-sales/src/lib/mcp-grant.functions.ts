import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_DOMAIN = "adere.so";
export const MCP_GRANT_DAYS = 30;

const idInput = (input: { authorizationId: string }) => {
  const authorizationId = String(input?.authorizationId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(authorizationId)) throw new Error("Autorización inválida");
  return { authorizationId };
};

/**
 * Records that this concrete OAuth authorization was approved by a session that
 * just completed TOTP (aal2). The MCP server only accepts tokens for clients with
 * an active, unexpired, unrevoked grant.
 */
export const recordMcpGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const claims = context.claims as { aal?: string; email?: string };
    if (!String(claims.email ?? "").toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) throw new Error("Unauthorized: cuenta no permitida");
    // A fresh code is required here; a remembered device is not enough to delegate access.
    if (claims.aal !== "aal2") return { ok: false as const, reason: "mfa_required" as const };

    // Ask the auth server which client this authorization belongs to, as this user.
    const base = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const bearer = (getRequestHeader("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const res = await fetch(`${base}/auth/v1/oauth/authorizations/${encodeURIComponent(data.authorizationId)}`, {
      headers: { apikey: key, Authorization: `Bearer ${bearer}` },
    });
    if (!res.ok) throw new Error("La solicitud no es válida o expiró");
    const details = (await res.json()) as { client?: { id?: string; client_id?: string } };
    const clientId = details.client?.id ?? details.client?.client_id;
    if (!clientId) throw new Error("La solicitud no es válida o expiró");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const expiresAt = new Date(Date.now() + MCP_GRANT_DAYS * 86_400_000).toISOString();
    const { error } = await supabaseAdmin.from("mcp_grants").upsert(
      { user_id: context.userId, client_id: clientId, authorization_id: data.authorizationId, mfa_verified_at: new Date().toISOString(), expires_at: expiresAt, revoked_at: null },
      { onConflict: "authorization_id" },
    );
    if (error) throw new Error("No se pudo registrar la autorización");
    return { ok: true as const, expiresAt };
  });

/** Revokes the grant for an authorization (used when the user cancels). */
export const revokeMcpGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("mcp_grants")
      .update({ revoked_at: new Date().toISOString() })
      .eq("authorization_id", data.authorizationId)
      .eq("user_id", context.userId);
    return { ok: true };
  });
