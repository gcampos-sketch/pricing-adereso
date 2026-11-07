/**
 * Browser side of "remember this device for 30 days".
 * Holds an opaque token issued and verified by the server; it grants nothing by itself.
 */
import { createMiddleware } from "@tanstack/react-start";

const STORAGE_KEY = "mfa-trust-v2";

export function readTrustToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string };
    if (!parsed.token || !parsed.expiresAt || Date.parse(parsed.expiresAt) < Date.now()) return null;
    return parsed.token;
  } catch {
    return null;
  }
}

export function storeTrustToken(token: string, expiresAt: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt }));
    localStorage.removeItem("mfa-trust-v1");
  } catch {
    /* storage unavailable: the code will be asked again next time */
  }
}

export function clearTrustToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("mfa-trust-v1");
  } catch {
    /* ignore */
  }
}

/** Sends the trust token with every server function call. */
export const attachMfaTrust = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = typeof window === "undefined" ? null : readTrustToken();
  return next(token ? { headers: { "x-mfa-trust": token } } : undefined);
});
