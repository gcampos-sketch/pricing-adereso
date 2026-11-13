import { expect, test } from 'bun:test';
import { dashboardActionGroups } from '../src/lib/dashboard-action-groups';
import type { DealDTO, PulseReport } from '../src/lib/pulse-types';
const at=Date.parse('2026-11-12T15:00:00Z');
const deal=(id:string,stageId:string,extra:Partial<DealDTO>={})=>({id,name:id,owner:'Gonza',ownerId:'82596016',stage:'E5',stageId,amountValue:0,segment:'Inbound',closeDateValue:'',...extra} as DealDTO);
const open=deal('open','171385867',{closeDateValue:'2026-11-10'}), signed=deal('kick','174677684'), warning=deal('warning','1278792585');
const draft=deal('draft','173990327',{contractStatus:'Borrador listo'}), sent=deal('sent','173990327',{contractStatus:'Enviado al cliente'});
const base=(rows:DealDTO[])=>({generatedAt:new Date(at).toISOString(),stageJourneys:rows.map(d=>({deal:d,createdAt:'2025-01-01',entered:{},days:{}})),executiveStrip:{onTrack:{yes:[],no:[open,open,warning]}},warnings:[{id:'team',modal:'warn',reasons:[{label:'Falta kick off',modal:'reason'}]}],drilldowns:{warn:{deals:[warning]},reason:{deals:[warning]}},alerts:[{id:'unwanted',reason:'Sin próxima actividad'}]} as unknown as PulseReport);
const scope={owner:'team',role:'all' as const,stages:[],matchesType:()=>true};
test('one group per requested action instead of one notification per deal, with native warning reasons',()=>{
 const groups=dashboardActionGroups(base([open,signed,warning,draft,sent]),scope,at);
 expect(groups.map(g=>g.id)).toEqual(['overdue','kickoff','warning','off-track','drafts','signature']);
 expect(groups.find(g=>g.id==='off-track')?.deals.map(d=>d.id)).toEqual(['open']);
 expect(groups.find(g=>g.id==='warning')?.reasons[0]).toMatchObject({label:'Falta kick off',deals:[warning]});
 expect(groups.find(g=>g.id==='drafts')?.deals).toEqual([draft]);
 expect(groups.find(g=>g.id==='signature')?.deals).toEqual([sent]);
});
test('closed/zero-status/blank contracts and generic hygiene or producer risks never create extra groups',()=>{
 const rows=[deal('blank','173990327'),deal('not-started','173990327',{contractStatus:'Sin iniciar'}),deal('done','173990327',{contractStatus:'Firmado'}),deal('not-sent','173990327',{contractStatus:'No enviado'}),deal('open-draft','171385867',{contractStatus:'Borrador listo'})];
 const r={...base(rows),executiveStrip:{onTrack:{yes:[],no:[]}},warnings:[],drilldowns:{}} as unknown as PulseReport;
 expect(dashboardActionGroups(r,scope,at)).toEqual([]);
});
test('current journey stage wins over an outdated warning drilldown; owner, role, type and stage scope intersect',()=>{
 const r=base([open,{...warning,stageId:'171385869'}]);
 expect(dashboardActionGroups(r,scope,at).some(g=>g.id==='warning')).toBe(false);
 for (const s of [{...scope,owner:'other'},{...scope,role:'KAM' as const},{...scope,matchesType:(d:DealDTO)=>d.segment==='Upsell'},{...scope,stages:['E4']}]) expect(dashboardActionGroups(r,s,at)).toEqual([]);
});
test('missing warning reason is explicit; no arbitrary date period hides current actions',()=>{
 const r={...base([warning]),currentPeriod:'2020-Q1',warnings:[],drilldowns:{}} as unknown as PulseReport;
 expect(dashboardActionGroups(r,scope,at).find(g=>g.id==='warning')?.reasons[0]?.label).toBe('Sin motivo registrado');
});
test('current ownership and closed state override older off-track evidence without leaking into the previous owner scope',()=>{
 const moved={...open,ownerId:'91603512'};
 const r=base([moved,{...warning,stageId:'171385869'}]);
 const groups=dashboardActionGroups(r,{...scope,owner:'82596016'},at);
 expect(groups).toEqual([]);
});

test('lost candidates form one deduplicated group with priority/competition drilldowns and current scope',()=>{
 const candidate=deal('candidate','171385867',{amountValue:2174});
 const closed=deal('closed','171385869');
 const r={...base([candidate,closed]),closeHygiene:[{id:'team',lostPriorityModal:'priority',lostCompetitionModal:'competition'}],drilldowns:{priority:{deals:[candidate,candidate,closed]},competition:{deals:[candidate]}}} as unknown as PulseReport;
 const group=dashboardActionGroups(r,scope,at).find(group=>group.id==='lost-candidate');
 expect(group?.deals).toEqual([candidate]);
 expect(group?.reasons.map(reason=>reason.label)).toEqual(['Prioridad','Competencia']);
 expect(dashboardActionGroups(r,{...scope,owner:'other'},at).some(group=>group.id==='lost-candidate')).toBe(false);
 const resolved={...r,drilldowns:{priority:{deals:[]},competition:{deals:[]}}} as unknown as PulseReport;
 expect(dashboardActionGroups(resolved,scope,at).some(group=>group.id==='lost-candidate')).toBe(false);
});
