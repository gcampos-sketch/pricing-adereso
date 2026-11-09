import { isReportPhase, type ReportPhase } from './report-phases';

type StreamDependencies = {
  authorize: (token: string, trust?: string) => Promise<{ expiresAt: number } | null>;
  load: (role: 'AE' | 'KAM' | undefined, phase: (value: ReportPhase) => void) => Promise<unknown>;
  publicOrigin?: string | undefined;
};
const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff' };

/** Each request owns its stream; there is no shared promise or cross-user progress state. */
export function createPulseStream(deps: StreamDependencies) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (url.pathname !== '/api/reports/pulse-stream') return null;
    const fail = (status: number, error: string) => Response.json({ error }, { status, headers });
    if (request.method !== 'POST') return fail(405, 'method_not_allowed');
    if (request.headers.get('origin') !== (deps.publicOrigin ?? url.origin)) return fail(403, 'origin_not_allowed');
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if (!token || token.length > 6000) return fail(401, 'authentication_required');
    const identity = await deps.authorize(token, request.headers.get('x-mfa-trust') || undefined);
    if (!identity || !Number.isFinite(identity.expiresAt) || identity.expiresAt <= Date.now()) return fail(401, 'authentication_required');
    let role: 'AE' | 'KAM' | undefined;
    try {
      if (Number(request.headers.get('content-length')) > 128) return fail(400, 'invalid_request');
      const reader = request.body?.getReader(); let bytes = 0, raw = ''; const decoder = new TextDecoder();
      if (reader) try {
        while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 128) { await reader.cancel(); return fail(400, 'invalid_request'); } raw += decoder.decode(chunk.value, { stream: true }); }
        raw += decoder.decode();
      } finally { reader.releaseLock(); }
      const input = JSON.parse(raw);
      if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key => key !== 'role')) return fail(400, 'invalid_request');
      if (input.role != null && input.role !== 'AE' && input.role !== 'KAM') return fail(400, 'invalid_role');
      role = input.role ?? undefined;
    } catch { return fail(400, 'invalid_request'); }
    const encoder = new TextEncoder(); let closed = false;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (packet: unknown) => { if (!closed) try { controller.enqueue(encoder.encode(JSON.stringify(packet) + '\n')); } catch { closed = true; } };
        const abort = () => { if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } } };
        request.signal.addEventListener('abort', abort, { once: true });
        try {
          if (request.signal.aborted) { abort(); return; }
          const report = await deps.load(role, phase => { if (isReportPhase(phase)) emit({ type: 'phase', phase }); });
          emit({ type: 'result', report });
        } catch { emit({ type: 'error', message: 'No pudimos leer el pipeline en vivo. Intenta de nuevo.' }); }
        finally { request.signal.removeEventListener('abort', abort); if (!closed) { closed = true; controller.close(); } }
      },
      cancel() { closed = true; },
    });
    return new Response(body, { headers: { ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' } });
  };
}

/** Decoder accepts arbitrary network chunk boundaries and never treats a truncated stream as success. */
export async function decodeReportStream<T>(response: Response, phase: (value: ReportPhase) => void): Promise<T> {
  if (!response.ok) throw new Error(response.status === 401 ? 'Invalid token: se requiere una sesión válida' : 'No pudimos consultar el reporte');
  if (!response.body) throw new Error('No se recibió el reporte');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '', report: T | undefined, found = false;
  const line = (value: string) => {
    if (!value.trim()) return;
    const packet = JSON.parse(value);
    if (packet.type === 'phase' && isReportPhase(packet.phase)) phase(packet.phase);
    else if (packet.type === 'error') throw new Error('No pudimos leer el pipeline en vivo. Intenta de nuevo.');
    else if (packet.type === 'result') { if (!packet.report || typeof packet.report !== 'object' || Array.isArray(packet.report)) throw new Error('Reporte inválido'); report = packet.report; found = true; }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let end: number; while ((end = pending.indexOf('\n')) >= 0) { line(pending.slice(0, end)); pending = pending.slice(end + 1); }
      if (done) { line(pending); break; }
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (!found) throw new Error('La consulta terminó sin entregar el reporte');
  return report as T;
}
