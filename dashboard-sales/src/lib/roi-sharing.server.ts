import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../integrations/supabase/client.server';
import { commercialDeal, calculatorCrm } from './calculator-crm.server';
import { verifyHubIdentity } from './hub-auth.server';
import { readTicket } from './hub-gateway';
import { createRoiSharingGateway } from './roi-sharing-gateway';
import type { RoiSharingService } from './roi-sharing-gateway';
import { RoiError, roiLink } from './roi-sharing';

const db = supabaseAdmin as unknown as SupabaseClient;
const check = (error: unknown) => {
 if (!error) return;
 const code = typeof error === 'object' && 'code' in error ? error.code : undefined;
 throw new RoiError(503, code === 'PGRST202' || code === '42P01' ? 'roi_not_configured' : 'roi_storage_unavailable');
};
const service: RoiSharingService = {
 ...calculatorCrm,
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
