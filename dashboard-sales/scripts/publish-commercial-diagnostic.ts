/** Run with Bun and server environment; no browser write endpoint or CRM mutation. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { diagnosticEditionSchema, DIAGNOSTIC_PREFIX } from '../src/lib/commercial-diagnostic';

const args = process.argv.slice(2);
const file = args.find(value => !value.startsWith('--'));
if (!file) throw new Error('Indica el archivo privado de la edición. Usa --local para revisar sin publicar.');
const edition = diagnosticEditionSchema.parse(JSON.parse(await readFile(resolve(file), 'utf8')));
const payload = JSON.stringify(edition);
const hash = createHash('sha256').update(payload).digest('hex');
if (args.includes('--local')) {
  const directory = resolve(process.cwd(), '.migration-backups/commercial-diagnostics');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, `${edition.date}.json`);
  try { await writeFile(path, payload, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const old = diagnosticEditionSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    if (JSON.stringify(old) !== payload) throw new Error('La edición local ya existe con otro contenido. Conserva la anterior y prepara otra fecha.');
  }
  console.log(JSON.stringify({ mode: 'local', date: edition.date, rows: edition.rows.length, sha256: hash }));
} else {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta configuración privada para publicar la edición.');
  const { supabaseAdmin: client } = await import('../src/integrations/supabase/client.server');
  const rowKey = DIAGNOSTIC_PREFIX + edition.date;
  // Insert-only. A retry reconciles the exact payload; never upsert a prior edition.
  const result = await client.from('report_cache').insert({ key: rowKey, payload: edition as never, build_ms: 0, generated_at: edition.capturedAt, updated_at: new Date().toISOString() });
  if (result.error && result.error.code !== '23505') throw new Error('No se pudo confirmar la publicación. Revisa la edición antes de reintentar.');
  const check = await client.from('report_cache').select('payload').eq('key', rowKey).single();
  if (check.error) throw new Error('No se pudo verificar la edición publicada.');
  const saved = diagnosticEditionSchema.parse(check.data.payload);
  if (JSON.stringify(saved) !== payload) throw new Error('Ya existe una edición diferente para esa fecha. No se reemplazó.');
  console.log(JSON.stringify({ mode: 'published', date: edition.date, rows: saved.rows.length, sha256: hash, verified: true }));
}
