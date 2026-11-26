import type { CreativeMetadata } from './pipeline-analysis';

export function readPipelineCreativeCatalog(raw: string | undefined) {
  const ads = new Map<string, CreativeMetadata>();
  if (!raw?.trim()) return { ads, status: 'missing' as const };
  try {
    // Verified ad metadata supplied on the server.
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.length) throw Error('Catálogo vacío.');
    for (const row of rows) {
      const id = typeof row?.id === 'string' ? row.id.trim() : '';
      const name = typeof row?.name === 'string' ? row.name.trim() : '';
      const format = typeof row?.format === 'string' ? row.format.trim() : '';
      if (!/^\d{1,30}$/.test(id) || !name || name.length > 512 || format.length > 120) throw Error('Fila de catálogo inválida.');
      const existing = ads.get(id);
      if (existing && (name !== existing.name || format !== existing.format)) throw Error('ID duplicado con metadatos distintos.');
      ads.set(id, { name, format });
    }
    return { ads, status: 'ready' as const };
  } catch {
    return { ads: new Map<string, CreativeMetadata>(), status: 'invalid' as const };
  }
}
