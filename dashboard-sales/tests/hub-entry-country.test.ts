import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createHubCountryProbeClaims, probeHubEntryCountry, HUB_SUPABASE_ORIGIN, HUB_COUNTRY_PROBE_CLIENT, HUB_COUNTRY_PROBE_STORAGE_KEY } from '../src/lib/hub-entry-country-probe';
import { assessHubEntryCountry, countryCode, countryLogFromProviderRow, logTime, resolveHubEntryCountry, type HubCountryLog, type CountryEvidence } from '../src/lib/hub-entry-country';
import { createHubEntryGateway } from '../src/lib/hub-entry-gateway';
import { HUB_ENTRY_ORIGIN } from '../src/lib/hub-entry';

const visitId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const logId = '33333333-3333-4333-8333-333333333333';
const entry = { userId: 'verified-user', sessionId, visitId, enteredAt: '2026-11-08T22:00:00Z' };
const goodLog: HubCountryLog = { id: logId, timestamp: '2026-11-08T22:00:00.123000', source: 'edge_logs', host: new URL(HUB_SUPABASE_ORIGIN).host,
  path: '/auth/v1/user', method: 'GET', status: 200, userId: entry.userId, sessionId, role: 'authenticated',
  search: '?hub_entry_visit=' + visitId, clientInfo: HUB_COUNTRY_PROBE_CLIENT, country: 'CL' };
const probeOptions = { supabaseUrl: HUB_SUPABASE_ORIGIN, publishableKey: 'sb_publishable_test', accessToken: 'test-token', visitId };
const evidence = (countryCodes: string[], state: CountryEvidence['state'] = 'observed'): CountryEvidence => ({ countryCodes, state, sourceLogIds: [logId] });

test('reload does not probe a later country for the original entry, and probe state stores only a visit ID', () => {
  const stored: Record<string, string> = {};
  const storage = { getItem: (key: string) => stored[key] ?? null, setItem: (key: string, value: string) => { stored[key] = value; } };
  const first = createHubCountryProbeClaims(storage);
  expect(first(visitId)).toBe(true);
  expect(first(visitId)).toBe(false);
  const reloadAfterVpnChange = createHubCountryProbeClaims(storage);
  expect(reloadAfterVpnChange(visitId)).toBe(false);
  expect(stored).toEqual({ [HUB_COUNTRY_PROBE_STORAGE_KEY]: visitId });
  expect(reloadAfterVpnChange(logId)).toBe(true);
  const blocked = createHubCountryProbeClaims({ getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } });
  expect(blocked(visitId)).toBe(true);
  expect(blocked(visitId)).toBe(false);
});

test('the provider adapter ignores spoofable country and identity headers', () => {
  const projected = countryLogFromProviderRow({ id: logId, timestamp: goodLog.timestamp, source: 'edge_logs', log_attributes: {
    'request.cf.country': 'CL', 'request.headers.cf_ipcountry': 'NL', 'request.headers.cf-ipcountry': 'US',
    'request.sb.auth_user': entry.userId, 'request.sb.jwt.authorization.payload.session_id': sessionId,
    'request.headers.user_id': 'forged', 'request.headers.session_id': 'forged', 'response.status_code': '200',
  } });
  expect(projected.country).toBe('CL');
  expect(projected.userId).toBe(entry.userId);
  expect(projected.sessionId).toBe(sessionId);
  expect(projected.status).toBe(200);
  expect(countryLogFromProviderRow({ id: logId, timestamp: goodLog.timestamp, source: 'edge_logs', log_attributes: { 'request.headers.cf_ipcountry': 'NL' } }).country).toBe('');
});

test('the country probe uses only the fixed existing Supabase provider and allowlisted metadata', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const ok = await probeHubEntryCountry({ ...probeOptions, fetcher: (async (input, init) => {
    calls.push({ url: String(input), init }); return new Response(null, { status: 200 });
  }) as typeof fetch });
  expect(ok).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe(HUB_SUPABASE_ORIGIN + '/auth/v1/user?hub_entry_visit=' + visitId);
  expect(calls[0]!.init?.method).toBe('GET');
  expect(calls[0]!.init?.redirect).toBe('error');
  expect(calls[0]!.init?.credentials).toBe('omit');
  expect(calls[0]!.init?.body).toBeUndefined();
  expect(new Headers(calls[0]!.init?.headers).get('x-client-info')).toBe(HUB_COUNTRY_PROBE_CLIENT);
  expect(new Headers(calls[0]!.init?.headers).get('authorization')).toBe('Bearer test-token');
  expect(calls[0]!.url).not.toContain('test-token');
});

test('country probing refuses other projects, redirects, private keys and malformed visits before sending', async () => {
  const anon = 'header.' + btoa(JSON.stringify({ role: 'anon' })) + '.signature';
  const service = 'header.' + btoa(JSON.stringify({ role: 'service_role' })) + '.signature';
  const invalids = [
    { supabaseUrl: undefined }, { supabaseUrl: 'https://other-project.supabase.co' }, { supabaseUrl: 'http://nsflqsdtfmnuangezsid.supabase.co' },
    { supabaseUrl: HUB_SUPABASE_ORIGIN + '/proxy' }, { supabaseUrl: HUB_SUPABASE_ORIGIN + '?url=other' },
    { supabaseUrl: HUB_SUPABASE_ORIGIN.replace('https://', 'https://user:password@') },
    { publishableKey: undefined }, { publishableKey: 'sb_secret_test' }, { publishableKey: service }, { publishableKey: 'broken' }, { visitId: 'invalid' },
  ];
  let calls = 0;
  const fetcher = (async () => { calls++; return new Response(null, { status: 200 }); }) as typeof fetch;
  for (const invalid of invalids) expect(await probeHubEntryCountry({ ...probeOptions, ...invalid, fetcher })).toBe(false);
  expect(calls).toBe(0);
  expect(await probeHubEntryCountry({ ...probeOptions, publishableKey: anon, fetcher })).toBe(true);
});

test('probe errors or non-success cannot become observed countries', async () => {
  for (const status of [301, 401, 403, 429, 500]) expect(await probeHubEntryCountry({ ...probeOptions,
    fetcher: (async () => new Response(null, { status })) as typeof fetch })).toBe(false);
  expect(await probeHubEntryCountry({ ...probeOptions, fetcher: (async () => { throw new Error('timeout'); }) as typeof fetch })).toBe(false);
});

test('provider-owned evidence correlates exact visit, authenticated user and verified session', () => {
  expect(resolveHubEntryCountry(entry, [goodLog, goodLog], true)).toEqual({ state: 'observed', countryCodes: ['CL'], sourceLogIds: [logId] });
  expect(logTime(goodLog.timestamp)).toBe(Date.parse('2026-11-08T22:00:00.123Z'));
  expect(countryCode('nl')).toBe('NL');
  for (const value of ['XX', 'T1', 'ZZ', '', 'Chile', null, 3]) expect(countryCode(value)).toBeNull();
});

test('foreign, unauthenticated, failed, stale and forged-marker requests do not establish location', () => {
  const invalids: Partial<HubCountryLog>[] = [
    { source: 'auth_logs' }, { host: 'other.supabase.co' }, { path: '/rest/v1/hub_entry_events' }, { method: 'POST' }, { status: 401 },
    { userId: 'another-user' }, { sessionId: 'another-session' }, { role: 'anon' }, { clientInfo: 'browser-claimed-country-CL' },
    { search: '?hub_entry_visit=another-visit' }, { search: '?hub_entry_visit=' + visitId + '&hub_entry_visit=' + visitId },
    { timestamp: '2026-11-08T21:54:59Z' }, { timestamp: '2026-11-08T22:02:01Z' }, { timestamp: 'invalid' }, { id: '-'.repeat(36) },
  ];
  for (const invalid of invalids) expect(resolveHubEntryCountry(entry, [{ ...goodLog, ...invalid }], true)).toEqual({ state: 'unknown', countryCodes: [], sourceLogIds: [] });
  expect(resolveHubEntryCountry({ ...entry, sessionId: null }, [goodLog], true).state).toBe('unknown');
});

test('missing, Tor, conflicting and incomplete observations stay explicit', () => {
  expect(resolveHubEntryCountry(entry, [], true).state).toBe('unknown');
  for (const country of ['', 'XX', 'T1', 'ZZ']) expect(resolveHubEntryCountry(entry, [{ ...goodLog, country }], true)).toEqual({ state: 'unknown', countryCodes: [], sourceLogIds: [logId] });
  expect(resolveHubEntryCountry(entry, [goodLog, { ...goodLog, country: 'NL' }], true)).toEqual({ state: 'multiple', countryCodes: ['CL', 'NL'], sourceLogIds: [logId] });
  expect(resolveHubEntryCountry(entry, [goodLog], false).state).toBe('incomplete');
  expect(resolveHubEntryCountry(entry, [goodLog, { ...goodLog, country: 'XX' }], true).state).toBe('unknown');
});

test('country exceptions are exact-account policies, never a global allowance', () => {
  const policies = [{ email: 'exception@example.test', expectedCountry: 'NL' }, { email: 'chile@example.test', expectedCountry: 'CL' }];
  expect(assessHubEntryCountry('EXCEPTION@example.test', policies, evidence(['NL'])).state).toBe('expected');
  expect(assessHubEntryCountry('chile@example.test', policies, evidence(['NL']))).toEqual({ state: 'unusual_country', alert: true, expectedCountry: 'CL', unexpectedCountries: ['NL'] });
  expect(assessHubEntryCountry('exception@example.test', policies, evidence(['CL'])).alert).toBe(true);
  expect(assessHubEntryCountry('new@example.test', policies, evidence(['US'])).state).toBe('unconfigured');
  expect(assessHubEntryCountry('chile@example.test', [...policies, policies[1]!], evidence(['US'])).state).toBe('unconfigured');
});

test('unknown evidence is not normal or a foreign-country alert, while positive foreign evidence survives partial reads', () => {
  const policy = [{ email: 'chile@example.test', expectedCountry: 'CL' }];
  for (const e of [evidence([], 'unknown'), evidence(['CL'], 'incomplete'), evidence(['CL'], 'unknown'), evidence(['ZZ'])]) {
    expect(assessHubEntryCountry('chile@example.test', policy, e)).toEqual({ state: 'unknown', alert: false, expectedCountry: 'CL', unexpectedCountries: [] });
  }
  expect(assessHubEntryCountry('chile@example.test', policy, evidence(['CL', 'US'], 'incomplete')).alert).toBe(true);
});

test('the entry stores session from verified claims and ignores client geography and identity', async () => {
  const writes: unknown[][] = [];
  const gateway = createHubEntryGateway({ publicOrigin: HUB_ENTRY_ORIGIN, now: () => 1000,
    verify: async () => ({ userId: entry.userId, expiresAt: 2000, sessionId }), record: async (...args) => { writes.push(args); } });
  const result = await gateway(new Request(HUB_ENTRY_ORIGIN + '/api/hub/entries', { method: 'POST', headers: {
    origin: HUB_ENTRY_ORIGIN, authorization: 'Bearer test', 'x-hub-visit-id': visitId, 'cf-ipcountry': 'NL', 'x-forwarded-for': '203.0.113.1',
  }, body: JSON.stringify({ session_id: 'forged', country: 'NL', user_id: 'forged' }) }));
  expect(result?.status).toBe(204);
  expect(writes).toEqual([[entry.userId, visitId, sessionId]]);
});

test('private storage contains no roster, IP, tokens or browser access; probe never blocks the event', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261108225217_hub_entry_events.sql', import.meta.url), 'utf8');
  for (const table of ['hub_entry_events', 'hub_entry_country_expectations', 'hub_entry_country_assessments']) {
    expect(migration).toContain(`alter table public.${table} enable row level security`);
    expect(migration).toContain(`revoke all on public.${table} from public, anon, authenticated, service_role`);
  }
  expect(migration).not.toMatch(/\b(?:ip_address|access_token|refresh_token)\s+(?:text|inet)/);
  expect(migration).not.toMatch(/[a-z]+@adere\.so/);
  const tracker = await readFile(new URL('../src/components/HubEntryTracker.tsx', import.meta.url), 'utf8');
  expect(tracker).toContain('void probeHubEntryCountry(');
  expect(tracker).not.toContain('await probeHubEntryCountry(');
});
