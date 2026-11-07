import type { SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../integrations/supabase/client.server';
import { verifyHubIdentity } from './hub-auth.server';
import { createAcademyGateway } from './academy-gateway';
import { AcademySyncError, digest, fetchHelpSnapshot, fetchNotionSnapshot } from './academy-fetch.server';
import type { AcademySnapshot, AcademySource, AcademySourceStatus } from './academy-content';
import { notionSourceConfigured, notionSourceToken, refreshNotionSourceToken } from './academy-notion-oauth.server';

// These tables have no browser grants/policies. Credentials and source material never enter Git.
const db = supabaseAdmin as unknown as SupabaseClient;
const configured = async (source: AcademySource) => source === 'help' || await notionSourceConfigured();
function setupKey() {
  const secret = process.env['ACADEMY_SYNC_SECRET'];
  if (!secret || secret.length < 32) throw new Error('setup_not_configured');
  return createHash('sha256').update(secret).digest();
}
async function captureSetup(token: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', setupKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const payload = [iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join('.');
  const { error } = await db.from('academy_webhook_setup').upsert({ id: true, encrypted_candidate: payload }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error('setup_storage_unavailable');
}
async function readSetup() {
  const { data, error } = await db.from('academy_webhook_setup').select('encrypted_candidate').eq('id', true).maybeSingle();
  if (error) throw new Error('setup_storage_unavailable');
  if (!data) return { pending: true };
  const [iv, tag, body] = data.encrypted_candidate.split('.').map((s: string) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', setupKey(), iv); decipher.setAuthTag(tag);
  return { verificationToken: Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8') };
}
async function snapshot(source: AcademySource, version: string | null): Promise<AcademySnapshot | null> {
  if (!version) return null;
  const { data, error } = await db.from('academy_source_versions').select('payload').eq('source', source).eq('version', version).single();
  if (error) throw new Error('academy_storage_unavailable'); return data.payload;
}
export async function readAcademyContent() {
  const { data, error } = await db.from('academy_source_state').select('source,version,checked_at,published_at,error_code,pending');
  if (error) {
    if (['42P01','PGRST205'].includes(error.code)) return { schema: 'academy-content/v1', setupRequired: true, sources: [], documents: [] };
    throw new Error('academy_storage_unavailable');
  }
  const sources: AcademySourceStatus[] = [], documents = [];
  for (const row of data ?? []) {
    const saved = await snapshot(row.source, row.version);
    sources.push({ source: row.source, configured: await configured(row.source), checkedAt: row.checked_at,
      publishedAt: row.published_at, version: row.version, error: Boolean(row.error_code), pending: row.pending,
      documentCount: saved?.documents.length ?? 0 });
    if (saved) documents.push(...saved.documents);
  }
  return { schema: 'academy-content/v1', setupRequired: false, sources, documents };
}
export async function runAcademySync() {
  const results = [];
  for (const source of ['notion','help'] as const) {
    if (!await configured(source)) { results.push({ source, status: 'not_configured' }); continue; }
    const claim = await db.rpc('academy_claim_sync', { p_source: source });
    if (claim.error) throw new Error('academy_storage_unavailable');
    if (!claim.data) { results.push({ source, status: 'not_due_or_busy' }); continue; }
    const lease = claim.data.lease; let saved: AcademySnapshot; let version: string;
    try {
      const previous = await snapshot(source, claim.data.version);
      if(source==='notion') {
        try {saved=await fetchNotionSnapshot(await notionSourceToken());}
        catch(error) {
          if(!(error instanceof AcademySyncError)||error.code!=='source_http_401')throw error;
          saved=await fetchNotionSnapshot(await refreshNotionSourceToken());
        }
      } else saved=await fetchHelpSnapshot(previous);
      version = digest(JSON.stringify(saved.documents.map(d => [d.id,d.title,d.hash,d.sourceEditedAt]).sort((a,b) => String(a[0]).localeCompare(String(b[0])))));
    } catch (error) {
      const failed = await db.rpc('academy_finish_sync', { p_source: source, p_lease: lease, p_version: null, p_payload: null,
        p_error: error instanceof AcademySyncError ? error.code : 'source_read_failed' });
      if (failed.error || !failed.data) throw new Error('academy_storage_unavailable');
      results.push({ source, status: 'failed_last_version_preserved' }); continue;
    }
    const finished = await db.rpc('academy_finish_sync', { p_source: source, p_lease: lease, p_version: version, p_payload: saved, p_error: null });
    if (finished.error || !finished.data) throw new Error('academy_publish_failed');
    results.push({ source, status: version === claim.data.version ? 'unchanged' : 'published', documents: saved.documents.length });
  }
  return { results };
}
export const handleAcademyRequest = createAcademyGateway({
  verify: verifyHubIdentity, read: readAcademyContent, run: runAcademySync,
  enqueue: async source => { const { error } = await db.rpc('academy_request_sync', { p_source: source }); if (error) throw new Error('queue_unavailable'); },
  syncSecret: process.env['ACADEMY_SYNC_SECRET'], webhookSecret: process.env['ACADEMY_NOTION_WEBHOOK_SECRET'],
  notionIntegrationId: process.env['ACADEMY_NOTION_INTEGRATION_ID'], notionWorkspaceId: process.env['ACADEMY_NOTION_WORKSPACE_ID'],
  setupEnabled: process.env['ACADEMY_NOTION_SETUP_ENABLED'] === 'true', captureSetup, readSetup,
});
