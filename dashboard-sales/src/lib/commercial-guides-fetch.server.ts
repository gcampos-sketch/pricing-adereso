import { AcademySyncError, digest, limitedFetch } from './academy-fetch.server';
import { COMMERCIAL_GUIDES, safeGuideUrl } from './commercial-guides';
import type { CommercialGuide, GuideBlock, GuideDocument, GuideSnapshot, GuideText } from './commercial-guides';
const text = (value: any): GuideText[] => Array.isArray(value) ? value.map(x => ({
  text: typeof x.plain_text === 'string' ? x.plain_text : typeof x.text?.content === 'string' ? x.text.content : '',
  ...(x.annotations?.bold ? { bold: true } : {}), ...(x.annotations?.italic ? { italic: true } : {}),
  ...(x.annotations?.underline ? { underline: true } : {}), ...(x.annotations?.strikethrough ? { strike: true } : {}),
  ...(x.annotations?.code ? { code: true } : {}), ...(safeGuideUrl(x.href ?? x.text?.link?.url) ? { href: safeGuideUrl(x.href ?? x.text?.link?.url)! } : {}),
})) : [];
const plain = (items: GuideText[]) => items.map(x => x.text).join('');
/** Reads the entire allowed page tree. A partial read never becomes a published snapshot. */
export async function fetchCommercialGuide(guide: CommercialGuide, token: string, fetcher = fetch): Promise<GuideSnapshot> {
  if (!token) throw new AcademySyncError('notion_not_configured');
  const source = COMMERCIAL_GUIDES[guide];
  if (!source) throw new AcademySyncError('guide_not_allowed');
  let requests = 0, count = 0; const active = new Set<string>(), seenPages = new Set<string>(); const documents: GuideDocument[] = [];
  async function api(path: string, body?: unknown): Promise<any> {
    if (++requests > 160) throw new AcademySyncError('guide_read_limit');
    if (requests > 1) await new Promise(r => setTimeout(r, 350));
    return JSON.parse(await limitedFetch('https://api.notion.com/v1/' + path, { headers: {
      Authorization: 'Bearer ' + token, 'Notion-Version': '2022-06-28', ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }, fetcher));
  }
  async function page(id: string, depth: number, metadata?: any) {
    if (depth > 16 || seenPages.has(id) || seenPages.size >= 60) throw new AcademySyncError('guide_tree_limit');
    seenPages.add(id);
    const meta = metadata ?? await api('pages/' + encodeURIComponent(id));
    if (meta.archived || meta.in_trash) throw new AcademySyncError('notion_page_unavailable');
    const title = Object.values(meta.properties ?? {}).map((v: any) => plain(text(v.title))).find(Boolean) || source.title;
    const blocks = await children(id, depth);
    if (!blocks.length && !metadata) throw new AcademySyncError('guide_content_empty');
    const payload = { title, blocks };
    if (JSON.stringify(payload).length > 2_000_000) throw new AcademySyncError('guide_read_limit');
    documents.push({ id, title, blocks, url: 'https://www.notion.so/' + id.replaceAll('-', ''),
      sourceEditedAt: typeof meta.last_edited_time === 'string' ? meta.last_edited_time : null, hash: digest(JSON.stringify(payload)) });
  }
  async function database(id: string, depth: number): Promise<GuideBlock[]> {
    if (depth > 16 || active.has(id)) throw new AcademySyncError('guide_tree_limit');
    active.add(id); const links: GuideBlock[] = []; let cursor = '';
    do {
      const result = await api('databases/' + encodeURIComponent(id) + '/query', { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      if (!Array.isArray(result.results)) throw new AcademySyncError('notion_format_changed');
      for (const row of result.results) {
        if (row.object !== 'page' || typeof row.id !== 'string' || row.parent?.database_id?.replaceAll('-', '') !== id.replaceAll('-', '')) throw new AcademySyncError('notion_unsupported_reference');
        if (row.archived || row.in_trash) continue;
        await page(row.id, depth + 1, row);
        links.push({ id: row.id, type: 'child_page', text: [{ text: documents.at(-1)!.title }], children: [], url: 'https://www.notion.so/' + row.id.replaceAll('-', '') });
      }
      if (result.has_more && typeof result.next_cursor !== 'string') throw new AcademySyncError('notion_pagination_invalid');
      cursor = result.has_more ? result.next_cursor : '';
    } while (cursor);
    active.delete(id); return links;
  }
  async function children(id: string, depth: number): Promise<GuideBlock[]> {
    if (depth > 16 || active.has(id)) throw new AcademySyncError('guide_tree_limit');
    active.add(id); const output: GuideBlock[] = []; let cursor = '';
    do {
      const result = await api('blocks/' + encodeURIComponent(id) + '/children?page_size=100' + (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''));
      if (!Array.isArray(result.results)) throw new AcademySyncError('notion_format_changed');
      for (const raw of result.results) {
        if (++count > 5000 || typeof raw.id !== 'string' || typeof raw.type !== 'string') throw new AcademySyncError('guide_read_limit');
        const value = raw[raw.type] ?? {}; const block: GuideBlock = { id: raw.id, type: raw.type, text: text(value.rich_text ?? value.caption), children: [] };
        if (raw.type === 'unsupported') throw new AcademySyncError('notion_unsupported_reference');
        if (raw.type === 'child_database') { block.text = [{ text: value.title || 'Temas relacionados' }]; block.children = await database(raw.id, depth + 1); }
        else if (raw.type === 'child_page') {
          block.text = [{ text: value.title || 'Documento relacionado' }]; block.url = 'https://www.notion.so/' + raw.id.replaceAll('-', ''); await page(raw.id, depth + 1);
        } else if (raw.has_children) {
          // Read the visible synced copy through its own ID; never follow a foreign synced_from URL/ID.
          block.children = await children(raw.id, depth + 1);
        }
        if (raw.type === 'table_row') block.cells = Array.isArray(value.cells) ? value.cells.map(text) : [];
        if (raw.type === 'to_do') block.checked = value.checked === true;
        if (['bookmark', 'link_preview', 'embed', 'video', 'image', 'file', 'pdf', 'audio'].includes(raw.type)) { const url = safeGuideUrl(value.url ?? value.external?.url ?? (value.file ? 'https://www.notion.so/' + source.id.replaceAll('-', '') + '#' + raw.id.replaceAll('-', '') : undefined)); if (url) block.url = url; }
        if (raw.type === 'link_to_page' && typeof value.page_id === 'string') block.url = 'https://www.notion.so/' + value.page_id.replaceAll('-', '');
        output.push(block);
      }
      if (result.has_more && typeof result.next_cursor !== 'string') throw new AcademySyncError('notion_pagination_invalid');
      cursor = result.has_more ? result.next_cursor : '';
    } while (cursor);
    active.delete(id); return output;
  }
  await page(source.id, 0);
  documents.sort((a, b) => a.id === source.id ? -1 : b.id === source.id ? 1 : a.id.localeCompare(b.id));
  return { schema: 'academy-sources/v1', source: guide, fetchedAt: new Date().toISOString(), documents };
}
