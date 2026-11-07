import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createAcademyGateway } from '../src/lib/academy-gateway';
import { HUB_COOKIE } from '../src/lib/hub-gateway';
import { ACADEMY_WIKI_ID, validSourceUrl } from '../src/lib/academy-content';
import { fetchHelpSnapshot, fetchNotionSnapshot, limitedFetch, parseHelpArticle, parseHelpSitemap } from '../src/lib/academy-fetch.server';

const origin = 'https://hub.example.test', secret = 'scheduler-secret-32-characters-long';
const cookie = `${HUB_COOKIE}=${encodeURIComponent(JSON.stringify({ accessToken: 'valid', trustToken: 'trusted' }))}`;
function setup() {
  let reads = 0, runs = 0, queued = 0, captured = '';
  const gateway = createAcademyGateway({
    verify: async (token, trust) => token === 'valid' && trust === 'trusted' ? { expiresAt: Date.now() + 60_000 } : null,
    read: async () => { reads++; return { private: 'wiki-content' }; },
    run: async () => { runs++; return { done: true }; }, enqueue: async () => { queued++; },
    syncSecret: secret, webhookSecret: 'notion-webhook-key', notionIntegrationId: 'integration', notionWorkspaceId: 'workspace',
    captureSetup: async token => { captured = token; }, readSetup: async () => ({ captured }),
  });
  return { gateway, counts: () => ({ reads, runs, queued }) };
}
describe('private Academy and independent worker authentication', () => {
  test('anonymous, forged and expired sessions cannot read internal source text', async () => {
    const { gateway, counts } = setup();
    for (const headers of [{}, { cookie: 'adereso_hub_session=true' }, { authorization: 'Bearer ' + secret }]) {
      expect((await gateway(new Request(origin + '/api/academy/content', { headers })))?.status).toBe(401);
    }
    expect(counts().reads).toBe(0);
    const response = await gateway(new Request(origin + '/api/academy/content', { headers: { cookie } }));
    expect(response?.status).toBe(200); expect(response?.headers.get('cache-control')).toBe('private, no-store');
    expect(await response?.text()).toContain('wiki-content');
    const expired = createAcademyGateway({ verify: async () => ({ expiresAt: Date.now() - 1 }), read: async () => { throw Error('must not read'); }, run: async () => ({}), enqueue: async () => {} });
    expect((await expired(new Request(origin + '/api/academy/content', { headers: { cookie } })))?.status).toBe(401);
  });
  test('a corporate session does not authorize the sync or bootstrap secret endpoint', async () => {
    const { gateway, counts } = setup();
    for (const path of ['/api/academy/sync','/api/academy/notion-setup']) {
      expect((await gateway(new Request(origin + path, { method: 'POST', headers: { cookie } })))?.status).toBe(401);
    }
    expect(counts().runs).toBe(0);
    expect((await gateway(new Request(origin + '/api/academy/sync', { method: 'POST', headers: { authorization: 'Bearer ' + secret } })))?.status).toBe(200);
    expect(counts().runs).toBe(1);
    expect((await gateway(new Request(origin + '/api/academy/sync')))?.status).toBe(405);
  });
});
describe('Notion events only enqueue the fixed source', () => {
  function event(overrides = {}) { return JSON.stringify({ id: 'event', integration_id: 'integration', workspace_id: 'workspace', timestamp: new Date().toISOString(), type: 'page.content_updated', entity: { id: 'unrelated-page' }, ...overrides }); }
  function request(raw: string, signed = true) {
    return new Request(origin + '/api/academy/notion-webhook', { method: 'POST', headers: signed ? { 'x-notion-signature': 'sha256=' + createHmac('sha256','notion-webhook-key').update(raw).digest('hex') } : {}, body: raw });
  }
  test('rejects unsigned, tampered, cross-workspace and stale events before queue writes', async () => {
    const { gateway, counts } = setup();
    expect((await gateway(request(event(),false)))?.status).toBe(401);
    for (const raw of [event({ workspace_id: 'other' }),event({ integration_id: 'other' }),event({ timestamp: '2020-01-01' })]) expect((await gateway(request(raw)))?.status).toBe(400);
    expect(counts().queued).toBe(0);
    const raw = event(); const changed = request(raw); const bad = new Request(changed, { body: raw + ' ' });
    expect((await gateway(bad))?.status).toBe(401);
    expect((await gateway(request(raw)))?.status).toBe(202); expect(counts().queued).toBe(1);
  });
  test('size limits are enforced without trusting content-length', async () => {
    const { gateway, counts } = setup();
    expect((await gateway(request(' '.repeat(64_001))))?.status).toBe(413); expect(counts().queued).toBe(0);
  });
  test('unsigned bootstrap is quarantined, opt-in, and never authorizes an event', async () => {
    let captured = '', queued = false;
    const gateway = createAcademyGateway({ verify: async () => null, read: async () => ({}), run: async () => ({}), enqueue: async () => { queued = true; },
      setupEnabled: true, captureSetup: async token => { captured = token; }, syncSecret: secret });
    const token = 'secret_' + 'a'.repeat(30);
    const response = await gateway(request(JSON.stringify({ verification_token: token }),false));
    expect(response?.status).toBe(200); expect(await response?.text()).not.toContain(token); expect(captured).toBe(token); expect(queued).toBe(false);
    expect((await gateway(request(event())))?.status).toBe(400); expect(queued).toBe(false);
  });
});
const article = (text: string) => `<script type="application/ld+json">${JSON.stringify({ '@type':'Article', headline:'Topes de asignación', dateModified:'2026-10-21' })}</script><nav>Global navigation</nav><article><main class="notion"><h2>En progreso</h2><p>${text}</p><script>secret()</script><button>Share</button></main><form>Feedback</form></article>`;
const url = 'https://help.adereso.ai/administrador/id/topes/article-id';
describe('bounded source reads preserve source statements', () => {
  test('Help Center extracts only article text, preserves limits and never stores executable markup', () => {
    const doc = parseHelpArticle(article('El umbral es informativo; la función está pendiente de habilitación.'),url,null);
    expect(doc.text).toContain('pendiente de habilitación'); expect(doc.text).not.toContain('secret()'); expect(doc.text).not.toContain('Feedback'); expect(doc.text).not.toContain('Global navigation');
    expect(doc.sourceEditedAt).toBe('2026-10-21T00:00:00.000Z');
    expect(() => parseHelpArticle('<html>Login instead</html>',url,null)).toThrow('article_format_changed');
  });
  test('sitemap includes articles, not category navigation or foreign URLs', () => {
    expect(parseHelpSitemap(`<urlset><url><loc>${url}</loc></url><url><loc>https://help.adereso.ai/category/id</loc></url></urlset>`)).toHaveLength(1);
    for (const evil of ['https://help.adereso.ai.evil.test/a/b/c/d','http://help.adereso.ai/a/b/c/d','https://help.adereso.ai@127.0.0.1/a/b/c/d']) {
      expect(validSourceUrl('help',evil)).toBe(false); expect(() => parseHelpSitemap(`<urlset><url><loc>${evil}</loc></url></urlset>`)).toThrow();
    }
  });
  test('redirects and oversized responses are rejected', async () => {
    let redirect: RequestRedirect | undefined;
    await expect(limitedFetch(url,{},(async (_,init) => { redirect = init?.redirect; return new Response(null,{ status:302,headers:{ location:'https://evil.test' } }); }) as typeof fetch)).rejects.toThrow('source_http_302');
    expect(redirect).toBe('manual');
    await expect(limitedFetch(url,{},(async () => new Response('a'.repeat(11))) as typeof fetch,10)).rejects.toThrow('source_too_large');
    await expect(limitedFetch(url,{},(async () => { throw new DOMException('provider timeout','TimeoutError'); }) as typeof fetch)).rejects.toThrow('source_timeout');
    await expect(limitedFetch(url,{},(async () => { throw new TypeError('transport failed'); }) as typeof fetch)).rejects.toThrow('source_transport_error');
  });
  test('a failed batch stops new reads and waits for its other in-flight article', async () => {
    const urls = [url,url+'2',url+'3']; let secondFinished = false; const reads: string[] = [];
    const fetcher = (async (input: string) => {
      if (input.endsWith('sitemap.xml')) return new Response('<urlset>'+urls.map(u=>'<url><loc>'+u+'</loc></url>').join('')+'</urlset>');
      reads.push(input);
      if (input===url) return new Response('outage',{status:503});
      await new Promise(resolve=>setTimeout(resolve,25));secondFinished=true;
      return new Response(article('Condiciones y requisitos de esta funcionalidad del producto.'));
    }) as typeof fetch;
    await expect(fetchHelpSnapshot(null,fetcher)).rejects.toThrow('source_http_503');
    expect(secondFinished).toBe(true); expect(reads).toHaveLength(2);expect(reads).not.toContain(url+'3');
  });
  test('partial Help Center failures cannot produce a replacement snapshot', async () => {
    const fetcher = (async (input: string) => input.endsWith('sitemap.xml') ? new Response(`<urlset><url><loc>${url}</loc></url></urlset>`) : new Response('outage',{status:503})) as typeof fetch;
    await expect(fetchHelpSnapshot(null,fetcher)).rejects.toThrow('source_http_503');
  });
  test('unchanged help articles are reused, removed ones disappear, and weekly reads do not trust timestamps alone', async () => {
    const doc = parseHelpArticle(article('El umbral es informativo; la función está pendiente de habilitación.'),url,'2026-11-06T00:00:00Z');
    let articleReads = 0;
    const fetcher = (async (input: string) => {
      if (input.endsWith('sitemap.xml')) return new Response(`<urlset><url><loc>${url}</loc><lastmod>2026-11-06T00:00:00Z</lastmod></url></urlset>`);
      articleReads++; return new Response(article('Texto actualizado con los requisitos y las restricciones vigentes.'));
    }) as typeof fetch;
    const previous = { schema:'academy-sources/v1' as const,source:'help' as const,fetchedAt:'2026-11-06T12:00:00Z',fullScanAt:'2026-11-06T12:00:00Z',documents:[doc,{...doc,id:'removed',url:url+'-removed'}] };
    const first = await fetchHelpSnapshot(previous,fetcher,new Date('2026-11-07T12:00:00Z'));
    expect(first.documents).toHaveLength(1); expect(articleReads).toBe(0); expect(first.documents[0]?.hash).toBe(doc.hash);
    const later = await fetchHelpSnapshot(previous,fetcher,new Date('2026-11-15T12:00:00Z'));
    expect(articleReads).toBe(1); expect(later.documents[0]?.hash).not.toBe(doc.hash);
  });
  test('Notion root is fixed, pagination is complete and nested limits remain explicit', async () => {
    const paths: string[] = [];
    const fetcher = (async (input: string) => {
      paths.push(input);
      if (input.includes('/pages/')) return Response.json({ last_edited_time:'2026-11-07',properties:{ title:{ title:[{plain_text:'Wiki comercial'}] } } });
      return Response.json({ results:[{id:'block',type:'paragraph',paragraph:{rich_text:[{plain_text:'Disponible solo en beta, no prometer disponibilidad general.'}]}}],has_more:false });
    }) as typeof fetch;
    const snapshot = await fetchNotionSnapshot('private-token',fetcher);
    expect(paths[0]).toBe('https://api.notion.com/v1/pages/' + ACADEMY_WIKI_ID);
    expect(snapshot.documents[0]?.text).toContain('no prometer'); expect(snapshot.documents[0]?.text).not.toContain('private-token');
  });
  test('Notion reads every cursor and nested block; unsupported cross-page references stop publication', async () => {
    const fetcher = (async (input: string) => {
      if (input.includes('/pages/')) return Response.json({properties:{title:{title:[{plain_text:'Wiki'}]}}});
      if (input.includes('start_cursor=')) return Response.json({results:[{id:'two',type:'paragraph',paragraph:{rich_text:[{plain_text:'Segunda página: todavía en desarrollo.'}]}}],has_more:false});
      if (input.includes('/blocks/nested/')) return Response.json({results:[{id:'inner',type:'paragraph',paragraph:{rich_text:[{plain_text:'Requiere habilitación, validar antes de ofrecer.'}]}}],has_more:false});
      return Response.json({results:[{id:'nested',type:'toggle',has_children:true,toggle:{rich_text:[{plain_text:'Condiciones'}]}}],has_more:true,next_cursor:'next'});
    }) as typeof fetch;
    const result = await fetchNotionSnapshot('token',fetcher); expect(result.documents[0]?.text).toContain('todavía en desarrollo'); expect(result.documents[0]?.text).toContain('Requiere habilitación');
    const unsupported = (async (input: string) => input.includes('/pages/') ? Response.json({properties:{}}) : Response.json({results:[{id:'foreign',type:'synced_block',synced_block:{synced_from:{block_id:'other-root'}}}],has_more:false})) as typeof fetch;
    await expect(fetchNotionSnapshot('token',unsupported)).rejects.toThrow('notion_unsupported_reference');
  });
});
