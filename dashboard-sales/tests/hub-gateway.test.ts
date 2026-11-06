import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHubGateway, HUB_COOKIE } from '../src/lib/hub-gateway';
import { authorizeHubClaims } from '../src/lib/hub-auth.server';
import { HUB_FILES } from '../src/lib/hub-files';

const origin = 'https://hub.example.test';
function setup() {
 let reads = 0;
 const gateway = createHubGateway({ now: () => 10_000, verify: async token => token === 'verified-token' ? { expiresAt: 70_000 } : null,
   read: async () => { reads++; return new TextEncoder().encode('private commercial content'); } });
 return { gateway, reads: () => reads };
}
const cookie = (accessToken = 'verified-token') => `${HUB_COOKIE}=${encodeURIComponent(JSON.stringify({ accessToken }))}`;
test('private hub HTML and direct section URLs never load without verified authentication', async () => {
 const { gateway, reads } = setup();
 for (const path of Object.keys(HUB_FILES)) {
   const result = await gateway(new Request(origin + '/hub-content/' + path));
   expect(result?.status).toBe(401); expect(await result?.text()).not.toContain('private commercial content');
 }
 expect(reads()).toBe(0);
});
test('forged, malformed and merely present cookies do not authenticate', async () => {
 const { gateway, reads } = setup();
 for (const value of [cookie('forged'), `${HUB_COOKIE}=true`, `${HUB_COOKIE}=%bad`, `${HUB_COOKIE}=${encodeURIComponent('{"authenticated":true}')}`]) {
   const response = await gateway(new Request(origin + '/hub-content/index.html', { headers: { cookie: value } })); expect(response?.status).toBe(401);
 }
 expect(reads()).toBe(0);
});
test('secrets, traversal and source files are outside the private static allowlist', async () => {
 const { gateway, reads } = setup();
 for (const path of ['.env', '.git/config', 'dashboard-sales/.env.local', '%2Eenv', '..%2F.env', 'index.html%00', 'src/server.ts']) {
   const response = await gateway(new Request(origin + '/hub-content/' + path, { headers: { cookie: cookie() } })); expect(response?.status).toBe(404);
 }
 expect(reads()).toBe(0);
});
test('verified content is private, uncached and frameable only by this origin', async () => {
 const { gateway } = setup(); const response = await gateway(new Request(origin + '/hub-content/academy/index.html', { headers: { cookie: cookie() } }));
 expect(response?.status).toBe(200); expect(await response?.text()).toBe('private commercial content');
 expect(response?.headers.get('Cache-Control')).toBe('private, no-store'); expect(response?.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
 const head = await gateway(new Request(origin + '/hub-content/index.html', { method: 'HEAD', headers: { cookie: cookie() } })); expect(await head?.text()).toBe('');
});
test('session creation requires same-origin bearer authentication and uses a secure HttpOnly cookie', async () => {
 const { gateway } = setup();
 const request = (requestOrigin: string, token: string) => new Request(origin + '/api/hub/session', { method: 'POST', headers: { origin: requestOrigin, Authorization: `Bearer ${token}` } });
 expect((await gateway(request('https://outside.example.test', 'verified-token')))?.status).toBe(403);
 expect((await gateway(request(origin, 'forged')))?.status).toBe(401);
 const response = await gateway(request(origin, 'verified-token')); expect(response?.status).toBe(204);
 const value = response?.headers.get('set-cookie') ?? ''; expect(value).toContain('HttpOnly'); expect(value).toContain('SameSite=Lax'); expect(value).toContain('Secure'); expect(value).toContain('Max-Age=60');
});
test('logout clears the shared hub cookie and rejects cross-origin logout', async () => {
 const { gateway } = setup();
 const response = await gateway(new Request(origin + '/api/hub/session', { method: 'DELETE', headers: { origin } }));
 expect(response?.status).toBe(204); expect(response?.headers.get('set-cookie')).toContain('Max-Age=0');
 expect((await gateway(new Request(origin + '/api/hub/session', { method: 'DELETE', headers: { origin: 'https://outside.test' } })))?.status).toBe(403);
});
test('the embedded dashboard uses the same origin and session', async () => {
 const { gateway } = setup(); const response = await gateway(new Request(origin + '/hub-content/dashboard-settings.js', { headers: { cookie: cookie() } }));
 expect(await response?.text()).toContain("'/?dashboard=1'");
});
test('MCP and ordinary app routes retain their own existing handlers', async () => {
 const { gateway } = setup(); for (const path of ['/', '/mcp', '/healthz']) expect(await gateway(new Request(origin + path))).toBeNull();
});
test('corporate MFA authorization rejects outside accounts, expired sessions and unverified trust', async () => {
 const good = { sub: 'signed-user', email: 'persona@adere.so', aal: 'aal2', exp: 70 };
 const noTrust = async () => null;
 expect(await authorizeHubClaims(good, undefined, noTrust, 10_000)).toEqual({ expiresAt: 70_000 });
 for (const claims of [{ ...good, email: 'persona@example.test' }, { ...good, aal: 'aal1' }, { ...good, exp: 1 }, { ...good, sub: '' }]) expect(await authorizeHubClaims(claims, undefined, noTrust, 10_000)).toBeNull();
});
test('a trusted device remains bound to the signed user and its own expiry', async () => {
 const claims = { sub: 'signed-user', email: 'persona@adere.so', aal: 'aal1', exp: 70 };
 const check = async (user: string, token?: string) => user === 'signed-user' && token === 'owned-token' ? new Date(30_000).toISOString() : null;
 expect(await authorizeHubClaims(claims, 'owned-token', check, 10_000)).toEqual({ expiresAt: 30_000 });
 expect(await authorizeHubClaims(claims, 'another-token', check, 10_000)).toBeNull();
 expect(await authorizeHubClaims(claims, 'owned-token', async () => 'invalid-date', 10_000)).toBeNull();
});
test('every packaged hub file exists in the repository', async () => {
 for (const path of Object.keys(HUB_FILES)) expect((await readFile(resolve(import.meta.dir, '../..', path))).byteLength).toBeGreaterThan(0);
});

test('a configured public origin works behind TLS termination without trusting forwarded headers', async () => {
 const gateway = createHubGateway({ publicOrigin: origin, verify: async () => null, read: async () => new Uint8Array() });
 const request = (requestOrigin: string) => new Request('http://internal:10000/api/hub/session', { method: 'POST', headers: { origin: requestOrigin, authorization: 'Bearer forged', 'x-forwarded-host': 'attacker.test' } });
 expect((await gateway(request(origin)))?.status).toBe(401);
 expect((await gateway(request('https://attacker.test')))?.status).toBe(403);
});
