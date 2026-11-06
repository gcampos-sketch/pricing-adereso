/** Public presentation only: reuse the current Partners template, never the Hub shell. */
const ASSETS: Record<string, string> = {
  'brand-system.css': 'text/css; charset=utf-8',
  'chapter-index.js': 'text/javascript; charset=utf-8',
  'logoadereso.webp': 'image/webp',
};
export function partnerDocument(hub: string): string {
  const opening = '<template id="ppTpl">';
  const start = hub.indexOf(opening);
  const end = hub.indexOf('</template>', start + opening.length);
  if (start < 0 || end < 0 || hub.indexOf(opening, start + opening.length) !== -1) throw new Error('Partners presentation unavailable');
  const template = hub.slice(start + opening.length, end);
  if (!template.includes('<head>') || !template.includes('</body>')) throw new Error('Partners presentation incomplete');
  return '<!DOCTYPE html><html lang="es">' + template.replace('<head>', '<head><base href="/partners/">') + '</html>';
}
export function createPartnerPublicGateway(read: (path: string) => Promise<Uint8Array>) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (url.pathname !== '/partners' && !url.pathname.startsWith('/partners/')) return null;
    const fail = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
    if (!['GET', 'HEAD'].includes(request.method)) return fail(405);
    if (url.pathname === '/partners') return new Response(null, { status: 308, headers: { Location: '/partners/' + url.search, 'Cache-Control': 'no-store' } });
    const path = url.pathname.slice('/partners/'.length);
    if (path && !Object.hasOwn(ASSETS, path)) return fail(404);
    try {
      const bytes = path ? await read(path) : new TextEncoder().encode(partnerDocument(new TextDecoder().decode(await read('index.html'))));
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { headers: {
        'Content-Type': path ? ASSETS[path]! : 'text/html; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
      } });
    } catch { return fail(503); }
  };
}
