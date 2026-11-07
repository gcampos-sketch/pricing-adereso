import { expect, test } from 'bun:test';
import { authorizeHubClaims } from '../src/lib/hub-auth.server';

test('a signed passkey login does not replace the Hub second factor', async () => {
  const claims = { sub: 'passkey-user', email: 'persona@adere.so', aal: 'aal1', exp: 70, amr: [{ method: 'passkey', timestamp: 10 }] };
  expect(await authorizeHubClaims(claims, undefined, async () => null, 10_000)).toBeNull();
  const trust = async (user: string, token?: string) => user === claims.sub && token === 'verified-device' ? new Date(30_000).toISOString() : null;
  expect(await authorizeHubClaims(claims, 'verified-device', trust, 10_000)).toEqual({ expiresAt: 30_000 });
  expect(await authorizeHubClaims({ ...claims, email: 'persona@adere.so.evil.test' }, 'verified-device', trust, 10_000)).toBeNull();
});
