import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createHubEntrySelection, createHubEntryVisits, deliverHubEntry, HUB_ENTRY_ORIGIN, HUB_ENTRY_STORAGE_KEY, readEntrySessionId, type EntrySession } from '../src/lib/hub-entry';
import { createHubEntryGateway } from '../src/lib/hub-entry-gateway';

const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const session: EntrySession = { userId: 'user-one', sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', accessToken: 'never-persist-this-token' };
function storage(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
}
function requests(options: Partial<Parameters<typeof createHubEntryGateway>[0]> = {}) {
  const writes: { userId: string; visitId: string }[] = [];
  const gateway = createHubEntryGateway({ publicOrigin: HUB_ENTRY_ORIGIN, now: () => 1000,
    verify: async token => token === 'valid-token' ? { userId: 'server-user', expiresAt: 2000 } : null,
    record: async (userId, visitId) => { writes.push({ userId, visitId }); }, ...options });
  const request = (headers: Record<string, string> = {}, method = 'POST', body?: string) => new Request('http://internal:10000/api/hub/entries', {
    method, headers: { origin: HUB_ENTRY_ORIGIN, authorization: 'Bearer valid-token', 'x-hub-visit-id': id1, ...headers }, ...(body ? { body } : {}),
  });
  return { gateway, writes, request };
}

test('one document and refreshed token reuse the same visit, storing no access token', () => {
  const store = storage();
  let sequence = 0;
  const visits = createHubEntryVisits({ storage: store, navigationType: 'navigate', randomId: () => sequence++ ? id2 : id1 });
  expect(visits(session).visitId).toBe(id1);
  expect(visits({ ...session, accessToken: 'refreshed-token' }).visitId).toBe(id1);
  expect(sequence).toBe(1);
  expect(JSON.parse(store.getItem()!)).toEqual({ userId: session.userId, sessionId: session.sessionId, visitId: id1 });
  expect(store.getItem()).not.toContain('token');
});

test('reload is not a new entry, but reopening or duplicating a tab is', () => {
  const store = storage();
  createHubEntryVisits({ storage: store, navigationType: 'navigate', randomId: () => id1 })(session);
  const reload = createHubEntryVisits({ storage: store, navigationType: 'reload', randomId: () => id2 });
  expect(reload(session).visitId).toBe(id1);
  const reopen = createHubEntryVisits({ storage: store, navigationType: 'navigate', randomId: () => id2 });
  expect(reopen(session).visitId).toBe(id2);
});

test('a BFCache restore and a different login session each start a new visit', () => {
  let sequence = 0;
  const visits = createHubEntryVisits({ navigationType: 'navigate', randomId: () => sequence++ ? id2 : id1 });
  expect(visits(session).visitId).toBe(id1);
  expect(visits(session, true).visitId).toBe(id2);
  expect(visits(session).visitId).toBe(id2);
  const store = storage(JSON.stringify({ ...session, visitId: id1 }));
  expect(createHubEntryVisits({ storage: store, navigationType: 'reload', randomId: () => id2 })({ ...session, sessionId: 'new-session' }).visitId).toBe(id2);
});

test('missing, malformed or inaccessible storage does not block entry', () => {
  for (const store of [storage('bad json'), storage('{}'), { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } }]) {
    const visits = createHubEntryVisits({ storage: store, navigationType: 'reload', randomId: () => id1 });
    expect(visits(session).visitId).toBe(id1);
    expect(visits(session).visitId).toBe(id1);
  }
});

test('recovery never creates an entry when another tab replaces the same account session', async () => {
  let sequence = 0;
  const select = createHubEntrySelection(createHubEntryVisits({ navigationType: 'navigate', randomId: () => sequence++ ? id2 : id1 }));
  const opening = select(session);
  const replaced = { ...session, sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
  expect(select(replaced)).toBe(opening);
  expect(select(replaced).visitId).toBe(id1);
  expect(sequence).toBe(1);
  expect(await deliverHubEntry(select(replaced), { isActive: () => true, getSession: async () => replaced,
    sleep: async () => {}, send: async () => { throw new Error('must not send another session'); } })).toBe('cancelled');
  expect(select(replaced, true).visitId).toBe(id2);
  expect(sequence).toBe(2);
});

test('reload reads only allowlisted identifiers from saved visit data', () => {
  const store = storage(JSON.stringify({ ...session, visitId: id1, extra: 'not part of visit' }));
  const visit = createHubEntryVisits({ storage: store, navigationType: 'reload', randomId: () => id2 })(session);
  expect(Object.keys(visit).sort()).toEqual(['sessionId', 'userId', 'visitId']);
  expect(store.getItem()).not.toContain(session.accessToken);
  expect(store.getItem()).not.toContain('extra');
});

test('client session claim parsing is bounded metadata parsing, not authorization', () => {
  const token = 'header.' + btoa(JSON.stringify({ session_id: session.sessionId })) + '.signature';
  expect(readEntrySessionId(token)).toBe(session.sessionId);
  for (const invalid of ['', 'opaque', 'header.bad-json.signature', 'header.' + btoa('{}') + '.sig']) expect(readEntrySessionId(invalid)).toBeNull();
});

test('only the fixed production origin can record, regardless of forwarded headers', async () => {
  for (const publicOrigin of [undefined, 'http://127.0.0.1:8877', 'https://preview.onrender.com']) {
    const { gateway, writes, request } = requests({ publicOrigin });
    expect((await gateway(request({ 'x-forwarded-host': 'adereso-hub-comercial.onrender.com' })))?.status).toBe(404);
    expect(writes).toHaveLength(0);
  }
  const { gateway, writes, request } = requests();
  expect((await gateway(request({ origin: 'https://attacker.test' })))?.status).toBe(403);
  expect((await gateway(request({ origin: '' })))?.status).toBe(403);
  expect(writes).toHaveLength(0);
});

test('method, visit ID and bearer token are validated before any write', async () => {
  const { gateway, writes, request } = requests();
  expect((await gateway(request({}, 'GET')))?.status).toBe(405);
  expect((await gateway(request({ 'x-hub-visit-id': 'bad-id' })))?.status).toBe(400);
  expect((await gateway(request({ authorization: '' })))?.status).toBe(401);
  expect((await gateway(request({ authorization: 'Bearer forged-token' })))?.status).toBe(401);
  expect((await gateway(request({ authorization: 'Bearer ' + 'x'.repeat(6001) })))?.status).toBe(401);
  expect(writes).toHaveLength(0);
});

test('server-verified identity is authoritative and the client cannot set identity or time', async () => {
  const { gateway, writes, request } = requests();
  const result = await gateway(request({}, 'POST', JSON.stringify({ user_id: 'spoofed', entered_at: '1900-01-01' })));
  expect(result?.status).toBe(204);
  expect(result?.headers.get('Cache-Control')).toBe('no-store');
  expect(writes).toEqual([{ userId: 'server-user', visitId: id1 }]);
});

test('expired identities, local OAuth and delegated OAuth are not Hub entries', async () => {
  for (const identity of [null, { userId: 'server-user', expiresAt: 1000 }, { userId: 'server-user', expiresAt: 2000, oauthClientId: 'local-preview' }]) {
    const { gateway, writes, request } = requests({ verify: async () => identity });
    expect((await gateway(request()))?.status).toBe(identity?.oauthClientId ? 403 : 401);
    expect(writes).toHaveLength(0);
  }
});

test('the existing MFA trust token reaches identity verification unchanged', async () => {
  const seen: unknown[][] = [];
  const { gateway, request } = requests({ verify: async (...args) => { seen.push(args); return { userId: 'server-user', expiresAt: 2000 }; } });
  expect((await gateway(request({ 'x-mfa-trust': 'existing-trust' })))?.status).toBe(204);
  expect(seen).toEqual([['valid-token', 'existing-trust']]);
});

test('storage failure is explicit and other app routes remain untouched', async () => {
  const { gateway, request } = requests({ record: async () => { throw new Error('private detail'); } });
  const result = await gateway(request());
  expect(result?.status).toBe(503);
  expect(await result?.text()).not.toContain('private detail');
  for (const path of ['/', '/mcp', '/api/hub/session', '/healthz']) expect(await gateway(new Request(HUB_ENTRY_ORIGIN + path))).toBeNull();
});

test('transient failures retry only the same visit, using the current token', async () => {
  const ids: string[] = [], tokens: string[] = [], sleeps: number[] = [];
  const result = await deliverHubEntry({ ...session, visitId: id1 }, {
    isActive: () => true, getSession: async () => ({ ...session, accessToken: `token-${ids.length}` }),
    sleep: async ms => { sleeps.push(ms); },
    send: async (current, id) => { ids.push(id); tokens.push(current.accessToken); if (ids.length === 1) throw new Error('uncertain response'); return ids.length === 2 ? 503 : 204; },
  });
  expect(result).toBe('recorded');
  expect(ids).toEqual([id1, id1, id1]);
  expect(tokens).toEqual(['token-0', 'token-1', 'token-2']);
  expect(sleeps).toEqual([1000, 5000]);
});

test('logout, user changes, new sessions and unmount cancel pending reporting', async () => {
  for (const next of [null, { ...session, userId: 'another-user' }, { ...session, sessionId: 'another-session' }]) {
    let sent = false;
    expect(await deliverHubEntry({ ...session, visitId: id1 }, { isActive: () => true, getSession: async () => next,
      sleep: async () => {}, send: async () => { sent = true; return 204; } })).toBe('cancelled');
    expect(sent).toBe(false);
  }
  expect(await deliverHubEntry({ ...session, visitId: id1 }, { isActive: () => false, getSession: async () => session,
    sleep: async () => {}, send: async () => { throw new Error('must not send'); } })).toBe('cancelled');
});

test('authorization failures are not retried and persistent failures are bounded', async () => {
  for (const status of [401, 403, 404, 503]) {
    let calls = 0;
    expect(await deliverHubEntry({ ...session, visitId: id1 }, { isActive: () => true, getSession: async () => session,
      sleep: async () => {}, send: async () => { calls++; return status; } })).toBe('failed');
    expect(calls).toBe(status === 503 ? 3 : 1);
  }
});

test('storage and integration preserve the server-only boundary', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261108225217_hub_entry_events.sql', import.meta.url), 'utf8');
  expect(migration).toContain('unique (user_id, visit_id)');
  expect(migration).toContain('enable row level security');
  expect(migration).toContain('revoke all on public.hub_entry_events from public, anon, authenticated, service_role');
  expect(migration).toContain('grant select, insert on public.hub_entry_events to service_role');
  expect(migration).toContain('default clock_timestamp()');
  const root = await readFile(new URL('../src/routes/index.tsx', import.meta.url), 'utf8');
  expect(root).toContain('<AuthGate>\n        <HubEntryTracker />');
  const tracker = await readFile(new URL('../src/components/HubEntryTracker.tsx', import.meta.url), 'utf8');
  expect(tracker).toContain('window.self !== window.top');
  expect(tracker).not.toContain('onAuthStateChange');
  expect(tracker).not.toContain('service_role');
  const consent = await readFile(new URL('../src/routes/[.]lovable.oauth.consent.tsx', import.meta.url), 'utf8');
  expect(consent).not.toContain('HubEntryTracker');
  expect(HUB_ENTRY_STORAGE_KEY).toBe('adereso:hub-entry:v1');
});
