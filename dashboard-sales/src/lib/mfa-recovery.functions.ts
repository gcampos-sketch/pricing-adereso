import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_DOMAIN = "adere.so";
const CODE_COUNT = 8;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function checkDomain(claims: unknown) {
  const email = String((claims as { email?: string }).email ?? "").toLowerCase();
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) throw new Error("Unauthorized: cuenta no permitida");
}

function normalize(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function hashCode(userId: string, code: string) {
  const bytes = new TextEncoder().encode(`${userId}:${normalize(code)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** Issues one-time recovery codes. Requires aal2. With `onlyIfMissing`, returns null when unused codes exist. */
export const issueRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { onlyIfMissing?: boolean }) => ({ onlyIfMissing: Boolean(input?.onlyIfMissing) }))
  .handler(async ({ data, context }) => {
    checkDomain(context.claims);
    if ((context.claims as { aal?: string }).aal !== "aal2") throw new Error("Unauthorized: se requiere verificación en dos pasos");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.onlyIfMissing) {
      const { count } = await supabaseAdmin
        .from("mfa_recovery_codes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("used_at", null);
      if ((count ?? 0) > 0) return { codes: null as string[] | null };
    }
    const codes = Array.from({ length: CODE_COUNT }, randomCode);
    const rows = await Promise.all(codes.map(async (c) => ({ user_id: context.userId, code_hash: await hashCode(context.userId, c) })));
    await supabaseAdmin.from("mfa_recovery_codes").delete().eq("user_id", context.userId);
    const { error } = await supabaseAdmin.from("mfa_recovery_codes").insert(rows);
    if (error) throw new Error("No pudimos generar los códigos de recuperación");
    return { codes: codes as string[] | null };
  });

/** Consumes a recovery code and removes the user's authenticator so they can enroll a new one. */
export const redeemRecoveryCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    const code = normalize(String(input?.code ?? ""));
    if (code.length !== 10) throw new Error("Código inválido");
    return { code };
  })
  .handler(async ({ data, context }) => {
    checkDomain(context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await hashCode(context.userId, data.code);
    const { data: row } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .select("id")
      .eq("user_id", context.userId)
      .eq("code_hash", hash)
      .is("used_at", null)
      .maybeSingle();
    if (!row) return { ok: false };
    const { data: used } = await supabaseAdmin
      .from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("used_at", null)
      .select("id");
    if (!used?.length) return { ok: false };
    const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: context.userId });
    for (const f of factors?.factors ?? []) {
      await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: context.userId, id: f.id });
    }
    return { ok: true };
  });
