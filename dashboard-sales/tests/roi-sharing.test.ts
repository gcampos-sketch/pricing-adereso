import { expect, test } from 'bun:test';
import { createRoiSharingGateway } from '../src/lib/roi-sharing-gateway';
import type { RoiSharingService } from '../src/lib/roi-sharing-gateway';
import { roiEventInput, roiLink, roiScenario, roiShareInput, RoiError } from '../src/lib/roi-sharing';

const origin = 'https://hub.test', token = 'a'.repeat(64);
const user = { userId: 'server-user', email: 'ae@adere.so', expiresAt: Date.now() + 60000 };
const context = { mensualidad: 558, volumen: 2000, plantilla: 0.1 };
const input = { requestId: crypto.randomUUID(), dealId: '123', context };
function setup(identity: typeof user | null = user) {
 const calls: { route: string; value: unknown }[] = [];
 const service: RoiSharingService = {
  deals: async query => { calls.push({ route: 'deals', value: query }); return [{ id: '123', name: 'Empresa' }]; },
  contacts: async id => { calls.push({ route: 'contacts', value: id }); return []; },
  create: async (actor, value, host) => { calls.push({ route: 'create', value: { actor, value } }); return { url: roiLink(host, token, value.context) }; },
  list: async actor => { calls.push({ route: 'list', value: actor }); return []; },
  event: async value => { calls.push({ route: 'event', value }); },
 };
 return { calls, service, handle: createRoiSharingGateway({ authenticate: async () => identity, service, origin }) };
}
const request = (route: string, data?: unknown, host = origin) => new Request(origin + route, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: host, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });

test('link creation requires a deal; identity and CRM titles cannot be injected', () => {
 expect(roiShareInput.safeParse(input).success).toBe(true);
 for (const invalid of [{ ...input, dealId: '' }, { requestId: input.requestId, context }, { ...input, userId: 'victim' }, { ...input, dealName: 'forged' }, { ...input, dealId: '../contacts' }, { ...input, context: { ...context, volumen: Infinity } }]) expect(roiShareInput.safeParse(invalid).success).toBe(false);
});
test('all internal ROI endpoints require current server-verified authentication', async () => {
 for (const identity of [null, { ...user, expiresAt: 0 }]) {
  const { handle, calls } = setup(identity);
  for (const req of [request('/api/hub/roi/deals?q=empresa'), request('/api/hub/roi/contacts?dealId=123'), request('/api/hub/roi/shares'), request('/api/hub/roi/create', input)]) expect((await handle(req))?.status).toBe(401);
  expect(calls).toHaveLength(0);
 }
});
test('private operations use server identity, exact deal IDs and no-cache responses', async () => {
 const { handle, calls } = setup();
 const result = await handle(request('/api/hub/roi/create', input));
 expect(result?.status).toBe(200);
 expect(result?.headers.get('cache-control')).toContain('no-store');
 expect(calls[0]?.value).toEqual({ actor: user, value: input });
 const link = new URL((await result?.json()).url);
 expect([...link.searchParams.keys()].sort()).toEqual(['mensualidad','plantilla','r','volumen']);
 expect(link.href).not.toContain('123'); expect(link.href).not.toContain('adere.so');
 await handle(request('/api/hub/roi/shares')); expect(calls[1]).toEqual({ route:'list', value: user });
});
test('invalid origin, methods, oversized bodies and invalid IDs fail before writes', async () => {
 const { handle, calls } = setup();
 expect((await handle(request('/api/hub/roi/create',input,'https://attacker.test')))?.status).toBe(403);
 expect((await handle(request('/api/hub/roi/create')))?.status).toBe(405);
 expect((await handle(request('/api/hub/roi/create',{...input,extra:'x'.repeat(17000)})))?.status).toBe(413);
 expect((await handle(request('/api/hub/roi/contacts?dealId=abc')))?.status).toBe(400);
 expect((await handle(request('/api/hub/roi/deals?q=a')))?.status).toBe(400);
 expect(calls).toHaveLength(0);
});
test('public activity is append-only, same-origin and accepts no CRM/private fields', async () => {
 const { handle, calls } = setup(null);
 const event = { token, sessionId: crypto.randomUUID(), sequence: 0, kind: 'open', scenario: null };
 expect((await handle(request('/api/roi/events',event)))?.status).toBe(204);
 expect(calls).toEqual([{ route:'event', value:event }]);
 expect((await handle(request('/api/roi/events')))?.status).toBe(405);
 expect((await handle(request('/api/roi/events',event,'https://attacker.test')))?.status).toBe(403);
 for (const invalid of [{...event,token:'guess'},{...event,email:'customer@example.com'},{...event,sequence:501},{...event,kind:'scenario'}]) expect((await handle(request('/api/roi/events',invalid)))?.status).toBe(400);
 expect(calls).toHaveLength(1);
});
test('scenario validation includes numeric inputs for every calculator case without arbitrary text', () => {
 const scenario = { context, gain: 2400, cost: 558, cases: [{ id:'atencion', values:{ consultas:2000,auto:60,minutos:15,ejecutivos:5,costoEmpresa:800 } }] };
 expect(roiScenario.safeParse(scenario).success).toBe(true);
 for (const invalid of [{...scenario,cases:[{id:'unknown',values:{}}]},{...scenario,cases:[{id:'atencion',values:{email:25}}]},{...scenario,cases:[...scenario.cases,...scenario.cases]},{...scenario,gain:Infinity}]) expect(roiScenario.safeParse(invalid).success).toBe(false);
 expect(roiEventInput.safeParse({token,sessionId:crypto.randomUUID(),sequence:1,kind:'scenario',scenario}).success).toBe(true);
});
test('storage failure and expired links are explicit and never presented as successful writes', async () => {
 const { handle, service } = setup();
 service.create = async () => { throw new Error('storage offline'); };
 expect((await handle(request('/api/hub/roi/create',input)))?.status).toBe(503);
 service.event = async () => { throw new RoiError(404,'link_unavailable'); };
 expect((await handle(request('/api/roi/events',{token,sessionId:crypto.randomUUID(),sequence:0,kind:'open',scenario:null})))?.status).toBe(404);
});
