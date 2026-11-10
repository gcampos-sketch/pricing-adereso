import { diagnosticEditionSchema, DIAGNOSTIC_PREFIX, type DiagnosticEdition, type DiagnosticReport } from './commercial-diagnostic';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

/** Private local editions are available only on the development server, never bundled. */
async function localEditions(): Promise<DiagnosticEdition[] | null> {
  if (!import.meta.env.DEV) return null;
  const { readdir, readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const directory = resolve(process.cwd(), '.migration-backups/commercial-diagnostics');
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  const dates = files.filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file));
  if (!dates.length) return null;
  return Promise.all(dates.map(async file => diagnosticEditionSchema.parse(JSON.parse(await readFile(resolve(directory, file), 'utf8')))));
}

export async function readCommercialDiagnostic(date?: string): Promise<DiagnosticReport> {
  const local = await localEditions();
  if (local) {
    local.sort((a, b) => b.date.localeCompare(a.date));
    const index = date ? local.findIndex(item => item.date === date) : 0;
    if (index < 0) throw new Error('La edición seleccionada no está disponible.');
    return { generatedAt: new Date().toISOString(), editions: local.map(({ date, label }) => ({ date, label })), current: local[index]!, previous: local[index + 1] ?? null };
  }
  const list = await supabaseAdmin.from('report_cache').select('key').like('key', `${DIAGNOSTIC_PREFIX}%`).order('key', { ascending: false }).limit(260);
  if (list.error) throw new Error('No pudimos consultar las ediciones del diagnóstico.');
  const dates = (list.data ?? []).map(row => row.key.slice(DIAGNOSTIC_PREFIX.length)).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key));
  if (!dates.length) return { generatedAt: new Date().toISOString(), editions: [], current: null, previous: null };
  const index = date ? dates.indexOf(date) : 0;
  if (index < 0) throw new Error('La edición seleccionada no está disponible.');
  const selected = dates.slice(index, index + 2);
  const result = await supabaseAdmin.from('report_cache').select('key,payload').in('key', selected.map(value => DIAGNOSTIC_PREFIX + value));
  if (result.error) throw new Error('No pudimos leer esta edición. La captura anterior sigue conservada.');
  const editions = new Map((result.data ?? []).map(row => {
    const date = row.key.slice(DIAGNOSTIC_PREFIX.length);
    const edition = diagnosticEditionSchema.parse(row.payload);
    if (edition.date !== date) throw new Error('La edición no coincide con su fecha de archivo.');
    return [date, edition] as const;
  }));
  if (!editions.has(selected[0]!) || (selected[1] && !editions.has(selected[1]))) throw new Error('La lectura de ediciones quedó incompleta.');
  return { generatedAt: new Date().toISOString(), editions: dates.map(value => ({ date: value, label: `Semana del ${value}` })), current: editions.get(selected[0]!)!, previous: selected[1] ? editions.get(selected[1])! : null };
}
