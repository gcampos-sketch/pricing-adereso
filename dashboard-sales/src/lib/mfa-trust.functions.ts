import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_DOMAIN = "adere.so";

function checkDomain(claims: unknown) {
  const email = String((claims as { email?: string }).email ?? "").toLowerCase();
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) throw new Error("Unauthorized: cuenta no permitida");
}

/** Issues a 30-day device token. Only right after a real code verification (aal2). */
export const rememberDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    checkDomain(context.claims);
    if ((context.claims as { aal?: string }).aal !== "aal2") throw new Error("Unauthorized: se requiere verificación en dos pasos");
    const { createTrustToken } = await import("./mfa-trust.server");
    return createTrustToken(context.userId);
  });

/** Checks the token sent in the trust header for the signed-in user. */
export const checkDeviceTrust = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    checkDomain(context.claims);
    const { verifyTrustToken, TRUST_HEADER } = await import("./mfa-trust.server");
    const expiresAt = await verifyTrustToken(context.userId, getRequestHeader(TRUST_HEADER));
    return { trusted: Boolean(expiresAt), expiresAt };
  });

export const forgetDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { revokeTrustToken, TRUST_HEADER } = await import("./mfa-trust.server");
    const token = getRequestHeader(TRUST_HEADER);
    if (token) await revokeTrustToken(context.userId, token);
    return { ok: true };
  });
