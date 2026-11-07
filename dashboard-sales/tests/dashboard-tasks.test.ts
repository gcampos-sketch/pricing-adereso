import { test, expect } from 'bun:test';
import { dashboardTasks, e4ReviewEvidence, reviewQueue, copyReviewTasks } from '../src/lib/dashboard-tasks';
import { emptyRepository, visibleNotices, type Notice } from '../src/lib/sales-notifications';
import type { DealDTO, PulseReport, StageJourney } from '../src/lib/pulse-types';
const now='2026-11-07T01:00:00Z';
const deal=(id:string,stageId:string,ownerId='82596016',segment='Inbound')=>({id,name:id,stageId,ownerId,owner:ownerId,segment,stage:'E5',stageFull:'5. Negociación',amountValue:0} as DealDTO);
const journey=(d:DealDTO,entered:Record<string,string>={}):StageJourney=>({deal:d,createdAt:'2026-01-01',entered,days:{}});
const inactive=deal('inactive','171385863'), warning=deal('warning','1278792585'), candidate=deal('e4','171385867'), legacy=deal('legacy','171385867');
const journeys=[journey(inactive),journey(warning),journey(candidate,{E2:'2026-10-01',E5:'2026-10-05'}),journey(legacy)];
const report={generatedAt:now,stageJourneys:journeys,executiveStrip:{onTrack:{yes:[],no:[warning]}},warnings:[{id:'team',modal:'warnings',reasons:[{label:'Falta aprobación',modal:'reason'}]}],tracking:[],drilldowns:{warnings:{deals:[warning]},reason:{deals:[warning]},late:{deals:[warning]}},taskHygiene:[{id:'team',overdueTaskModal:'late'}],closeHygiene:[],alerts:[]} as unknown as PulseReport;
const scope={owner:'team',role:'all' as const,stages:[],matchesType:()=>true};

test('bell collects inactive, zero-amount warnings, explicit No on track, E4 review and existing hygiene without duplicate deals',()=>{
 const tasks=dashboardTasks(report,scope);
 expect(tasks.map(t=>t.id).sort()).toEqual(['e4','inactive','warning']);
 expect(tasks.find(t=>t.id==='warning')?.reasons.map(r=>r.kind)).toEqual(['warning','off-track','hygiene']);
 expect(tasks.find(t=>t.id==='warning')?.reasons[0]?.evidence).toContain('Falta aprobación');
 expect(tasks.find(t=>t.id==='e4')?.reasons[0]?.evidence).toContain('no confirma un salto');
});
test('owner, role, type and stage filters apply to every source; dates do not hide current operational warnings',()=>{
 expect(dashboardTasks(report,{...scope,owner:'other'})).toEqual([]);
 expect(dashboardTasks(report,{...scope,role:'KAM'})).toEqual([]);
 expect(dashboardTasks(report,{...scope,matchesType:d=>d.segment==='Upsell'})).toEqual([]);
 expect(dashboardTasks(report,{...scope,stages:['E4']})).toEqual([]);
 expect(dashboardTasks({...report,currentPeriod:'2020-Q1'},scope).map(t=>t.key)).toEqual(dashboardTasks(report,scope).map(t=>t.key));
});
test('E4 absence alone, invalid/backwards/future dates, observed E4 or completed service never prove a skipped stage',()=>{
 const j=journeys[2]!;
 expect(e4ReviewEvidence(j,Date.parse(now))).not.toBeNull();
 for(const variant of [journey(legacy),{...j,entered:{E2:'bad',E5:'2026-10-05'}},{...j,entered:{E2:'2026-10-06',E5:'2026-10-05'}},{...j,entered:{E2:'2026-10-01',E5:'2027-10-05'}},{...j,entered:{...j.entered,E4:'2026-10-03'}},{...j,days:{E4:1}},{...j,deal:{...j.deal,stageId:'173990327'}}]) expect(e4ReviewEvidence(variant,Date.parse(now))).toBeNull();
});
test('read-only refresh keeps review keys stable; changed adverse evidence and owner handoff reopen them',()=>{
 const old=dashboardTasks(report,scope).find(t=>t.id==='warning')!;
 expect(dashboardTasks({...report,generatedAt:'2026-11-07T02:00:00Z'},scope).find(t=>t.id==='warning')?.key).toBe(old.key);
 const changed={...report,executiveStrip:{...report.executiveStrip!,onTrack:{yes:[],no:[]}}};
 expect(dashboardTasks(changed,scope).find(t=>t.id==='warning')?.key).not.toBe(old.key);
 const moved={...warning,ownerId:'331766554'};
 const transferred={...report,drilldowns:{...report.drilldowns,warnings:{...report.drilldowns['warnings']!,deals:[moved]}}};
 expect(dashboardTasks(transferred,scope).find(t=>t.id==='warning')?.key).not.toBe(old.key);
});
test('personal producer alerts merge by deal without broadening their authorized owner scope',()=>{
 const notice={key:'legacy',record:{id:warning.id,name:warning.name,owner:'Gonza',ownerId:'82596016',stage:'E5',segment:'inbound',risks:['intentos_sin_respuesta'],evidence:'sin contrato',reviewedAt:now},fingerprint:'evidence-1',verified:false} as Notice;
 const repo={...emptyRepository('account','82596016'),active:[notice]};
 const own=visibleNotices(repo,{owner:'team',role:'all',type:'all',stages:[]});
 const tasks=dashboardTasks(report,scope), merged=reviewQueue(tasks,own);
 expect(merged.length).toBe(tasks.length);
 expect(reviewQueue(tasks.map(t=>t.id===warning.id?{...t,ownerId:'different'}:t),own).find(t=>t.id===warning.id)?.notice).toBeUndefined();
 expect(merged.find(t=>t.id===warning.id)?.reasons.some(r=>r.kind==='adobo-risk')).toBe(true);
 expect(reviewQueue(tasks,visibleNotices(repo,{owner:'other',role:'all',type:'all',stages:[]})).some(t=>t.notice)).toBe(false);
 expect(reviewQueue(tasks,[{...notice,fingerprint:'evidence-2'}]).find(t=>t.id===warning.id)?.key).not.toBe(merged.find(t=>t.id===warning.id)?.key);
});
test('copy includes every task and all reasons, with CRM links and review-only scope',()=>{
 const tasks=dashboardTasks(report,scope), text=copyReviewTasks(tasks,now);
 for(const t of tasks) {expect(text).toContain(t.name);expect(text).toContain(t.url);for(const r of t.reasons)expect(text).toContain(r.evidence);}
 expect(text).toContain('No autoriza');expect(text).toContain('sin filtro de año/trimestre');
});
