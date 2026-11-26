import { expect, test } from 'bun:test';
import { readPipelineCreativeCatalog } from '../src/lib/pipeline-creative-catalog.server';

test('preserves exact text IDs and projects only name and format from the private catalog', () => {
  const row = { id: '120012001200120012', name: 'Anuncio de prueba', format: 'Video', discarded: 'unused' };
  const result = readPipelineCreativeCatalog(JSON.stringify([row, row]));
  expect(result.status).toBe('ready');
  expect([...result.ads]).toEqual([[row.id, { name: row.name, format: row.format }]]);
  expect(readPipelineCreativeCatalog(undefined).status).toBe('missing');
  expect(readPipelineCreativeCatalog(JSON.stringify([{ ...row, id: 12 }])).status).toBe('invalid');
  expect(readPipelineCreativeCatalog(JSON.stringify([row, { ...row, format: 'Imagen' }])).ads.size).toBe(0);
});
