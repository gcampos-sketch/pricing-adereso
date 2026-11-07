import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { ACADEMY_WIKI_ID, validSourceUrl } from './academy-content';
import type { AcademyDocument, AcademySnapshot } from './academy-content';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const iso = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export class AcademySyncError extends Error {
  constructor(public code: string) { super(code); }
}
// Never follow redirects with Notion credentials or fetch arbitrary links in source documents.
export async function limitedFetch(url: string, init: RequestInit = {}, fetcher = fetch, max = 3_000_000) {
  let response: Response;
  try { response = await fetcher(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(40_000) }); }
  catch (error) { throw new AcademySyncError(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name) ? 'source_timeout' : 'source_transport_error'); }
  if (!response.ok) throw new AcademySyncError('source_http_' + response.status);
  if (Number(response.headers.get('content-length')) > max) throw new AcademySyncError('source_too_large');
  const reader = response.body?.getReader();
  if (!reader) throw new AcademySyncError('source_empty');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length; if (length > max) throw new AcademySyncError('source_too_large');
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AcademySyncError) throw error;
    throw new AcademySyncError(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name) ? 'source_timeout' : 'source_transport_error');
  } finally { try { await reader.cancel(); } catch { /* a timed-out stream is already closed */ } }
  return Buffer.concat(chunks).toString('utf8');
}
export function parseHelpSitemap(xml: string) {
  const $ = load(xml, { xml: true });
  if ($('sitemap').length) throw new AcademySyncError('sitemap_format_changed');
  const seen = new Set<string>();
  const pages = $('url').toArray().map(el => {
    const url = $(el).find('loc').text().trim();
    if (!validSourceUrl('help', url) || new URL(url).search || new URL(url).hash || seen.has(url)) throw new AcademySyncError('invalid_sitemap_url');
    seen.add(url); return { url, modified: iso($(el).find('lastmod').text()) };
  }).filter(page => new URL(page.url).pathname.split('/').filter(Boolean).length >= 4);
  if (!pages.length || pages.length > 500) throw new AcademySyncError('sitemap_size_changed');
  return pages;
}
export function parseHelpArticle(html: string, url: string, modified: string | null): AcademyDocument {
  if (!validSourceUrl('help', url)) throw new AcademySyncError('invalid_source_url');
  let metadata: Record<string, unknown> | undefined;
  // HelpKit embeds a large UI, CSS and serialized application state. Avoid building
  // its entire DOM on the small web service; only article prose enters the parser.
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { const value = JSON.parse(match[1]!); if (value['@type'] === 'Article') metadata = value; } catch { /* another metadata block */ }
  }
  const article = html.match(/<article\b[^>]*>[\s\S]*?<\/article\s*>/i)?.[0];
  if (!article) throw new AcademySyncError('article_format_changed');
  const $ = load(article);
  const main = $('article main.notion').first();
  if (!main.length || !metadata || typeof metadata['headline'] !== 'string') throw new AcademySyncError('article_format_changed');
  main.find('script,style,svg,iframe,form,button,noscript').remove();
  main.find('br').replaceWith('\n');
  main.find('p,div,h1,h2,h3,h4,li,tr,blockquote').append('\n');
  const text = main.text().replace(/\u00a0/g, ' ').split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean).join('\n');
  if (text.length < 30 || text.length > 80_000) throw new AcademySyncError('article_content_invalid');
  const title = metadata['headline'].trim();
  return { id: url, source: 'help', url, title, text, sourceEditedAt: iso(modified) ?? iso(metadata['dateModified']), hash: digest(title + '\n' + text) };
}
export async function fetchHelpSnapshot(previous: AcademySnapshot | null, fetcher = fetch, now = new Date()): Promise<AcademySnapshot> {
  const pages = parseHelpSitemap(await limitedFetch('https://help.adereso.ai/sitemap.xml', {}, fetcher));
  const full = !previous || now.getTime() - Date.parse(previous.fullScanAt) > 7 * 86_400_000;
  const old = new Map(previous?.documents.map(doc => [doc.url, doc]) ?? []);
  const documents = new Array<AcademyDocument>(pages.length); let next = 0, failure: unknown;
  // Bound concurrent parsing: each HelpKit page contains a large application payload.
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (!failure && next < pages.length) {
      const index = next++, page = pages[index]!; const saved = old.get(page.url);
      try {
        documents[index] = !full && saved && page.modified && saved.sourceEditedAt === page.modified ? saved :
          parseHelpArticle(await limitedFetch(page.url, {}, fetcher), page.url, page.modified);
      } catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
  return { schema: 'academy-sources/v1', source: 'help', fetchedAt: now.toISOString(), fullScanAt: full ? now.toISOString() : previous!.fullScanAt, documents };
}

type NotionBlock = { id: string; type: string; has_children?: boolean; [key: string]: unknown };
function richText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(item => typeof item?.plain_text === 'string' ? item.plain_text : typeof item?.text?.content === 'string' ? item.text.content : '').join('');
}
export async function fetchNotionSnapshot(token: string, fetcher = fetch, now = new Date()): Promise<AcademySnapshot> {
  if (!token) throw new AcademySyncError('notion_not_configured');
  let requests = 0, blocks = 0; const seen = new Set<string>(); const documents: AcademyDocument[] = [];
  const seenDatabases = new Set<string>(); let pages = 0;
  async function api(path: string, body?: Record<string, unknown>): Promise<any> {
    if (++requests > 100) throw new AcademySyncError('notion_read_limit');
    if (requests > 1) await new Promise(resolve => setTimeout(resolve, 350));
    return JSON.parse(await limitedFetch('https://api.notion.com/v1/' + path, { headers: {
      Authorization: 'Bearer ' + token, 'Notion-Version': '2022-06-28', ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }, fetcher));
  }
  async function page(id: string, depth: number, databaseRow?: any) {
    if (depth > 8 || ++pages > 60 || seen.has(id)) throw new AcademySyncError('notion_tree_limit');
    seen.add(id);
    const meta = databaseRow ?? await api('pages/' + encodeURIComponent(id));
    if (meta.archived || meta.in_trash) throw new AcademySyncError('notion_page_unavailable');
    const title = Object.values(meta.properties ?? {}).map((v: any) => richText(v.title)).find(Boolean) || 'Wiki comercial';
    const body = await children(id, depth);
    // Database rows may intentionally contain only their title, e.g. a weekly topic.
    const text = databaseRow ? title + (body ? '\n' + body : '') : body;
    if ((!databaseRow && text.trim().length < 30) || !text.trim() || text.length > 250_000) throw new AcademySyncError('notion_content_invalid');
    const url = 'https://www.notion.so/' + id.replaceAll('-', '');
    documents.push({ id, source: 'notion', title, url, text, sourceEditedAt: iso(meta.last_edited_time), hash: digest(title + '\n' + text) });
  }
  async function database(id: string, depth: number) {
    if (depth > 8 || seenDatabases.has(id)) throw new AcademySyncError('notion_tree_limit');
    seenDatabases.add(id); let cursor = '';
    // Deliberately use the same pinned 2022 API as the block reader. Only query
    // child_database IDs found in the fixed wiki tree, never search the workspace.
    do {
      const result = await api('databases/' + encodeURIComponent(id) + '/query', { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      if (!Array.isArray(result.results)) throw new AcademySyncError('notion_format_changed');
      for (const row of result.results) {
        if (typeof row.id !== 'string') throw new AcademySyncError('notion_format_changed');
        if (row.archived || row.in_trash) continue;
        if (row.object === 'page') {
          if (row.parent?.database_id?.replaceAll('-', '') !== id.replaceAll('-', '')) throw new AcademySyncError('notion_unsupported_reference');
          await page(row.id, depth + 1, row);
        } else if (row.object === 'database') {
          await database(row.id, depth + 1);
        } else throw new AcademySyncError('notion_format_changed');
      }
      if (result.has_more && typeof result.next_cursor !== 'string') throw new AcademySyncError('notion_pagination_invalid');
      cursor = result.has_more ? result.next_cursor : '';
    } while (cursor);
  }
  async function children(id: string, depth: number): Promise<string> {
    if (depth > 16) throw new AcademySyncError('notion_tree_limit');
    const lines: string[] = []; let cursor = '';
    do {
      const result = await api('blocks/' + id + '/children?page_size=100' + (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''));
      if (!Array.isArray(result.results)) throw new AcademySyncError('notion_format_changed');
      for (const block of result.results as NotionBlock[]) {
        if (++blocks > 5000) throw new AcademySyncError('notion_read_limit');
        const content = block[block.type] as any;
        if (block.type === 'child_database') { await database(block.id, depth + 1); continue; }
        if (block.type === 'synced_block' && content?.synced_from) throw new AcademySyncError('notion_unsupported_reference');
        if (block.type === 'child_page') { await page(block.id, depth + 1); continue; }
        const value = richText(content?.rich_text ?? content?.caption) || (Array.isArray(content?.cells) ? content.cells.map(richText).join(' | ') : '');
        if (value) lines.push(value);
        if (block.has_children) lines.push(await children(block.id, depth + 1));
      }
      if (result.has_more && typeof result.next_cursor !== 'string') throw new AcademySyncError('notion_pagination_invalid');
      cursor = result.has_more ? result.next_cursor : '';
    } while (cursor);
    return lines.join('\n');
  }
  await page(ACADEMY_WIKI_ID, 0);
  return { schema: 'academy-sources/v1', source: 'notion', fetchedAt: now.toISOString(), fullScanAt: now.toISOString(), documents };
}
