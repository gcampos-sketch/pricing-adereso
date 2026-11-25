import { expect,test } from 'bun:test';
import { MISSIONS,DEMO_MISSIONS,ADVISORY_MISSIONS,OBJECTION_MISSIONS,PLAYBOOK_MISSIONS,SPICED_MISSIONS,HYPOTHESIS_MISSION,TRAINING_LEVELS,trainingLevel,LEGACY_MISSION_REVISION,ROLES,CONSEQUENCES,skillResult,nextReview,dueReviews,
  missionRevision,currentMissionEntry,currentMissionReview,AE_ONBOARDING_WEEKS,AE_ROLEPLAY_STAGES } from '../../academy-curriculum.js';
import { createAcademyProgressGateway } from '../src/lib/academy-progress-gateway';
import { readFileSync } from 'node:fs';
const payload={role:'AE',mode:'onboarding',attempts:{},reviews:{},tasks:{},legacy:{},resume:null};
const cookie=(token:string)=>'adereso_hub_session='+encodeURIComponent(JSON.stringify({accessToken:token}));
function fixture(peoplePlan?:unknown){
  const rows=new Map<string,any>();const writes:string[]=[];
  const gateway=createAcademyProgressGateway({
    verify:async token=>['alice','bob'].includes(token)?{userId:token,expiresAt:Date.now()+60000}:null,
    read:async id=>rows.get(id)||{revision:0,payload:{}},
    peoplePlan,
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
test('legacy progress loads and a revised mission leaves other progress current',()=>{
  const existing=MISSIONS.find(m=>m.id==='demo')!;
  const legacy={edition:LEGACY_MISSION_REVISION,passed:true,answers:[1,2]};
  expect(currentMissionEntry(existing,legacy)).toEqual(legacy);
  expect(currentMissionReview(existing,{due:0})).toEqual({due:0});
  const [updated,unchanged]=DEMO_MISSIONS;
  const attempt={edition:missionRevision(updated),passed:true};
  const newer={...updated,revision:'next'};
  expect(currentMissionEntry(updated,attempt)).toEqual(attempt);
  expect(currentMissionEntry(newer,attempt)).toBeNull();
  expect(currentMissionEntry(unchanged,{edition:missionRevision(unchanged),passed:true})?.passed).toBe(true);
  expect(currentMissionReview(newer,{due:0,edition:attempt.edition})).toBeNull();
  expect(currentMissionReview(updated,{due:0})).toBeNull();
});
test('demo challenges include a source, screen-by-screen rehearsal and peer feedback criteria',()=>{
  expect(DEMO_MISSIONS).toHaveLength(4);
  for(const m of DEMO_MISSIONS){
    expect(new URL(m.reference.url).protocol).toBe('https:');
    expect(m.reference.query.length).toBeGreaterThan(8);
    expect(m.demo.steps).toHaveLength(3);
    expect(m.demo.rubric).toHaveLength(3);
  }
});
test('advisory cases show the proposed flow and a model response using the shared mission engine',()=>{
  const onboarding = Object.values(ROLES).flatMap(role => role.missions);
  expect(ADVISORY_MISSIONS.length).toBeGreaterThanOrEqual(6);
  for (const mission of ADVISORY_MISSIONS) {
    expect(MISSIONS).toContain(mission);
    expect(onboarding).not.toContain(mission.id);
    expect(mission.advice.flow).toHaveLength(3);
    expect(mission.advice.model.length).toBeGreaterThan(100);
    expect(new URL(mission.reference.url).protocol).toBe('https:');
    expect(new Set(mission.questions.map(question => question.id)).size).toBe(3);
  }
});
test('objection cases join the shared mission engine and include a response to rehearse',()=>{
  expect(OBJECTION_MISSIONS.length).toBeGreaterThan(0);
  expect(ROLES.AE.missions).toContain('objection');
  for (const mission of OBJECTION_MISSIONS) {
    expect(MISSIONS).toContain(mission);
    expect(mission.objection.prompt).toBeTruthy();
    expect(mission.objection.model).toBeTruthy();
  }
});
test('Playbook simulations connect the practice prompt to the current Hub guide',()=>{
  const onboarding = Object.values(ROLES).flatMap(role => role.missions);
  expect(PLAYBOOK_MISSIONS.length).toBeGreaterThanOrEqual(6);
  for (const mission of PLAYBOOK_MISSIONS) {
    expect(MISSIONS).toContain(mission);
    expect(onboarding).not.toContain(mission.id);
    expect(mission.reference.url).toBe('/?hubView=playbook');
    expect(mission.reference.section).toBeTruthy();
    expect(mission.playbook.prompt).toBeTruthy();
    expect(mission.playbook.model.length).toBeGreaterThan(100);
  }
});
test('all four training categories include basic, intermediate and advanced cases',()=>{
  const cases = [
    DEMO_MISSIONS,
    ADVISORY_MISSIONS,
    [...OBJECTION_MISSIONS, MISSIONS.find(mission=>mission.id==='objection')!],
    [...AE_ROLEPLAY_STAGES.map(stage=>MISSIONS.find(mission=>mission.id===stage.mission)!), HYPOTHESIS_MISSION],
  ];
  for (const category of cases) {
    expect(new Set(category.map(trainingLevel))).toEqual(new Set(Object.keys(TRAINING_LEVELS)));
  }
  expect(trainingLevel({})).toBe('intermediate');
});
test('SPICED covers five stages and starts Critical Event with a known date and pain',()=>{
  expect(SPICED_MISSIONS.map(mission=>mission.spiced.label)).toEqual(['Situación','Dolor','Impacto','Critical Event','Decisión']);
  for (const mission of SPICED_MISSIONS) {
    expect(MISSIONS).toContain(mission);
    expect(mission.spiced.responses.length).toBeGreaterThanOrEqual(3);
    expect(mission.playbook.prompt).toBeTruthy();
  }
  const criticalEvent = SPICED_MISSIONS.find(mission=>mission.id==='spiced-critical-event')!;
  expect(criticalEvent.story).toContain('14 de diciembre');
  expect(criticalEvent.questions[0]?.options[criticalEvent.questions[0].correct]).toContain('Qué pasaría si');
  expect(criticalEvent.spiced.responses.some(response=>response.includes('podemos seguir operando'))).toBe(true);
});
test('account comes exclusively from verified identity and reads stay isolated',async()=>{
  const f=fixture();const response=await f.gateway(f.request('alice',{revision:0,payload,userId:'bob'}));expect(response?.status).toBe(200);expect(f.writes).toEqual(['alice']);
  const bob=await f.gateway(new Request('https://hub.test/api/academy/progress',{headers:{cookie:cookie('bob')}}));expect(await bob?.json()).toEqual({revision:0,payload:{}});
  expect((await f.gateway(f.request('unknown')))?.status).toBe(401);
});
test('the People template is available only through authenticated progress reads',async()=>{
  const peoplePlan={periods:['Day 1'],phases:[{title:'Welcome',entries:[{id:1,period:0,title:'Welcome',owner:'Team',action:'Join the session'}]}]};
  const f=fixture(peoplePlan);
  const get=(token:string)=>f.gateway(new Request('https://hub.test/api/academy/progress',{headers:{cookie:cookie(token)}}));
  const unauthorized=await get('unknown');
  expect(unauthorized?.status).toBe(401);
  expect(await unauthorized?.json()).not.toHaveProperty('peoplePlan');
  const authorized=await get('alice');
  expect(authorized?.headers.get('cache-control')).toBe('private, no-store');
  expect(await authorized?.json()).toEqual({revision:0,payload:{},peoplePlan});
  const saved=await f.gateway(f.request());
  expect(await saved?.json()).not.toHaveProperty('peoplePlan');
  expect(f.rows.get('alice').payload).toEqual(payload);
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

test('the AE route retains all activity IDs and has a roleplay for each Playbook stage in order',()=>{
  const days = AE_ONBOARDING_WEEKS.flatMap((week, w) => week.days.map((day, d) => ({...day, key:w+'-'+d})));
  expect(days).toHaveLength(10);
  expect(days.flatMap(day => day.activities.map(activity => activity.id))).toEqual(Array.from({length:54},(_,i)=>i+1));
  expect(days.flatMap(day => AE_ROLEPLAY_STAGES.filter(stage => stage.day === day.key).map(stage => stage.stage))).toEqual([0,1,2,3,4,5,6]);
  expect(new Set(AE_ROLEPLAY_STAGES.map(stage => stage.mission)).size).toBe(7);
  for (const stage of AE_ROLEPLAY_STAGES) {
    expect(PLAYBOOK_MISSIONS.find(mission => mission.id === stage.mission)?.playbook.prompt).toBeTruthy();
    expect(stage.check.length).toBeGreaterThan(50);
  }
});
