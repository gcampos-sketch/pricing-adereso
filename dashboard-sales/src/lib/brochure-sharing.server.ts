import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../integrations/supabase/client.server';
import { commercialDeal, calculatorCrm } from './calculator-crm.server';
import { verifyHubIdentity } from './hub-auth.server';
import { readTicket } from './hub-gateway';
import { createBrochureSharingGateway } from './brochure-sharing-gateway';
import type { BrochureSharingService } from './brochure-sharing-gateway';
import { BrochureError, brochureLink } from './brochure-sharing';
const db=supabaseAdmin as unknown as SupabaseClient;
function check(error:unknown){if(!error)return;const code=typeof error==='object'&&'code' in error?error.code:undefined;throw new BrochureError(503,code==='PGRST202'||code==='42P01'?'brochure_not_configured':'brochure_storage_unavailable');}
const service:BrochureSharingService={
 deals:calculatorCrm.deals,
 async create(user,input,origin){const deal=await commercialDeal(input.dealId);const hash=createHash('sha256').update(input.dealId).digest('hex');const{data,error}=await db.rpc('hub_create_brochure_share',{p_user_id:user.userId,p_request_id:input.requestId,p_payload_hash:hash,p_deal_id:deal.id,p_deal_name:deal.name,p_token:randomBytes(32).toString('hex')});check(error);if(data?.error==='conflict')throw new BrochureError(409,'request_conflict');if(data?.error==='rate_limit')throw new BrochureError(429,'rate_limit');if(!data?.token)throw new BrochureError(503,'brochure_storage_unavailable');return{id:data.id,deal,url:brochureLink(origin,data.token),expiresAt:data.expires_at};},
 async list(user){const{data,error}=await db.rpc('hub_brochure_share_activity',{p_user_id:user.userId});check(error);return data??[];},
 async event(input){const{data,error}=await db.rpc('hub_record_brochure_event',{p_token:input.token,p_session_id:input.sessionId,p_sequence:input.sequence,p_kind:input.kind,p_section:input.section,p_progress:input.progress,p_seconds:input.seconds,p_interaction:input.interaction});check(error);if(data==='rate_limit')throw new BrochureError(429,'rate_limit');if(data!=='recorded'&&data!=='duplicate')throw new BrochureError(404,'link_unavailable');},
};
export const handleBrochureSharingRequest=createBrochureSharingGateway({authenticate:async request=>{const ticket=readTicket(request);return ticket?verifyHubIdentity(ticket.accessToken,ticket.trustToken):null;},service,origin:process.env['HUB_PUBLIC_ORIGIN']||process.env['RENDER_EXTERNAL_URL']});
