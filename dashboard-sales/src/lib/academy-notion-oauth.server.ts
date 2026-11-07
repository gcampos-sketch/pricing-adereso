import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../integrations/supabase/client.server';
import { verifyHubIdentity } from './hub-auth.server';
import { ACADEMY_WIKI_ID } from './academy-content';
import { AcademySyncError, limitedFetch } from './academy-fetch.server';
import { createNotionOAuthGateway, decryptNotionGrant, encryptNotionGrant, notionCallback } from './academy-notion-oauth';
import type { AcademyOperator } from './academy-notion-oauth';

const db=supabaseAdmin as unknown as SupabaseClient;
const key=()=>process.env['ACADEMY_NOTION_ENCRYPTION_KEY']??'';
const clientId=()=>process.env['ACADEMY_NOTION_CLIENT_ID']??'';
const clientSecret=()=>process.env['ACADEMY_NOTION_CLIENT_SECRET']??'';
const configured=()=>Boolean(clientId()&&clientSecret()&&/^[a-f0-9]{64}$/i.test(key()));
async function stored() {
  const {data,error}=await db.from('academy_notion_connection').select('*').eq('id',true).maybeSingle();
  if(error&&['42P01','PGRST205'].includes(error.code)) return null;
  if(error) throw new Error('notion_storage_unavailable');return data;
}
export async function notionSourceConfigured() {
  return Boolean(process.env['ACADEMY_NOTION_TOKEN'])||Boolean(configured()&&await stored());
}
export async function notionSourceToken() {
  const staticToken=process.env['ACADEMY_NOTION_TOKEN'];if(staticToken)return staticToken;
  const row=await stored();if(!row||!configured())throw new AcademySyncError('notion_not_configured');
  const grant=decryptNotionGrant(row.encrypted_tokens,key());
  if(typeof grant.access_token!=='string')throw new AcademySyncError('notion_grant_invalid');
  return grant.access_token as string;
}
async function tokenRequest(body: Record<string,string>) {
  const raw=await limitedFetch('https://api.notion.com/v1/oauth/token',{method:'POST',headers:{
    'Content-Type':'application/json',Accept:'application/json',Authorization:'Basic '+Buffer.from(clientId()+':'+clientSecret()).toString('base64'),
  },body:JSON.stringify(body)},fetch,100_000);
  const grant=JSON.parse(raw);
  if(typeof grant.access_token!=='string'||!grant.access_token||typeof grant.refresh_token!=='string'||!grant.refresh_token)throw new AcademySyncError('notion_token_invalid');
  return grant;
}
// Called only by the durable Notion source worker after an HTTP 401. Rotation is
// fenced to the exact encrypted grant read, so reconnecting cannot be overwritten.
export async function refreshNotionSourceToken() {
  if(process.env['ACADEMY_NOTION_TOKEN'])throw new AcademySyncError('notion_reauthorization_required');
  const row=await stored();if(!row||!configured())throw new AcademySyncError('notion_not_configured');
  const grant=decryptNotionGrant(row.encrypted_tokens,key());
  if(typeof grant.refresh_token!=='string')throw new AcademySyncError('notion_reauthorization_required');
  const next=await tokenRequest({grant_type:'refresh_token',refresh_token:grant.refresh_token});
  const encrypted=encryptNotionGrant(next,key());
  const {data,error}=await db.from('academy_notion_connection').update({encrypted_tokens:encrypted,updated_at:new Date().toISOString()})
    .eq('id',true).eq('encrypted_tokens',row.encrypted_tokens).select('id').maybeSingle();
  if(error)throw new AcademySyncError('notion_storage_unavailable');
  return data?next.access_token:await notionSourceToken();
}
const service={
  get configured(){return configured();},get clientId(){return clientId();},
  connected:async()=>Boolean(await stored()),
  saveState:async(user:AcademyOperator,hash:string)=>{
    const {error}=await db.from('academy_notion_oauth_states').upsert({user_id:user.userId,state_hash:hash,expires_at:new Date(Date.now()+600_000).toISOString()});
    if(error)throw new Error('notion_storage_unavailable');
  },
  consumeState:async(user:AcademyOperator,hash:string)=>{
    const {data,error}=await db.from('academy_notion_oauth_states').delete().eq('user_id',user.userId).eq('state_hash',hash)
      .gt('expires_at',new Date().toISOString()).select('user_id').maybeSingle();
    if(error)throw new Error('notion_storage_unavailable');return Boolean(data);
  },
  exchange:async(code:string,user:AcademyOperator)=>{
    const grant=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:notionCallback});
    // Prove access to our immutable source ID before storing any credential.
    const page=JSON.parse(await limitedFetch('https://api.notion.com/v1/pages/'+ACADEMY_WIKI_ID,{headers:{Authorization:'Bearer '+grant.access_token,'Notion-Version':'2022-06-28'}}));
    if(page.id?.replaceAll('-','')!==ACADEMY_WIKI_ID.replaceAll('-','')||page.archived||page.in_trash||typeof grant.workspace_id!=='string')throw new Error('wiki_not_authorized');
    const {error}=await db.from('academy_notion_connection').upsert({id:true,owner_user_id:user.userId,workspace_id:grant.workspace_id,
      encrypted_tokens:encryptNotionGrant(grant,key()),updated_at:new Date().toISOString()});
    if(error)throw new Error('notion_storage_unavailable');
    const queued=await db.rpc('academy_request_sync',{p_source:'notion'});if(queued.error)throw new Error('notion_queue_unavailable');
  },
};
export const handleNotionOAuthRequest=createNotionOAuthGateway({verify:verifyHubIdentity,service,
  operatorEmail:process.env['ACADEMY_NOTION_OPERATOR_EMAIL']??'gcampos@adere.so'});
