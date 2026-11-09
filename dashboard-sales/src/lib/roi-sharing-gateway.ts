import { RoiError, roiEventInput, roiShareInput } from './roi-sharing';
import type { RoiShareInput, RoiEvent, RoiDeal, RoiContact } from './roi-sharing';

export type RoiUser = { userId: string; email: string; expiresAt: number };
export type RoiSharingService = {
 deals: (query: string) => Promise<RoiDeal[]>;
 contacts: (dealId: string) => Promise<RoiContact[]>;
 create: (user: RoiUser, input: RoiShareInput, origin: string) => Promise<unknown>;
 list: (user: RoiUser) => Promise<unknown>;
 event: (input: RoiEvent) => Promise<void>;
};
async function body(request: Request) {
 const reader = request.body?.getReader();
 if (!reader) throw new RoiError(400, 'invalid_input');
 let size = 0, value = ''; const decoder = new TextDecoder();
 while (true) {
  const part = await reader.read(); if (part.done) break;
  size += part.value.length;
  if (size > 16000) { await reader.cancel(); throw new RoiError(413, 'invalid_input'); }
  value += decoder.decode(part.value, { stream: true });
 }
 try { return JSON.parse(value + decoder.decode()); } catch { throw new RoiError(400, 'invalid_input'); }
}
export function createRoiSharingGateway(deps: { authenticate: (request: Request) => Promise<RoiUser | null>; service: RoiSharingService; origin?: string | undefined }) {
 return async (request: Request): Promise<Response | null> => {
  const url = new URL(request.url), publicEvent = url.pathname === '/api/roi/events';
  if (!publicEvent && !url.pathname.startsWith('/api/hub/roi/')) return null;
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
  const route = publicEvent ? 'event' : url.pathname.slice('/api/hub/roi/'.length);
  const methods: Record<string, string> = { deals: 'GET', contacts: 'GET', shares: 'GET', create: 'POST', event: 'POST' };
  if (!Object.hasOwn(methods, route)) return json({ error: 'not_found' }, 404);
  if (request.method !== methods[route]) return json({ error: 'method_not_allowed' }, 405);
  const origin = deps.origin ?? url.origin;
  if (request.method === 'POST' && request.headers.get('origin') !== origin) return json({ error: 'origin_not_allowed' }, 403);
  try {
   if (publicEvent) {
    const parsed = roiEventInput.safeParse(await body(request));
    if (!parsed.success) throw new RoiError(400, 'invalid_input');
    // Capability permits append-only, bounded activity. It never permits reads.
    await deps.service.event(parsed.data);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
   }
   const user = await deps.authenticate(request);
   if (!user || user.expiresAt <= Date.now()) return json({ error: 'authentication_required' }, 401);
   if (route === 'deals') {
    const query = (url.searchParams.get('q') ?? '').trim();
    if (query.length < 2 || query.length > 100) throw new RoiError(400, 'invalid_input');
    return json({ deals: await deps.service.deals(query) });
   }
   if (route === 'contacts') {
    const id = url.searchParams.get('dealId') ?? '';
    if (!/^\d{1,20}$/.test(id)) throw new RoiError(400, 'invalid_input');
    return json({ contacts: await deps.service.contacts(id) });
   }
   if (route === 'shares') return json({ shares: await deps.service.list(user) });
   const parsed = roiShareInput.safeParse(await body(request));
   if (!parsed.success) throw new RoiError(400, 'invalid_input');
   return json(await deps.service.create(user, parsed.data, origin));
  } catch (error) {
   return json({ error: error instanceof RoiError ? error.code : 'roi_unavailable' }, error instanceof RoiError ? error.status : 503);
  }
 };
}
