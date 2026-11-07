/** Pure access decision for MCP tool calls (kept separate so it can be tested). */
export const ALLOWED_DOMAIN = "adere.so";

export type McpAccess = { ok: true } | { ok: false; reason: "domain" | "no_client" | "no_grant" };

export async function decideMcpAccess(
  claims: { email?: unknown } | undefined,
  clientId: string | undefined,
  hasActiveGrant: (clientId: string) => Promise<boolean>,
): Promise<McpAccess> {
  const email = String(claims?.email ?? "").toLowerCase();
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return { ok: false, reason: "domain" };
  if (!clientId) return { ok: false, reason: "no_client" };
  // The grant is created only after a fresh TOTP check at consent, is bound to
  // this user + OAuth client, and expires/can be revoked. Refreshed tokens keep
  // the same client_id, so they stay valid while the grant is active.
  if (!(await hasActiveGrant(clientId))) return { ok: false, reason: "no_grant" };
  return { ok: true };
}
