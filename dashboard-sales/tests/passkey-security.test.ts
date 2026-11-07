import { expect, test } from 'bun:test';
import { authorizeHubClaims } from '../src/lib/hub-auth.server';

test('a signed passkey login does not replace the Hub second factor', async () => {
  const claims = { sub: 'passkey-user', email: 'persona@adere.so', aal: 'aal1', exp: 70, amr: [{ method: 'passkey', timestamp: 10 }] };
  expect(await authorizeHubClaims(claims, undefined, async () => null, 10_000)).toBeNull();
  const trust = async (user: string, token?: string) => user === claims.sub && token === 'verified-device' ? new Date(30_000).toISOString() : null;
  expect(await authorizeHubClaims(claims, 'verified-device', trust, 10_000)).toEqual({ expiresAt: 30_000 });
  expect(await authorizeHubClaims({ ...claims, email: 'persona@adere.so.evil.test' }, 'verified-device', trust, 10_000)).toBeNull();
});

test('the passkey entry point is bound to the exact official domain, never a local preview or lookalike', async () => {
  const { officialPasskeyOrigin, HUB_SIGN_IN_URL, passkeyErrorMessage } = await import('../src/lib/passkeys');
  expect(officialPasskeyOrigin('adereso-hub-comercial.onrender.com')).toBe(true);
  for (const host of ['127.0.0.1', 'localhost', 'adereso-hub-comercial.onrender.com.evil.test', 'preview.onrender.com']) expect(officialPasskeyOrigin(host)).toBe(false);
  expect(new URL(HUB_SIGN_IN_URL).hostname).toBe('adereso-hub-comercial.onrender.com');
  for (const error of [{}, {code:'passkey_auth_disabled'}, {name:'NotAllowedError'}]) expect(passkeyErrorMessage(error)).not.toContain('correo');
});
