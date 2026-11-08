import { HUB_ENTRY_ORIGIN, isVisitId } from './hub-entry';

type Identity = { userId: string; expiresAt: number; oauthClientId?: string | undefined; sessionId?: string | undefined };
const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export function createHubEntryGateway(deps: {
  verify: (accessToken: string, trust?: string) => Promise<Identity | null>;
  record: (userId: string, visitId: string, sessionId: string | null) => Promise<void>;
  publicOrigin?: string | undefined;
  now?: (() => number) | undefined;
}) {
  return async (request: Request): Promise<Response | null> => {
    if (new URL(request.url).pathname !== '/api/hub/entries') return null;
    // No fallback to request/forwarded host: local and preview deployments must not create production events.
    if (deps.publicOrigin !== HUB_ENTRY_ORIGIN) return fail(404, 'not_found');
    if (request.method !== 'POST') return fail(405, 'method_not_allowed');
    if (request.headers.get('origin') !== HUB_ENTRY_ORIGIN) return fail(403, 'origin_not_allowed');
    const visitId = request.headers.get('x-hub-visit-id');
    if (!isVisitId(visitId)) return fail(400, 'invalid_visit');
    const accessToken = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!accessToken || accessToken.length > 6000) return fail(401, 'authentication_required');
    try {
      const identity = await deps.verify(accessToken, request.headers.get('x-mfa-trust') || undefined);
      if (!identity?.userId || identity.expiresAt <= (deps.now ?? Date.now)()) return fail(401, 'authentication_required');
      // OAuth clients include the local preview and delegated MCP access, neither is a Hub visit.
      if (identity.oauthClientId) return fail(403, 'native_hub_session_required');
      await deps.record(identity.userId, visitId, identity.sessionId ?? null);
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    } catch { return fail(503, 'entry_recording_unavailable'); }
  };
}
