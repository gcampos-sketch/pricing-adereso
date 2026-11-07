import { expect, test } from 'bun:test';
import { createPartnerMailGateway } from '../src/lib/partner-mail-gateway';
import { partnerMailInput, partnerMailLink, googleMailAccountMatches } from '../src/lib/partner-mail';
import { encryptMailSecret, decryptMailSecret } from '../src/lib/partner-mail-crypto.server';
import { partnerMime } from '../src/lib/partner-mail.server';
const origin='https://hub.example.test';
const user={userId:'signed-user',email:'persona@adere.so'};
const selection={tipo:'reseller' as const,categoria:'basic' as const,rebase:true,soporte:false};
const input={requestId:crypto.randomUUID(),to:'partner@example.test',message:'Hola, revisemos el programa.',selection};
function setup(auth:typeof user|null=user,configured=true){
 let writes=0;let actor:unknown;let sent:unknown;
 const service={configured,status:async()=>({connected:true,email:user.email}),connect:async(u:typeof user)=>{writes++;actor=u;return 'https://accounts.google.com/example';},callback:async(u:typeof user)=>{writes++;actor=u;return '/?vista=partners';},disconnect:async(u:typeof user)=>{writes++;actor=u;},send:async(u:typeof user,data:unknown)=>{writes++;actor=u;sent=data;return {status:'sent'};}};
 return {handle:createPartnerMailGateway(async()=>auth,service,origin),writes:()=>writes,actor:()=>actor,sent:()=>sent};
}
const request=(path:string,body?:unknown,requestOrigin=origin)=>new Request(origin+'/api/hub/mail/'+path,{method:body===undefined?'GET':'POST',headers:{origin:requestOrigin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
test('all mail endpoints require a server-verified corporate MFA session',async()=>{
 const s=setup(null);for(const [path,body] of [['status',undefined],['callback',undefined],['connect',selection],['send',input],['disconnect',{}]] as const)expect((await s.handle(request(path,body)))?.status).toBe(401);expect(s.writes()).toBe(0);
});
test('cross-origin actions are rejected before connecting or sending',async()=>{
 const s=setup();for(const [path,body] of [['connect',selection],['send',input],['disconnect',{}]] as const)expect((await s.handle(request(path,body,'https://adereso-partners.onrender.com')))?.status).toBe(403);expect(s.writes()).toBe(0);
});
test('a missing Google setup is honest and cannot accidentally invoke a provider',async()=>{
 const s=setup(user,false);expect(await (await s.handle(request('status')))!.json()).toEqual({configured:false,connected:false});expect((await s.handle(request('send',input)))?.status).toBe(503);expect(s.writes()).toBe(0);
});
test('sender and identity always come from the verified session, never the request',async()=>{
 const s=setup();expect((await s.handle(request('send',input)))?.status).toBe(200);expect(s.actor()).toEqual(user);expect(s.sent()).toEqual(input);
 for(const extra of [{from:'another@adere.so'},{userId:'victim'},{accessToken:'forged'},{link:'https://evil.test'}])expect((await s.handle(request('send',{...input,...extra})))?.status).toBe(400);expect(s.writes()).toBe(1);
});
test('recipient, selection and input sizes reject injection and unsolicited fields',async()=>{
 const s=setup();for(const to of ['a@x.test\r\nBcc: b@y.test','a@x.test,b@y.test','Name <a@x.test>'])expect(partnerMailInput.safeParse({...input,to}).success).toBe(false);
 expect((await s.handle(request('send',{...input,message:'x'.repeat(15000)})))?.status).toBe(413);
 expect((await s.handle(request('send',{...input,selection:{...selection,categoria:'owner'}})))?.status).toBe(400);expect(s.writes()).toBe(0);
 expect(partnerMailLink(selection)).toBe('https://adereso-partners.onrender.com/partners/?vista=partners&tipo=reseller&categoria=basic&rebase=1&soporte=0');
});
test('method guards keep sends out of GET and unknown routes out of the handler',async()=>{
 const s=setup();expect((await s.handle(request('send')))?.status).toBe(405);expect((await s.handle(request('unknown')))?.status).toBe(404);expect(await s.handle(new Request(origin+'/partners/'))).toBeNull();expect(s.writes()).toBe(0);
});
test('encrypted credentials cannot be transplanted across users, contexts or keys',()=>{
 const key='ab'.repeat(32),plain='private-refresh-token';const encrypted=encryptMailSecret(plain,'user:gmail',key);
 expect(encrypted).not.toContain(plain);expect(decryptMailSecret(encrypted,'user:gmail',key)).toBe(plain);
 for(const [owner,secret] of [['victim:gmail',key],['user:oauth',key],['user:gmail','cd'.repeat(32)]])expect(()=>decryptMailSecret(encrypted,owner!,secret!)).toThrow();
 expect(()=>decryptMailSecret(encrypted.slice(0,-5),'user:gmail',key)).toThrow();
});
test('MIME uses the verified sender, one recipient, UTF8 message and a trusted public link',()=>{
 const link=partnerMailLink(selection);const raw=Buffer.from(partnerMime(user.email,input.to,'Hola 👋\nBcc: texto del mensaje',link),'base64url').toString('utf8');
 const [headers,body]=raw.split('\r\n\r\n');expect(headers).toContain('From: persona@adere.so');expect(headers).toContain('To: partner@example.test');expect(headers).not.toContain('Bcc:');
 expect(Buffer.from(body!.replace(/\r\n/g,''),'base64').toString('utf8')).toBe('Hola 👋\nBcc: texto del mensaje\n\n'+link);
 expect(()=>partnerMime('outside@example.test',input.to,input.message,link)).toThrow();
});

test('Google identities require verified corporate email, account binding and the OAuth nonce',()=>{
 const claims={sub:'google-user',email:user.email,email_verified:true,hd:'adere.so',nonce:'bound-nonce'};
 expect(googleMailAccountMatches(claims,user.email,{nonce:'bound-nonce',hostedDomain:true})).toBe(true);
 for(const changed of [{email:'someone@adere.so'},{email:'persona@example.test'},{email_verified:false},{email_verified:'true'},{nonce:'other'},{hd:'example.test'},{sub:''}])expect(googleMailAccountMatches({...claims,...changed},user.email,{nonce:'bound-nonce',hostedDomain:true})).toBe(false);
 expect(googleMailAccountMatches(claims,user.email,{sub:'another-google-user'})).toBe(false);
 expect(googleMailAccountMatches(claims,user.email,{sub:'google-user'})).toBe(true);
});
