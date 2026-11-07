import { HUB_FILES } from './hub-files';

export const HUB_COOKIE = 'adereso_hub_session';
type Ticket = { accessToken: string; trustToken?: string };
type Dependencies = {
  verify: (accessToken: string, trustToken?: string) => Promise<{ expiresAt: number } | null>;
  read: (path: string) => Promise<Uint8Array>;
  now?: () => number;
  publicOrigin?: string | undefined;
};
const failure = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export function readTicket(request: Request): Ticket | null {
  const raw = request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(HUB_COOKIE + '='))?.slice(HUB_COOKIE.length + 1);
  if (!raw || raw.length > 3800) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Ticket;
    if (typeof value.accessToken !== 'string' || !value.accessToken || (value.trustToken !== undefined && typeof value.trustToken !== 'string')) return null;
    return value;
  } catch { return null; }
}

export function createHubGateway(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const secure = url.protocol === 'https:' || process.env['NODE_ENV'] === 'production' ? '; Secure' : '';
    if (url.pathname === '/api/hub/session') {
      if (!['POST', 'DELETE'].includes(request.method)) return failure(405, 'method_not_allowed');
      if (request.headers.get('origin') !== (deps.publicOrigin ?? url.origin)) return failure(403, 'origin_not_allowed');
      if (request.method === 'DELETE') return new Response(null, { status: 204, headers: { 'Set-Cookie': `${HUB_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`, 'Cache-Control': 'no-store' } });
      const accessToken = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
      if (!accessToken || accessToken.length > 6000) return failure(401, 'authentication_required');
      const trustToken = request.headers.get('x-mfa-trust') || undefined;
      const identity = await deps.verify(accessToken, trustToken);
      if (!identity || identity.expiresAt <= now()) return failure(401, 'authentication_required');
      const ticket = encodeURIComponent(JSON.stringify({ accessToken, ...(trustToken ? { trustToken } : {}) }));
      if (ticket.length > 3800) return failure(400, 'session_too_large');
      const age = Math.min(3600, Math.floor((identity.expiresAt - now()) / 1000));
      if (age <= 0) return failure(401, 'authentication_required');
      return new Response(null, { status: 204, headers: { 'Set-Cookie': `${HUB_COOKIE}=${ticket}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`, 'Cache-Control': 'no-store' } });
    }
    if (!url.pathname.startsWith('/hub-content/')) return null;
    let path: string;
    try { path = decodeURIComponent(url.pathname.slice('/hub-content/'.length)); } catch { return failure(404, 'not_found'); }
    if (!Object.hasOwn(HUB_FILES, path)) return failure(404, 'not_found');
    if (!['GET', 'HEAD'].includes(request.method)) return failure(405, 'method_not_allowed');
    const ticket = readTicket(request);
    if (!ticket) return failure(401, 'authentication_required');
    const identity = await deps.verify(ticket.accessToken, ticket.trustToken);
    if (!identity || identity.expiresAt <= now()) return failure(401, 'authentication_required');
    try {
      const bytes = path === 'dashboard-settings.js'
        ? new TextEncoder().encode("window.ADERESO_DASHBOARD_URL = '/?dashboard=1&embedded=hub';\n")
        : await deps.read(path);
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { headers: {
        'Content-Type': HUB_FILES[path]!, 'Cache-Control': 'private, no-store', 'Vary': 'Cookie',
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
      } });
    } catch { return failure(503, 'hub_content_unavailable'); }
  };
}
