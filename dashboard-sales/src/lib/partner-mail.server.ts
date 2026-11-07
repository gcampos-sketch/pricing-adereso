import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin as db } from '@/integrations/supabase/client.server';
import { corporateEmail } from './email-auth';
import { verifyHubIdentity } from './hub-auth.server';
import { readTicket } from './hub-gateway';
import { createPartnerMailGateway, MailError } from './partner-mail-gateway';
import type { MailUser } from './partner-mail-gateway';
import { partnerMailInput, partnerMailLink, partnerSelection, googleMailAccountMatches } from './partner-mail';
import { decryptMailSecret, encryptMailSecret } from './partner-mail-crypto.server';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const env=process.env;
const origin=env['HUB_PUBLIC_ORIGIN'] || env['RENDER_EXTERNAL_URL'] || 'http://127.0.0.1:8877';
const clientId=env['GMAIL_OAUTH_CLIENT_ID'] || '';
const clientSecret=env['GMAIL_OAUTH_CLIENT_SECRET'] || '';
const secret=env['GMAIL_TOKEN_ENCRYPTION_KEY'] || '';
const callback=origin+'/api/hub/mail/callback';
const scope='https://www.googleapis.com/auth/gmail.send';
const configured=Boolean(clientId && clientSecret && /^[a-f0-9]{64}$/i.test(secret));
const oauth=()=>new OAuth2Client({clientId,clientSecret,redirectUri:callback});
const fail=(error:unknown)=>{if(error)throw new MailError(503,'mail_unavailable');};
async function connection(user:MailUser) {
 const {data,error}=await db.from('hub_gmail_connections').select('*').eq('user_id',user.userId).maybeSingle();fail(error);
 if(data && data.email!==user.email)throw new MailError(403,'sender_mismatch');return data;
}
export function partnerMime(from:string,to:string,message:string,link:string) {
 if(corporateEmail(from)!==from || !partnerMailInput.shape.to.safeParse(to).success)throw new MailError(400,'invalid_input');
 const body=Buffer.from(message+'\n\n'+link,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
 return Buffer.from(['From: '+from,'To: '+to,'Subject: =?UTF-8?B?'+Buffer.from('Programa de Partners · Adereso').toString('base64')+'?=', 'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+body].join('\r\n')).toString('base64url');
}
const service={
 configured,
 async status(user:MailUser){const data=await connection(user);return data?{connected:true,email:data.email}:{connected:false};},
 async connect(user:MailUser,selection:ReturnType<typeof partnerSelection.parse>){
  const client=oauth();const pkce=await client.generateCodeVerifierAsync();const state=randomBytes(32).toString('hex');const nonce=randomBytes(32).toString('hex');
  const {error}=await db.from('hub_gmail_oauth_states').upsert({user_id:user.userId,state_hash:hash(state),verifier_encrypted:encryptMailSecret(pkce.codeVerifier,user.userId+':oauth',secret),nonce,selection,expires_at:new Date(Date.now()+600_000).toISOString()});fail(error);
  const url=new URL(client.generateAuthUrl({access_type:'offline',scope:['openid','email',scope],state,prompt:'consent select_account',login_hint:user.email,hd:'adere.so',code_challenge:pkce.codeChallenge!,code_challenge_method:CodeChallengeMethod.S256,include_granted_scopes:false}));url.searchParams.set('nonce',nonce);return url.href;
 },
 async callback(user:MailUser,url:URL){
  const state=url.searchParams.get('state') || '';if(!/^[a-f0-9]{64}$/.test(state))throw new MailError(400,'invalid_oauth_state');
  const {data,error}=await db.from('hub_gmail_oauth_states').delete().eq('user_id',user.userId).eq('state_hash',hash(state)).gt('expires_at',new Date().toISOString()).select('*').maybeSingle();fail(error);
  if(!data)throw new MailError(400,'invalid_oauth_state');
  const selection=partnerSelection.parse(data.selection);const returnTo='/?'+new URL(partnerMailLink(selection)).searchParams.toString();
  if(url.searchParams.has('error'))return returnTo+'&mail=cancelled';
  const code=url.searchParams.get('code');if(!code || code.length>4000)throw new MailError(400,'invalid_oauth_code');
  try {
   const client=oauth();const {tokens}=await client.getToken({code,codeVerifier:decryptMailSecret(data.verifier_encrypted,user.userId+':oauth',secret)});
   if(!tokens.id_token||!tokens.access_token||!tokens.refresh_token)throw new MailError(400,'gmail_consent_required');
   const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:clientId});const payload=ticket.getPayload();
   if(!payload || !googleMailAccountMatches(payload,user.email,{nonce:data.nonce,hostedDomain:true}))throw new MailError(403,'sender_mismatch');
   const info=await client.getTokenInfo(tokens.access_token);if(info.aud!==clientId || !info.scopes.includes(scope))throw new MailError(403,'gmail_consent_required');
   const {error:saveError}=await db.from('hub_gmail_connections').upsert({user_id:user.userId,email:user.email,google_sub:payload.sub,refresh_token_encrypted:encryptMailSecret(tokens.refresh_token,user.userId+':gmail',secret),connected_at:new Date().toISOString()});fail(saveError);
   return returnTo+'&mail=connected';
  } catch(error){if(error instanceof MailError)throw error;throw new MailError(400,'gmail_connection_failed');}
 },
 async disconnect(user:MailUser){
  const data=await connection(user);
  if(data){const {error}=await db.from('hub_gmail_connections').delete().eq('user_id',user.userId);fail(error);try{await oauth().revokeToken(decryptMailSecret(data.refresh_token_encrypted,user.userId+':gmail',secret));}catch{/* The local credential is removed regardless of provider availability. */}}
  const {error}=await db.from('hub_gmail_oauth_states').delete().eq('user_id',user.userId);fail(error);
 },
 async send(user:MailUser,input:ReturnType<typeof partnerMailInput.parse>){
  const saved=await connection(user);if(!saved)throw new MailError(409,'gmail_not_connected');
  const link=partnerMailLink(input.selection);const fingerprint=hash(JSON.stringify({to:input.to,message:input.message,link}));
  const client=oauth();client.setCredentials({refresh_token:decryptMailSecret(saved.refresh_token_encrypted,user.userId+':gmail',secret)});
  let access:string|null|undefined;try{access=(await client.getAccessToken()).token;}catch{throw new MailError(409,'gmail_reconnect_required');}if(!access)throw new MailError(409,'gmail_reconnect_required');
  try {
   const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(10000)});
   if(!response.ok || !googleMailAccountMatches(await response.json(),user.email,{sub:saved.google_sub}))throw new MailError(409,'gmail_reconnect_required');
  } catch {throw new MailError(409,'gmail_reconnect_required');}
  const {data:claim,error:claimError}=await db.rpc('hub_claim_gmail_send',{p_user_id:user.userId,p_request_id:input.requestId,p_payload_hash:fingerprint});fail(claimError);
  if(claim==='sent')return {status:'sent'};
  if(claim==='conflict')throw new MailError(409,'request_conflict');
  if(claim==='not_connected')throw new MailError(409,'gmail_not_connected');
  if(claim==='rate_limit')throw new MailError(429,'mail_rate_limit');
  if(claim!=='claimed')throw new MailError(409,claim==='failed'?'gmail_send_rejected':'delivery_unknown');
  let state='unknown';let messageId:string|undefined;
  try {
   const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({raw:partnerMime(user.email,input.to,input.message,link)}),signal:AbortSignal.timeout(15000)});
   if(!response.ok){state=response.status<500?'failed':'unknown';throw new MailError(response.status===429?429:502,state==='failed'?'gmail_send_rejected':'delivery_unknown');}
   const result=await response.json() as {id?:unknown};if(typeof result.id!=='string')throw new MailError(502,'delivery_unknown');messageId=result.id;state='sent';
  } catch(error){if(error instanceof MailError)throw error;throw new MailError(502,'delivery_unknown');}
  finally {const {error}=await db.from('hub_gmail_sends').update({status:state,provider_message_id:messageId??null}).eq('request_id',input.requestId).eq('user_id',user.userId);if(error)throw new MailError(502,'delivery_unknown');}
  return {status:'sent'};
 }
};
export const handlePartnerMailRequest=createPartnerMailGateway(async request=>{const ticket=readTicket(request);if(!ticket)return null;const identity=await verifyHubIdentity(ticket.accessToken,ticket.trustToken);return identity?{userId:identity.userId,email:identity.email}:null;},service,origin);
