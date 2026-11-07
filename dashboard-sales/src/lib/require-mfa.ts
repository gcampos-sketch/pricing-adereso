import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { corporateEmail } from "./email-auth";

/** Rejects non-Adereso accounts, and sessions that neither passed TOTP (aal2) nor carry a valid trusted-device token. */
export const requireMfa = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const claims = context.claims as { aal?: string; email?: string };
    const email = String(claims.email ?? "").toLowerCase();
    if (!corporateEmail(email)) throw new Error("Unauthorized: cuenta no permitida");
    if (claims.aal !== "aal2") {
      const { verifyTrustToken, TRUST_HEADER } = await import("./mfa-trust.server");
      const ok = await verifyTrustToken(context.userId, getRequestHeader(TRUST_HEADER));
      if (!ok) throw new Error("Unauthorized: se requiere verificación en dos pasos");
    }
    return next();
  });
