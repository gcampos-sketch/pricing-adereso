import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readTicket } from './hub-gateway';
import type { AcademySource } from './academy-content';

export type AcademyGatewayDependencies = {
  verify: (token: string, trust?: string) => Promise<{ expiresAt: number } | null>;
  read: () => Promise<unknown>;
  run: () => Promise<unknown>;
  enqueue: (source: AcademySource) => Promise<void>;
  syncSecret?: string | undefined; webhookSecret?: string | undefined;
  notionIntegrationId?: string | undefined; notionWorkspaceId?: string | undefined;
  setupEnabled?: boolean; captureSetup?: (token: string) => Promise<void>; readSetup?: () => Promise<unknown>;
};
function sameSecret(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff',
} });
export function createAcademyGateway(deps: AcademyGatewayDependencies) {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (!['/api/academy/content', '/api/academy/sync', '/api/academy/notion-webhook', '/api/academy/notion-setup'].includes(path)) return null;
    if (request.method !== (path.endsWith('/content') ? 'GET' : 'POST')) return json({ error: 'method_not_allowed' }, 405);
    if (path.endsWith('/content')) {
      const ticket = readTicket(request);
      if (!ticket) return json({ error: 'authentication_required' }, 401);
      const identity = await deps.verify(ticket.accessToken, ticket.trustToken);
      if (!identity || identity.expiresAt <= Date.now()) return json({ error: 'authentication_required' }, 401);
      try { return json(await deps.read()); } catch { return json({ error: 'academy_unavailable' }, 503); }
    }
    if (path.endsWith('/sync') || path.endsWith('/notion-setup')) {
      if (!deps.syncSecret || deps.syncSecret.length < 32) return json({ error: 'sync_not_configured' }, 503);
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
      if (!token || !sameSecret(token, deps.syncSecret)) return json({ error: 'unauthorized' }, 401);
      try {
        if (path.endsWith('/notion-setup')) {
          if (!deps.setupEnabled || !deps.readSetup) return json({ error: 'setup_disabled' }, 503);
          return json(await deps.readSetup());
        }
        return json(await deps.run());
      } catch { return json({ error: 'sync_failed' }, 503); }
    }
    if (Number(request.headers.get('content-length')) > 64_000) return json({ error: 'payload_too_large' }, 413);
    const reader = request.body?.getReader(); if (!reader) return json({ error: 'invalid_event' }, 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length;
        if (bytes > 64_000) return json({ error: 'payload_too_large' }, 413); chunks.push(value); }
    } finally { await reader.cancel(); }
    const raw = Buffer.concat(chunks).toString('utf8');
    // A quarantined setup candidate never becomes a signing key automatically.
    // An operator retrieves it with the sync secret, verifies it in Notion, then configures it.
    if (!deps.webhookSecret) {
      if (!deps.setupEnabled || !deps.captureSetup) return json({ error: 'webhook_not_configured' }, 503);
      let candidate: any; try { candidate = JSON.parse(raw); } catch { return json({ error: 'invalid_event' }, 400); }
      if (typeof candidate.verification_token !== 'string' || !/^secret_[A-Za-z0-9_-]{20,180}$/.test(candidate.verification_token)) return json({ error: 'invalid_verification' }, 400);
      try { await deps.captureSetup(candidate.verification_token); return json({ received: true }); } catch { return json({ error: 'setup_unavailable' }, 503); }
    }
    if (!deps.notionIntegrationId || !deps.notionWorkspaceId) return json({ error: 'webhook_not_configured' }, 503);
    const signature = request.headers.get('x-notion-signature') ?? '';
    const expected = 'sha256=' + createHmac('sha256', deps.webhookSecret).update(raw).digest('hex');
    if (!/^sha256=[a-f0-9]{64}$/.test(signature) || !sameSecret(signature, expected)) return json({ error: 'invalid_signature' }, 401);
    let event: any; try { event = JSON.parse(raw); } catch { return json({ error: 'invalid_event' }, 400); }
    if (event.integration_id !== deps.notionIntegrationId || event.workspace_id !== deps.notionWorkspaceId ||
      typeof event.id !== 'string' || typeof event.timestamp !== 'string' || !Number.isFinite(Date.parse(event.timestamp)) ||
      Math.abs(Date.now() - Date.parse(event.timestamp)) > 86_400_000) return json({ error: 'invalid_event' }, 400);
    if (!['page.created','page.content_updated','page.properties_updated','page.deleted','page.undeleted','page.moved'].includes(event.type)) return json({ accepted: false });
    // Events are dirty signals only: callers cannot add source URLs or choose a Notion root.
    try { await deps.enqueue('notion'); return json({ queued: true }, 202); } catch { return json({ error: 'queue_unavailable' }, 503); }
  };
}
