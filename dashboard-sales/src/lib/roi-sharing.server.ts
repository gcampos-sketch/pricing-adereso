import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../integrations/supabase/client.server';
import { COMMERCIAL_PIPELINE, gateway } from './hubspot.server';
import { hubspotConfig } from './hubspot-config.server';
import type { RawDeal, Props } from './hubspot.server';
import { verifyHubIdentity } from './hub-auth.server';
import { readTicket } from './hub-gateway';
import { createRoiSharingGateway } from './roi-sharing-gateway';
import type { RoiSharingService } from './roi-sharing-gateway';
import { RoiError, roiLink } from './roi-sharing';
import type { RoiContact } from './roi-sharing';

const db = supabaseAdmin as unknown as SupabaseClient;
function requireCrm() {
 try { hubspotConfig(); } catch { throw new RoiError(503, 'crm_not_configured'); }
}
const check = (error: unknown) => {
 if (!error) return;
 const code = typeof error === 'object' && 'code' in error ? error.code : undefined;
 throw new RoiError(503, code === 'PGRST202' || code === '42P01' ? 'roi_not_configured' : 'roi_storage_unavailable');
};
async function commercialDeal(id: string) {
 requireCrm();
 const deal = await gateway<RawDeal & { archived?: boolean }>('/crm/v3/objects/deals/' + id + '?properties=dealname,pipeline');
 if (deal.archived || deal.properties['pipeline'] !== COMMERCIAL_PIPELINE) throw new RoiError(400, 'invalid_deal');
 return { id: deal.id, name: deal.properties['dealname'] || deal.id };
}
const service: RoiSharingService = {
 async deals(query) {
  requireCrm();
  const filters: Record<string, string>[] = [{ propertyName: 'pipeline', operator: 'EQ', value: COMMERCIAL_PIPELINE }];
  if (/^\d+$/.test(query)) filters.push({ propertyName: 'hs_object_id', operator: 'EQ', value: query });
  const result = await gateway<{ results: RawDeal[] }>('/crm/v3/objects/deals/search', { method: 'POST', body: JSON.stringify({ filterGroups: [{ filters }], ...(/^\d+$/.test(query) ? {} : { query }), properties: ['dealname'], limit: 20 }) });
  return result.results.map(d => ({ id: d.id, name: d.properties['dealname'] || d.id }));
 },
 async contacts(id) {
  await commercialDeal(id);
  const ids = new Set<string>(); let after: string | undefined;
  for (let page = 0; page < 10; page++) {
   const response = await gateway<{ results: { toObjectId: number | string }[]; paging?: { next?: { after: string } } }>('/crm/v4/objects/deals/' + id + '/associations/contacts?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''));
   response.results.forEach(c => ids.add(String(c.toObjectId)));
   after = response.paging?.next?.after;
   if (!after) break;
  }
  if (after) throw new RoiError(503, 'contacts_incomplete');
  const contacts: RoiContact[] = [], allIds = [...ids];
  for (let i = 0; i < allIds.length; i += 100) {
   const response = await gateway<{ results: { id: string; properties: Props }[]; errors?: unknown[]; numErrors?: number }>('/crm/v3/objects/contacts/batch/read', { method: 'POST', body: JSON.stringify({ properties: ['email', 'firstname', 'lastname'], inputs: allIds.slice(i, i + 100).map(id => ({ id })) }) });
   if (response.errors?.length || response.numErrors || response.results.length !== allIds.slice(i, i + 100).length) throw new RoiError(503, 'contacts_incomplete');
   response.results.forEach(c => { if (c.properties['email']) contacts.push({ id: c.id, name: [c.properties['firstname'], c.properties['lastname']].filter(Boolean).join(' '), email: c.properties['email'] }); });
  }
  return contacts;
 },
 async create(user, input, origin) {
  // Re-read exact CRM record; search results and client-supplied titles are not authority.
  const deal = await commercialDeal(input.dealId);
  const fingerprint = createHash('sha256').update(JSON.stringify({ dealId: input.dealId, context: input.context })).digest('hex');
  const { data, error } = await db.rpc('hub_create_roi_share', { p_user_id: user.userId, p_request_id: input.requestId, p_payload_hash: fingerprint, p_deal_id: deal.id, p_deal_name: deal.name, p_token: randomBytes(32).toString('hex'), p_context: input.context });
  check(error);
  if (data?.error === 'conflict') throw new RoiError(409, 'request_conflict');
  if (data?.error === 'rate_limit') throw new RoiError(429, 'rate_limit');
  if (!data?.token) throw new RoiError(503, 'roi_storage_unavailable');
  return { id: data.id, deal, url: roiLink(origin, data.token, input.context), expiresAt: data.expires_at };
 },
 async list(user) {
  const { data, error } = await db.rpc('hub_roi_share_activity', { p_user_id: user.userId }); check(error);
  return data ?? [];
 },
 async event(input) {
  const { data, error } = await db.rpc('hub_record_roi_event', { p_token: input.token, p_session_id: input.sessionId, p_sequence: input.sequence, p_kind: input.kind, p_scenario: input.scenario });
  check(error);
  if (data === 'rate_limit') throw new RoiError(429, 'rate_limit');
  if (data !== 'recorded' && data !== 'duplicate') throw new RoiError(404, 'link_unavailable');
 },
};
export const handleRoiSharingRequest = createRoiSharingGateway({
 authenticate: async request => { const ticket = readTicket(request); return ticket ? verifyHubIdentity(ticket.accessToken, ticket.trustToken) : null; },
 service,
 origin: process.env['HUB_PUBLIC_ORIGIN'] || process.env['RENDER_EXTERNAL_URL'],
});
