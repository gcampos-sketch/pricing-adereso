/** Server-side device trust: random tokens, only their SHA-256 hash is stored. */
export const TRUST_DAYS = 30;
export const TRUST_HEADER = "x-mfa-trust";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createTrustToken(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + TRUST_DAYS * 86_400_000).toISOString();
  const { error } = await supabaseAdmin
    .from("mfa_trusted_devices")
    .insert({ user_id: userId, token_hash: await sha256(token), expires_at: expiresAt });
  if (error) throw new Error("No se pudo recordar el dispositivo");
  return { token, expiresAt };
}

/** Returns the expiry if the token is valid, unrevoked and belongs to this user. */
export async function verifyTrustToken(userId: string, token: string | null | undefined) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("mfa_trusted_devices")
    .select("expires_at, revoked_at")
    .eq("token_hash", await sha256(token))
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.revoked_at || Date.parse(data.expires_at) < Date.now()) return null;
  return data.expires_at;
}

export async function revokeTrustToken(userId: string, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("mfa_trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", await sha256(token))
    .eq("user_id", userId);
}
