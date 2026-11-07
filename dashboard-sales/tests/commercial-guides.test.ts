import { describe, test, expect } from 'bun:test';
import { fetchCommercialGuide } from '../src/lib/commercial-guides-fetch.server';
import { COMMERCIAL_GUIDES } from '../src/lib/commercial-guides';
import { createCommercialGuidesGateway } from '../src/lib/commercial-guides-gateway';
import { HUB_COOKIE } from '../src/lib/hub-gateway';
const root=COMMERCIAL_GUIDES.playbook.id;
const t=(value:string)=>[{plain_text:value}];
const provider=(changed=false)=>(async(input:string)=>{
 if(input.includes('/pages/'))return Response.json({id:root,properties:{title:{title:t('Playbook comercial')}},last_edited_time:'2026-11-07T00:00:00Z'});
 if(input.includes('/blocks/nested/'))return Response.json({results:[{id:'p',type:'paragraph',paragraph:{rich_text:[{plain_text:changed?'Nueva instrucción comercial.':'Instrucción anterior.',annotations:{bold:true},href:'javascript:alert(1)'}]}}],has_more:false});
 if(input.includes('start_cursor='))return Response.json({results:[{id:'table',type:'table',has_children:true,table:{}}],has_more:false});
 if(input.includes('/blocks/table/'))return Response.json({results:[{id:'row',type:'table_row',table_row:{cells:[t('Responsable'),t('AE')]}}],has_more:false});
 return Response.json({results:[{id:'nested',type:'toggle',has_children:true,toggle:{rich_text:t('Discovery')}}],has_more:true,next_cursor:'next'});
}) as typeof fetch;
describe('live commercial documents',()=>{
 test('reads the fixed source and all cursors, preserving rich text, folds and table cells',async()=>{
  const calls:string[]=[];const f=provider();const snap=await fetchCommercialGuide('playbook','secret',(async(input,init)=>{calls.push(String(input));return f(input,init);}) as typeof fetch);
  expect(calls[0]).toBe('https://api.notion.com/v1/pages/'+root);const blocks=snap.documents[0]!.blocks;
  expect(blocks[0]?.children[0]?.text[0]).toEqual({text:'Instrucción anterior.',bold:true});expect(blocks[1]?.children[0]?.cells?.[1]?.[0]?.text).toBe('AE');
  expect(JSON.stringify(snap)).not.toContain('secret');expect(JSON.stringify(snap)).not.toContain('javascript:');
 });
 test('a Notion edit changes the published content fingerprint; incomplete reads cannot become snapshots',async()=>{
  const old=await fetchCommercialGuide('playbook','secret',provider());const next=await fetchCommercialGuide('playbook','secret',provider(true));expect(old.documents[0]?.hash).not.toBe(next.documents[0]?.hash);
  const fail=(async(input:string)=>input.includes('/pages/')?Response.json({properties:{}}):new Response('outage',{status:503})) as typeof fetch;
  await expect(fetchCommercialGuide('playbook','secret',fail)).rejects.toThrow('source_http_503');
 });
 test('no arbitrary root can be selected',async()=>{await expect(fetchCommercialGuide('foreign' as any,'secret',provider())).rejects.toThrow('guide_not_allowed');});
 test('only current MFA sessions can read the two allowed guides, and there is no browser write API',async()=>{
  let reads=0;const handle=createCommercialGuidesGateway({verify:async token=>token==='valid'?{expiresAt:Date.now()+60000}:null,read:async guide=>{reads++;return {guide};}});
  const cookie=encodeURIComponent(JSON.stringify({accessToken:'valid',trustToken:'trust'}));
  for(const token of ['',`${HUB_COOKIE}=invalid`])expect((await handle(new Request('https://hub/api/guides/content?guide=playbook',{headers:{Cookie:token}})))?.status).toBe(401);
  const headers={Cookie:HUB_COOKIE+'='+cookie};
  expect((await handle(new Request('https://hub/api/guides/content?guide=playbook',{headers})))?.status).toBe(200);
  expect((await handle(new Request('https://hub/api/guides/content?guide=foreign',{headers})))?.status).toBe(400);
  expect((await handle(new Request('https://hub/api/guides/content?guide=playbook',{headers,method:'POST'})))?.status).toBe(405);
  expect(reads).toBe(1);
 });
});
