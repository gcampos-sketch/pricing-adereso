import { WalletError, walletEventInput, walletShareInput } from './wallet-sharing';
import type { WalletShareInput, WalletEvent, WalletDeal, WalletContact } from './wallet-sharing';

export type WalletUser = { userId: string; email: string; expiresAt: number };
export type WalletSharingService = {
 deals: (query: string) => Promise<WalletDeal[]>;
 contacts: (dealId: string) => Promise<WalletContact[]>;
 create: (user: WalletUser, input: WalletShareInput, origin: string) => Promise<unknown>;
 list: (user: WalletUser) => Promise<unknown>;
 event: (input: WalletEvent) => Promise<void>;
};
async function body(request: Request) {
 const reader = request.body?.getReader();
 if (!reader) throw new WalletError(400, 'invalid_input');
 let size = 0, value = ''; const decoder = new TextDecoder();
 while (true) {
  const part = await reader.read(); if (part.done) break;
  size += part.value.length;
  if (size > 16000) { await reader.cancel(); throw new WalletError(413, 'invalid_input'); }
  value += decoder.decode(part.value, { stream: true });
 }
 try { return JSON.parse(value + decoder.decode()); } catch { throw new WalletError(400, 'invalid_input'); }
}
export function createWalletSharingGateway(deps: { authenticate: (request: Request) => Promise<WalletUser | null>; service: WalletSharingService; origin?: string | undefined }) {
 return async (request: Request): Promise<Response | null> => {
  const url = new URL(request.url), publicEvent = url.pathname === '/api/wallet/events';
  if (!publicEvent && !url.pathname.startsWith('/api/hub/wallet/')) return null;
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
  const route = publicEvent ? 'event' : url.pathname.slice('/api/hub/wallet/'.length);
  const methods: Record<string, string> = { deals: 'GET', contacts: 'GET', shares: 'GET', create: 'POST', event: 'POST' };
  if (!Object.hasOwn(methods, route)) return json({ error: 'not_found' }, 404);
  if (request.method !== methods[route]) return json({ error: 'method_not_allowed' }, 405);
  const origin = deps.origin ?? url.origin;
  if (request.method === 'POST' && request.headers.get('origin') !== origin) return json({ error: 'origin_not_allowed' }, 403);
  try {
   if (publicEvent) {
    const parsed = walletEventInput.safeParse(await body(request));
    if (!parsed.success) throw new WalletError(400, 'invalid_input');
    // Capability permits append-only, bounded activity. It never permits reads.
    await deps.service.event(parsed.data);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
   }
   const user = await deps.authenticate(request);
   if (!user || user.expiresAt <= Date.now()) return json({ error: 'authentication_required' }, 401);
   if (route === 'deals') {
    const query = (url.searchParams.get('q') ?? '').trim();
    if (query.length < 2 || query.length > 100) throw new WalletError(400, 'invalid_input');
    return json({ deals: await deps.service.deals(query) });
   }
   if (route === 'contacts') {
    const id = url.searchParams.get('dealId') ?? '';
    if (!/^\d{1,20}$/.test(id)) throw new WalletError(400, 'invalid_input');
    return json({ contacts: await deps.service.contacts(id) });
   }
   if (route === 'shares') return json({ shares: await deps.service.list(user) });
   const parsed = walletShareInput.safeParse(await body(request));
   if (!parsed.success) throw new WalletError(400, 'invalid_input');
   return json(await deps.service.create(user, parsed.data, origin));
  } catch (error) {
   return json({ error: error instanceof WalletError ? error.code : 'wallet_unavailable' }, error instanceof WalletError ? error.status : 503);
  }
 };
}
