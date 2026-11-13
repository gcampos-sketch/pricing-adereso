import {test,expect} from 'bun:test';
import {buildQuotaScenario,compareQuotaScenario,scenarioMonths,suggestedScenarioMonth,type ScenarioRequest} from '../src/lib/quota-scenarios';
import type {DealDTO,PulseReport,StageJourney} from '../src/lib/pulse-types';
const deal=(id:string,ownerId='82596016',amountValue=100,stageId='171385867',closeDateValue='2026-11-20'):DealDTO=>({id,name:id,url:'https://example.org/'+id,ownerId,owner:ownerId,amountValue,otfValue:120,stageId,closeDateValue,dealType:'Oportunidad',productToHire:'Desk',segment:'Outbound'} as DealDTO);
const won=deal('1','82596016',200,'174677684');
const chosen=deal('2');
const journey=(deal:DealDTO,entry='2026-11-01'):StageJourney=>({deal,entered:{E6:entry},days:{},createdAt:'2026-01-01'});
const report=(deals=[won,chosen]):PulseReport=>({generatedAt:'2026-11-13T10:00:00Z',stageJourneys:deals.map(d=>journey(d)),periods:{owners:{'82596016':'Gonza','331766554':'Otro'},quotas:{'2026-Q4':{'82596016':1000,'331766554':2000}},data:{'2026-Q4':{team:{wonDeals:deals.filter(d=>d.stageId==='174677684'),lostDeals:[]},owners:{}}}}} as unknown as PulseReport);
const input:ScenarioRequest={requestId:'a',scope:{owner:'82596016',role:'all',type:'all',periods:['2026-Q4'],basis:'close'},ids:['2'],simulationMonth:'2026-12',expected:{baseline:210,target:320,quota:1000}};
test('snapshot freezes baseline, selected contribution, timestamp and owner quota without team widening',()=>{
 const saved=buildQuotaScenario(report(),input,'2026-11-13T12:00:00Z');
 expect([saved.baseline,saved.contribution,saved.target,saved.quota]).toEqual([210,110,320,1000]);
 expect(saved.createdAt).toBe('2026-11-13T12:00:00Z');expect(saved.deals.map(d=>d.id)).toEqual(['2']);
 expect(()=>buildQuotaScenario(report(),{...input,ids:['2','3']},'x')).toThrow();
 expect(()=>buildQuotaScenario(report(),{...input,expected:{...input.expected,target:999}},'x')).toThrow('informe cambió');
});
test('rejects selected won, excluded, outside owner or period records',()=>{
 for(const d of [deal('2','other'),deal('2','82596016',100,'171385869'),deal('2','82596016',100,'174677684'),deal('2','82596016',100,'171385867','2027-01-01'),{...chosen,dealType:'Renovación'}])expect(()=>buildQuotaScenario(report([won,d]),input,'x')).toThrow();
});
test('comparison uses live outcomes while retaining the saved projection and unknowns',()=>{
 const saved=buildQuotaScenario(report(),input,'2026-11-13T12:00:00Z');
 const actual=compareQuotaScenario(saved,report([won,deal('2','82596016',150,'174677684')]),Date.parse('2026-12-01'));
 expect([actual.actual,actual.delta,actual.won,actual.finished]).toEqual([370,50,1,false]);expect(saved.target).toBe(320);
 expect(compareQuotaScenario(saved,report([won]),Date.parse('2027-02-01')).rows[0]?.status).toBe('Sin dato actual');
 expect(compareQuotaScenario(saved,report(),Date.parse('2027-02-01')).finished).toBe(true);
});
test('entry-to-E6 comparison never falls back to close date',()=>{
 const s=buildQuotaScenario(report(),{...input,scope:{...input.scope,basis:'stage6'}},'2026-11-13T12:00:00Z');
 const live=report([won,deal('2','82596016',100,'174677684')]);live.stageJourneys[1]!.entered={E6:'2026-09-01'};
 const result=compareQuotaScenario(s,live);expect(result.won).toBe(0);expect(result.rows[0]?.status).toBe('Ganado fuera del criterio');expect(result.actual).toBe(210);
});

test('missing historical coverage remains unknown instead of a zero outcome',()=>{
 const saved=buildQuotaScenario(report(),input,'2026-11-13T12:00:00Z');
 const missing=report();missing.periods.data={};
 const actual=compareQuotaScenario(saved,missing);expect(actual.available).toBe(false);expect(actual.rows[0]?.status).toBe('Sin cobertura del período');
});

test('simulated month stays separate from the native CRM close date and belongs to the master period',()=>{
 const saved=buildQuotaScenario(report(),input,'2026-11-13T12:00:00Z');
 expect(saved.simulationMonth).toBe('2026-12');
 expect(saved.deals[0]?.simulatedCloseMonth).toBe('2026-12');
 expect(saved.deals[0]?.closeDateValue).toBe('2026-11-20');
 expect(chosen.closeDateValue).toBe('2026-11-20');
 expect(()=>buildQuotaScenario(report(),{...input,simulationMonth:'2027-01'},'x')).toThrow('filtro principal');
 expect(()=>buildQuotaScenario(report(),{...input,simulationMonth:'2026-13'},'x')).toThrow();
 expect(scenarioMonths(['2026-Q4'])).toEqual(['2026-10','2026-11','2026-12']);
 expect(suggestedScenarioMonth(['2026-Q4'],[chosen])).toBe('2026-11');
 const live=report([won,deal('2','82596016',100,'174677684','2026-12-15')]);
 const compared=compareQuotaScenario(saved,live);expect(compared.closedInPlannedMonth).toBe(1);
 expect(compared.rows[0]?.actualCloseMonth).toBe('2026-12');
 expect(compareQuotaScenario({...saved,simulationMonth:undefined,deals:saved.deals.map(({simulatedCloseMonth,...d})=>d)} as any,live).closedInPlannedMonth).toBe(0);
});
