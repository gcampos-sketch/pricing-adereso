import { expect, test } from 'bun:test';
import { createNotionOAuthGateway, encryptNotionGrant, decryptNotionGrant, notionCallback, notionStateHash } from '../src/lib/academy-notion-oauth';
import { HUB_COOKIE } from '../src/lib/hub-gateway';

const origin=new URL(notionCallback).origin;
const cookie=HUB_COOKIE+'='+encodeURIComponent(JSON.stringify({accessToken:'valid',trustToken:'mfa'}));
function setup(email='gcampos@adere.so') {
  let hash='', exchanges=0,configured=true;
  const gateway=createNotionOAuthGateway({operatorEmail:'gcampos@adere.so',verify:async(token,trust)=>token==='valid'&&trust==='mfa'?{userId:'hub-user',email,expiresAt:Date.now()+60_000}:null,
    service:{get configured(){return configured;},clientId:'client',connected:async()=>false,
      saveState:async(user,state)=>{expect(user.userId).toBe('hub-user');hash=state;},
      consumeState:async(user,state)=>{if(user.userId!=='hub-user'||!hash||state!==hash)return false;hash='';return true;},
      exchange:async(code,user)=>{expect(user.email).toBe(email);expect(code).toBe('temporary-code');exchanges++;},
    }});
  const start=()=>gateway(new Request(origin+'/api/academy/notion/connect',{method:'POST',headers:{cookie,origin}}));
  return {gateway,start,exchanges:()=>exchanges,disable:()=>{configured=false;},hash:()=>hash};
}
test('Notion OAuth needs a server-verified Hub MFA session for every endpoint',async()=>{
 const {gateway}=setup();
 for(const path of ['connect','authorize','status','callback']) {
  const r=await gateway(new Request(origin+'/api/academy/notion/'+path,{method:path==='connect'?'POST':'GET',headers:{cookie:HUB_COOKIE+'=true'}}));
  expect(r?.status).toBe(401);
 }
});
test('direct navigation opens Notion with the same MFA, operator and one-use state protections',async()=>{
 const {gateway,hash}=setup();const r=await gateway(new Request(origin+'/api/academy/notion/authorize',{headers:{cookie}}));
 expect(r?.status).toBe(303);expect(r?.headers.get('cache-control')).toBe('private, no-store');
 const target=new URL(r!.headers.get('location')!);expect(target.origin).toBe('https://api.notion.com');
 expect(target.searchParams.get('redirect_uri')).toBe(notionCallback);
 expect(hash()).toBe(notionStateHash(target.searchParams.get('state')!));
 const other=setup('other@adere.so');expect((await other.gateway(new Request(origin+'/api/academy/notion/authorize',{headers:{cookie}})))?.status).toBe(403);expect(other.hash()).toBe('');
});
test('other corporate accounts cannot replace the shared source, and foreign origins cannot initiate it',async()=>{
 const {start}=setup('other@adere.so');expect((await start())?.status).toBe(403);
 const {gateway,hash}=setup();const r=await gateway(new Request(origin+'/api/academy/notion/connect',{method:'POST',headers:{cookie,origin:'https://evil.test'}}));expect(r?.status).toBe(403);expect(hash()).toBe('');
});
test('callback URI is exact; OAuth state is opaque, hashed, bound to the user and single-use',async()=>{
 const {gateway,start,hash,exchanges}=setup();const response=await start();expect(response?.status).toBe(200);
 const {url}=await response!.json();const authorize=new URL(url);const state=authorize.searchParams.get('state')!;
 expect(authorize.origin).toBe('https://api.notion.com');expect(authorize.searchParams.get('redirect_uri')).toBe(notionCallback);
 expect(state).toMatch(/^[a-f0-9]{64}$/);expect(hash()).toBe(notionStateHash(state));expect(hash()).not.toBe(state);
 const request=()=>new Request(notionCallback+'?code=temporary-code&state='+state,{headers:{cookie}});
 const bad=await gateway(new Request(notionCallback+'?code=temporary-code&state='+'0'.repeat(64),{headers:{cookie}}));expect(bad?.status).toBe(400);expect(exchanges()).toBe(0);
 const ok=await gateway(request());expect(ok?.status).toBe(200);expect(ok?.headers.get('referrer-policy')).toBe('no-referrer');expect(await ok?.text()).not.toContain('temporary-code');
 expect((await gateway(request()))?.status).toBe(400);expect(exchanges()).toBe(1);
});
test('missing credentials and cancelled grants never exchange a code',async()=>{
 const first=setup();first.disable();expect((await first.start())?.status).toBe(503);expect(first.hash()).toBe('');
 const {start,gateway,exchanges}=setup();const r=await start();const {url}=await r!.json();const state=new URL(url).searchParams.get('state');
 const cancelled=await gateway(new Request(notionCallback+'?state='+state+'&error=access_denied',{headers:{cookie}}));expect(cancelled?.status).toBe(200);expect(exchanges()).toBe(0);
});
test('encrypted credentials reject tampering and a different key, and never expose plaintext',()=>{
 const key='a'.repeat(64),grant={access_token:'sensitive-access',refresh_token:'sensitive-refresh'};
 const encrypted=encryptNotionGrant(grant,key);expect(encrypted).not.toContain('sensitive');expect(decryptNotionGrant(encrypted,key)).toEqual(grant);
 expect(()=>decryptNotionGrant(encrypted,'b'.repeat(64))).toThrow();expect(()=>decryptNotionGrant('broken',key)).toThrow();expect(()=>encryptNotionGrant(grant,'short')).toThrow();
});
