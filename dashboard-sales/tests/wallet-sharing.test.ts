import { expect, test } from 'bun:test';
import { createWalletSharingGateway } from '../src/lib/wallet-sharing-gateway';
import type { WalletSharingService } from '../src/lib/wallet-sharing-gateway';
import { walletEventInput, walletLink, walletScenario, walletShareInput, WalletError } from '../src/lib/wallet-sharing';

const origin = 'https://hub.test', token = 'a'.repeat(64);
const user = { userId: 'server-user', email: 'ae@adere.so', expiresAt: Date.now() + 60000 };
export const context = {existing:true,country:'CL' as const,wallet:'recurrente' as const,fee:10,conversations:2000,messagesPerConversation:4,quantities:{service:8000,marketing:0,utility:0,authentication:0,minutes:0},amount:154,manual:false};
const input = { requestId: crypto.randomUUID(), dealId: '123', context };
function setup(identity: typeof user | null = user) {
 const calls: { route: string; value: unknown }[] = [];
 const service: WalletSharingService = {
  deals: async query => { calls.push({ route: 'deals', value: query }); return [{ id: '123', name: 'Empresa' }]; },
  contacts: async id => { calls.push({ route: 'contacts', value: id }); return []; },
  create: async (actor, value, host) => { calls.push({ route: 'create', value: { actor, value } }); return { url: walletLink(host, token, value.context) }; },
  list: async actor => { calls.push({ route: 'list', value: actor }); return []; },
  event: async value => { calls.push({ route: 'event', value }); },
 };
 return { calls, service, handle: createWalletSharingGateway({ authenticate: async () => identity, service, origin }) };
}
const request = (route: string, data?: unknown, host = origin) => new Request(origin + route, { method: data === undefined ? 'GET' : 'POST', headers: { Origin: host, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });

test('link creation requires a deal; identity and CRM titles cannot be injected', () => {
 expect(walletShareInput.safeParse(input).success).toBe(true);
 for (const invalid of [{ ...input, dealId: '' }, { requestId: input.requestId, context }, { ...input, userId: 'victim' }, { ...input, dealName: 'forged' }, { ...input, dealId: '../contacts' }, { ...input, context: { ...context, conversations: Infinity } }]) expect(walletShareInput.safeParse(invalid).success).toBe(false);
});
test('all internal wallet endpoints require current server-verified authentication', async () => {
 for (const identity of [null, { ...user, expiresAt: 0 }]) {
  const { handle, calls } = setup(identity);
  for (const req of [request('/api/hub/wallet/deals?q=empresa'), request('/api/hub/wallet/contacts?dealId=123'), request('/api/hub/wallet/shares'), request('/api/hub/wallet/create', input)]) expect((await handle(req))?.status).toBe(401);
  expect(calls).toHaveLength(0);
 }
});
test('private operations use server identity, exact deal IDs and no-cache responses', async () => {
 const { handle, calls } = setup();
 const result = await handle(request('/api/hub/wallet/create', input));
 expect(result?.status).toBe(200);
 expect(result?.headers.get('cache-control')).toContain('no-store');
 expect(calls[0]?.value).toEqual({ actor: user, value: input });
 const link = new URL((await result?.json()).url);
 expect(link.pathname).toBe('/billetera-meta/');expect([...link.searchParams.keys()].sort()).toEqual(['c','w']);expect(JSON.parse(link.searchParams.get('c')!)).toEqual(context);
 expect(link.href).not.toContain('123'); expect(link.href).not.toContain('adere.so');
 await handle(request('/api/hub/wallet/shares')); expect(calls[1]).toEqual({ route:'list', value: user });
});
test('invalid origin, methods, oversized bodies and invalid IDs fail before writes', async () => {
 const { handle, calls } = setup();
 expect((await handle(request('/api/hub/wallet/create',input,'https://attacker.test')))?.status).toBe(403);
 expect((await handle(request('/api/hub/wallet/create')))?.status).toBe(405);
 expect((await handle(request('/api/hub/wallet/create',{...input,extra:'x'.repeat(17000)})))?.status).toBe(413);
 expect((await handle(request('/api/hub/wallet/contacts?dealId=abc')))?.status).toBe(400);
 expect((await handle(request('/api/hub/wallet/deals?q=a')))?.status).toBe(400);
 expect(calls).toHaveLength(0);
});
test('public activity is append-only, same-origin and accepts no CRM/private fields', async () => {
 const { handle, calls } = setup(null);
 const event = { token, sessionId: crypto.randomUUID(), sequence: 0, kind: 'open', scenario: null };
 expect((await handle(request('/api/wallet/events',event)))?.status).toBe(204);
 expect(calls).toEqual([{ route:'event', value:event }]);
 expect((await handle(request('/api/wallet/events')))?.status).toBe(405);
 expect((await handle(request('/api/wallet/events',event,'https://attacker.test')))?.status).toBe(403);
 for (const invalid of [{...event,token:'guess'},{...event,email:'customer@example.com'},{...event,sequence:501},{...event,kind:'scenario'}]) expect((await handle(request('/api/wallet/events',invalid)))?.status).toBe(400);
 expect(calls).toHaveLength(1);
});
test('scenarios contain only bounded wallet inputs and observed totals', () => {
 const scenario={context,meta:140,fee:14,estimated:154};
 expect(walletScenario.safeParse(scenario).success).toBe(true);
 for(const invalid of [{...scenario,email:'client@test'},{...scenario,context:{...context,country:'XX'}},{...scenario,context:{...context,fee:21}},{...scenario,context:{...context,quantities:{...context.quantities,notes:'private'}}},{...scenario,estimated:Infinity}])expect(walletScenario.safeParse(invalid).success).toBe(false);
 expect(walletEventInput.safeParse({token,sessionId:crypto.randomUUID(),sequence:1,kind:'scenario',scenario}).success).toBe(true);
});
test('storage failure and expired links are explicit and never presented as successful writes', async () => {
 const { handle, service } = setup();
 service.create = async () => { throw new Error('storage offline'); };
 expect((await handle(request('/api/hub/wallet/create',input)))?.status).toBe(503);
 service.event = async () => { throw new WalletError(404,'link_unavailable'); };
 expect((await handle(request('/api/wallet/events',{token,sessionId:crypto.randomUUID(),sequence:0,kind:'open',scenario:null})))?.status).toBe(404);
});
