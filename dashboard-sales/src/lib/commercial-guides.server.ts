import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../integrations/supabase/client.server';
import { verifyHubIdentity } from './hub-auth.server';
import { AcademySyncError, digest } from './academy-fetch.server';
import { notionSourceConfigured, notionSourceToken, refreshNotionSourceToken } from './academy-notion-oauth.server';
import { fetchCommercialGuide } from './commercial-guides-fetch.server';
import { createCommercialGuidesGateway } from './commercial-guides-gateway';
import { COMMERCIAL_GUIDES } from './commercial-guides';
import type { CommercialGuide, GuideSnapshot } from './commercial-guides';
const db = supabaseAdmin as unknown as SupabaseClient;
export async function readCommercialGuide(guide: CommercialGuide) {
  const state = await db.from('academy_source_state').select('version,checked_at,published_at,error_code,pending').eq('source', guide).single();
  if (state.error || !state.data?.version) throw new Error('guide_unavailable');
  const result = await db.from('academy_source_versions').select('payload').eq('source', guide).eq('version', state.data.version).single();
  if (result.error) throw new Error('guide_unavailable');
  return { schema: 'commercial-guide/v1', guide, title: COMMERCIAL_GUIDES[guide].title,
    version: state.data.version, checkedAt: state.data.checked_at, publishedAt: state.data.published_at,
    pending: state.data.pending, error: Boolean(state.data.error_code), snapshot: result.data.payload as GuideSnapshot };
}
export async function runCommercialGuidesSync() {
  const results = [];
  for (const source of ['playbook', 'operativa'] as const) {
    if (!await notionSourceConfigured()) { results.push({ source, status: 'not_configured' }); continue; }
    const claim = await db.rpc('academy_claim_sync', { p_source: source });
    if (claim.error) throw new Error('guide_storage_unavailable');
    if (!claim.data) { results.push({ source, status: 'not_due_or_busy' }); continue; }
    let snapshot: GuideSnapshot;
    try {
      try { snapshot = await fetchCommercialGuide(source, await notionSourceToken()); }
      catch (error) {
        if (!(error instanceof AcademySyncError) || error.code !== 'source_http_401') throw error;
        snapshot = await fetchCommercialGuide(source, await refreshNotionSourceToken());
      }
    } catch (error) {
      const result = await db.rpc('academy_finish_sync', { p_source: source, p_lease: claim.data.lease, p_version: null, p_payload: null,
        p_error: error instanceof AcademySyncError ? error.code : 'source_read_failed' });
      if (result.error || !result.data) throw new Error('guide_storage_unavailable');
      results.push({ source, status: 'failed_last_version_preserved' }); continue;
    }
    const version = digest(JSON.stringify(snapshot.documents.map(d => [d.id, d.hash, d.sourceEditedAt])));
    const result = await db.rpc('academy_finish_sync', { p_source: source, p_lease: claim.data.lease, p_version: version, p_payload: snapshot, p_error: null });
    if (result.error || !result.data) throw new Error('guide_publish_failed');
    results.push({ source, status: claim.data.version === version ? 'unchanged' : 'published', documents: snapshot.documents.length });
  }
  return results;
}
export const handleCommercialGuidesRequest = createCommercialGuidesGateway({ verify: verifyHubIdentity, read: readCommercialGuide });
