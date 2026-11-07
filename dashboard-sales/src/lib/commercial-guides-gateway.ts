import { readTicket } from './hub-gateway';
import { isCommercialGuide } from './commercial-guides';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
export function createCommercialGuidesGateway(deps: {
  verify: (token: string, trust?: string) => Promise<{ expiresAt: number } | null>;
  read: (guide: 'playbook' | 'operativa') => Promise<unknown>;
}) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url); if (url.pathname !== '/api/guides/content') return null;
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    const ticket = readTicket(request); if (!ticket) return json({ error: 'authentication_required' }, 401);
    const identity = await deps.verify(ticket.accessToken, ticket.trustToken);
    if (!identity || identity.expiresAt <= Date.now()) return json({ error: 'authentication_required' }, 401);
    const guide = url.searchParams.get('guide'); if (!isCommercialGuide(guide)) return json({ error: 'guide_not_allowed' }, 400);
    try { return json(await deps.read(guide)); } catch { return json({ error: 'guide_unavailable' }, 503); }
  };
}
