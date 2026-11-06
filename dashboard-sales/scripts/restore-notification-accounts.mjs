import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const targetUrl = 'https://nsflqsdtfmnuangezsid.supabase.co';
const normalizeEmail = value => String(value ?? '').trim().toLowerCase();
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Match only verified corporate email; never overwrite an existing destination. */
export function planNotificationRestore(backup, users, repositories) {
  const seen = new Set();
  return backup.map(source => {
    const email = normalizeEmail(source.email);
    if (!/^[^@\s]+@adere\.so$/.test(email) || seen.has(email) || source.payload?.version !== 'sales-notifications/v1'
      || source.payload.account !== source.user_id || !source.payload.ownerId) throw new Error('Exportación de propietarios inválida o ambigua.');
    seen.add(email);
    const matches = users.filter(user => normalizeEmail(user.email) === email);
    if (matches.length > 1) throw new Error('Hay cuentas de destino ambiguas.');
    const user = matches[0];
    if (!user || !Number.isFinite(Date.parse(user.email_confirmed_at ?? ''))) return { status: 'pending' };
    const original = repositories.find(row => row.user_id === source.user_id);
    if (!original || !equal(original.payload, source.payload) || String(original.revision) !== String(source.revision)) {
      throw new Error('El repositorio de origen cambió: revisar antes de restaurar.');
    }
    if (user.id === source.user_id) return { status: 'already-restored' };
    const row = { user_id: user.id, payload: { ...source.payload, account: user.id }, revision: source.revision, updated_at: source.updated_at };
    const existing = repositories.find(item => item.user_id === user.id);
    if (existing) return { status: equal(existing.payload, row.payload) ? 'already-restored' : 'conflict' };
    return { status: 'restore', row };
  });
}

async function main() {
  const sourceIndex = process.argv.indexOf('--source');
  if (sourceIndex < 0 || !process.argv[sourceIndex + 1]) throw new Error('Indica --source con el archivo privado notifications.json.');
  if (process.env.SUPABASE_URL !== targetUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Falta la configuración privada del destino esperado.');
  const backup = JSON.parse(readFileSync(process.argv[sourceIndex + 1], 'utf8'));
  if (!Array.isArray(backup)) throw new Error('Exportación inválida.');
  const client = createClient(targetUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = [];
  for (let page = 1; ; page++) {
    const result = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw new Error('No se pudo verificar las cuentas de destino.');
    users.push(...result.data.users);
    if (result.data.users.length < 100) break;
  }
  const ids = [...new Set([...backup.map(row => row.user_id), ...users.map(user => user.id)])];
  const stored = await client.from('sales_notification_repositories').select('*').in('user_id', ids);
  if (stored.error) throw new Error('No se pudo leer los repositorios de destino.');
  const plan = planNotificationRestore(backup, users, stored.data);
  const counts = plan.reduce((summary, item) => ({ ...summary, [item.status]: (summary[item.status] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'plan', counts }));
  if (!process.argv.includes('--apply')) return;
  for (const item of plan.filter(item => item.status === 'restore')) {
    // Insert only: a concurrent first sync wins without being overwritten.
    const inserted = await client.from('sales_notification_repositories').insert(item.row);
    if (inserted.error) throw new Error('No se insertó una cuenta: el destino pudo cambiar. Revisa el plan nuevamente.');
    const saved = await client.from('sales_notification_repositories').select('payload').eq('user_id', item.row.user_id).single();
    if (saved.error || !equal(saved.data.payload, item.row.payload)) throw new Error('No se pudo verificar una restauración.');
  }
  console.log('Restauraciones verificadas. Los pendientes y conflictos requieren revisión; no se borran repositorios originales.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('No se completó la restauración. Revisa configuración, exportación y posibles conflictos; no se muestran datos privados.'); process.exitCode = 1; });
}
