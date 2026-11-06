import { createClient } from '@supabase/supabase-js';
import { corporateEmail } from './email-auth';

export type HubClaims = { sub?: unknown; email?: unknown; aal?: unknown; exp?: unknown };
export async function authorizeHubClaims(claims: HubClaims, trustToken: string | undefined, checkTrust: (userId: string, token?: string) => Promise<string | null>, now = Date.now()) {
  if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !corporateEmail(claims.email)
    || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now) return null;
  let expiresAt = claims.exp * 1000;
  if (claims.aal !== 'aal2') {
    const trustExpiry = Date.parse(await checkTrust(claims.sub, trustToken) ?? '');
    if (!Number.isFinite(trustExpiry) || trustExpiry <= now) return null;
    expiresAt = Math.min(expiresAt, trustExpiry);
  }
  return { expiresAt };
}

export async function verifyHubIdentity(accessToken: string, trustToken?: string) {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return null;
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getClaims(accessToken);
    if (error || !data?.claims) return null;
    return authorizeHubClaims(data.claims, trustToken, async (userId, token) => {
      const { verifyTrustToken } = await import('./mfa-trust.server');
      return verifyTrustToken(userId, token);
    });
  } catch { return null; }
}
