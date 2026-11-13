import { expect,test } from 'bun:test';
import { MISSIONS,ROLES,CONSEQUENCES,skillResult,nextReview,dueReviews } from '../../academy-curriculum.js';
import { createAcademyProgressGateway } from '../src/lib/academy-progress-gateway';
import { readFileSync } from 'node:fs';
const payload={role:'AE',mode:'onboarding',attempts:{},reviews:{},tasks:{},legacy:{},resume:null};
const cookie=(token:string)=>'adereso_hub_session='+encodeURIComponent(JSON.stringify({accessToken:token}));
function fixture(){
  const rows=new Map<string,any>();const writes:string[]=[];
  const gateway=createAcademyProgressGateway({
    verify:async token=>['alice','bob'].includes(token)?{userId:token,expiresAt:Date.now()+60000}:null,
    read:async id=>rows.get(id)||{revision:0,payload:{}},
    write:async(id,revision,data)=>{const current=rows.get(id)||{revision:0};if(current.revision!==revision)return null;const saved={revision:revision+1,payload:data};rows.set(id,saved);writes.push(id);return saved;},
  });
  const request=(token='alice',body:any={revision:0,payload},origin='https://hub.test')=>new Request('https://hub.test/api/academy/progress',{method:'PUT',headers:{cookie:cookie(token),origin,'content-type':'application/json'},body:JSON.stringify(body)});
  return {gateway,request,rows,writes};
}
test('every role has valid missions and every mission has a substantive critical decision',()=>{
  expect(new Set(MISSIONS.map(m=>m.id)).size).toBe(MISSIONS.length);
  for(const r of Object.values(ROLES))for(const id of r.missions)expect(MISSIONS.some(m=>m.id===id)).toBe(true);
  for(const m of MISSIONS){expect(m.questions.length).toBe(3);expect(m.questions.some(q=>q.critical)).toBe(true);for(const q of m.questions){expect(q.options[q.correct]).toBeTruthy();expect(q.explanation.length).toBeGreaterThan(50);expect(CONSEQUENCES[q.id]).toHaveLength(2);}}
});
test('two correct answers do not pass a missed critical decision; incomplete answers never pass',()=>{
  for(const m of MISSIONS){const answers=m.questions.map(q=>q.correct);expect(skillResult(m,answers).passed).toBe(true);const critical=m.questions.findIndex(q=>q.critical);answers[critical]=(answers[critical]+1)%3;expect(skillResult(m,answers)).toMatchObject({correct:2,passed:false,criticalMiss:true});expect(skillResult(m,[]).passed).toBe(false);}
});
test('review scheduling is concept-specific, never prematurely due, and resets after a miss',()=>{
  const now=1000000;let record=nextReview(undefined,false,now);expect(record.due).toBe(now+86400000);
  expect(dueReviews({miss:record},record.due-1)).toEqual([]);expect(dueReviews({miss:record},record.due)).toEqual(['miss']);
  record=nextReview(record,true,now);expect(record.due).toBe(now+3*86400000);
  record=nextReview(record,true,now);expect(record.due).toBe(now+7*86400000);
  expect(nextReview(record,false,now).due).toBe(now+86400000);
});
test('account comes exclusively from verified identity and reads stay isolated',async()=>{
  const f=fixture();const response=await f.gateway(f.request('alice',{revision:0,payload,userId:'bob'}));expect(response?.status).toBe(200);expect(f.writes).toEqual(['alice']);
  const bob=await f.gateway(new Request('https://hub.test/api/academy/progress',{headers:{cookie:cookie('bob')}}));expect(await bob?.json()).toEqual({revision:0,payload:{}});
  expect((await f.gateway(f.request('unknown')))?.status).toBe(401);
});
test('stale tabs cannot overwrite more recent practice; off-origin writes are rejected',async()=>{
  const f=fixture();expect((await f.gateway(f.request()))?.status).toBe(200);
  expect((await f.gateway(f.request()))?.status).toBe(409);
  expect((await f.gateway(f.request('alice',{revision:1,payload},'https://evil.test')))?.status).toBe(403);
  expect(f.rows.get('alice').revision).toBe(1);
});
test('invalid state and oversized requests fail without writes',async()=>{
  const f=fixture();
  for(const body of [{revision:-1,payload},{revision:0,payload:{...payload,role:'admin'}},{revision:0,payload:{...payload,attempts:[]}}])expect((await f.gateway(f.request('alice',body)))?.status).toBe(400);
  expect((await f.gateway(f.request('alice',{revision:0,payload:{...payload,notes:'x'.repeat(100001)}})))?.status).toBe(413);
  expect(f.writes).toEqual([]);
});
test('learning assets remain inside the private Hub package and outside Pages',()=>{
  const root=new URL('../../',import.meta.url);
  const docker=readFileSync(new URL('dashboard-sales/Dockerfile',root),'utf8'),ignore=readFileSync(new URL('.dockerignore',root),'utf8'),pages=readFileSync(new URL('_config.yml',root),'utf8');
  for(const file of ['academy-missions.js','academy-curriculum.js','academy-missions.css']){expect(docker).toContain(file);expect(ignore.split('\n')).toContain('!'+file);expect(pages).toContain('  - "'+file+'"');}
});
