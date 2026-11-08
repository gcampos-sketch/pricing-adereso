import {expect,test} from 'bun:test';
import {createHubWelcomeGateway} from '../src/lib/hub-welcome-gateway';
const origin='https://hub.example';
const request=(token='user-a',extra:RequestInit={})=>new Request(origin+'/api/hub/first-access',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token},...extra});
test('first access requires the existing server-verified MFA identity and exact origin',async()=>{
 let claims=0;const handle=createHubWelcomeGateway({verify:async token=>token==='valid'?{userId:'a',expiresAt:Date.now()+10000}:token==='expired'?{userId:'a',expiresAt:1}:null,claim:async()=>{claims++;return true;}});
 expect((await handle(request('valid',{headers:{Origin:'https://other.example',Authorization:'Bearer valid'}})))?.status).toBe(403);
 expect((await handle(request('valid',{headers:{Origin:origin}})))?.status).toBe(401);
 expect((await handle(request('forged')))?.status).toBe(401);
 expect((await handle(request('expired')))?.status).toBe(401);
 expect((await handle(request('valid',{method:'GET'})))?.status).toBe(405);expect(claims).toBe(0);
});
test('concurrent tabs get one claim and the body cannot choose another account or force a replay',async()=>{
 const seen=new Set<string>();const handle=createHubWelcomeGateway({verify:async token=>({userId:token,expiresAt:Date.now()+10000}),claim:async user=>{if(seen.has(user))return false;seen.add(user);return true;}});
 const results=await Promise.all(Array.from({length:8},async()=>{const r=await handle(request('user-a',{body:JSON.stringify({userId:'victim',force:true})}));expect(r?.headers.get('cache-control')).toContain('no-store');return r?.json();}));
 expect(results.filter(x=>x.show)).toHaveLength(1);expect(seen.has('victim')).toBe(false);
 expect(await (await handle(request('user-a')))?.json()).toEqual({show:false});
 expect(await (await handle(request('user-b')))?.json()).toEqual({show:true});
});
test('persistence failures do not report eligibility or leak storage errors',async()=>{
 const handle=createHubWelcomeGateway({verify:async()=>({userId:'a',expiresAt:Date.now()+10000}),claim:async()=>{throw Error('private database detail');}});
 const response=await handle(request());expect(response?.status).toBe(503);expect(await response?.json()).toEqual({error:'welcome_unavailable'});
});
