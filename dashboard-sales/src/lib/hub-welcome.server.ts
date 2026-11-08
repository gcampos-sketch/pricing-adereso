import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseAdmin} from '../integrations/supabase/client.server';
import {verifyHubIdentity} from './hub-auth.server';
import {createHubWelcomeGateway} from './hub-welcome-gateway';
const db=supabaseAdmin as unknown as SupabaseClient;
export const handleHubWelcomeRequest=createHubWelcomeGateway({verify:verifyHubIdentity,publicOrigin:process.env['RENDER_EXTERNAL_URL'],claim:async userId=>{
  const {data,error}=await db.rpc('hub_claim_first_access',{p_user_id:userId});
  if(error)throw new Error('welcome_storage_unavailable');
  return data===true;
}});
