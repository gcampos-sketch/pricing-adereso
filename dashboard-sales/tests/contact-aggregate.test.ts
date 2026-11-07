import { expect, test } from 'bun:test';
import { contactAggregatePayload, verifiedContactAggregate, type ContactSnapshotV1 } from '../src/lib/contact-aggregate';
import type { ContactTempScope, DealDTO, PulseReport } from '../src/lib/pulse-types';

const now=Date.parse('2026-10-19T03:32:00Z');
const observedAt='2026-10-19T03:00:00Z';
const evidence={url:'https://example.org/aggregate',at:observedAt};
const fixture=()=> {
  const snapshot:ContactSnapshotV1={version:'contact-snapshot/v1',id:'snapshot-1',observedAt,role:'all',window:{start:'2026-10-18T00:00:00Z',end:observedAt}};
  const deals=[{id:'a',ownerId:'owner-a',adobo:{contactVerified:true}},{id:'b',ownerId:'owner-b',adobo:{contactVerified:false}}] as DealDTO[];
  const scope=(id:string,list:DealDTO[]):ContactTempScope=> {
    const s:ContactTempScope={id,label:id,openCount:list.length,buckets:[],coldCount:0,coldAmount:0,coldModal:`${id}-cold`,coldPct:0};
    s.validation={version:'contact-aggregate/v1',verified:true,snapshot:structuredClone(snapshot),ownerId:id,evidence,
      validity:{version:'producer-validity/v1',maxAgeMs:3600000},payload:contactAggregatePayload(s),
      members:list.map(d=>({id:d.id,ownerId:d.ownerId,snapshotId:snapshot.id,observedAt,verified:true,evidence,validUntil:'2026-10-19T04:00:00Z'}))};
    return s;
  };
  const report={generatedAt:observedAt,roleScope:'all',contactSnapshot:snapshot,
    contactTemp:[scope('owner-a',[deals[0]]),scope('owner-b',[deals[1]]),scope('team',deals)],
    drilldowns:{'owner-owner-a-open':{deals:[deals[0]]},'owner-owner-b-open':{deals:[deals[1]]},'team-open':{deals}},
    stageJourneys:deals.map(deal=>({deal}))} as PulseReport;
  return {report,team:report.contactTemp?.find(s=>s.id==='team') as ContactTempScope,
    a:report.contactTemp?.find(s=>s.id==='owner-a') as ContactTempScope,
    b:report.contactTemp?.find(s=>s.id==='owner-b') as ContactTempScope};
};
test('a verified owner or stage journey cannot enable another owner without aggregate evidence',()=>{
  const {report,b}=fixture(); b.validation=null;
  expect(verifiedContactAggregate(report,'owner-a','all',now)?.id).toBe('owner-a');
  expect(verifiedContactAggregate(report,'owner-b','all',now)).toBeNull();
});
test('legacy aggregate with even all contactVerified flags is blocked without metadata',()=>{
  const {report}=fixture(); delete report.contactSnapshot;
  expect(verifiedContactAggregate(report,'team','all',now)).toBeNull();
});
test('coherent exact set with its own aggregate evidence is admitted',()=>{
  const {report}=fixture();
  expect(verifiedContactAggregate(report,'team','all',now)?.openCount).toBe(2);
});
const cases: [string,(f:ReturnType<typeof fixture>)=>void][]=[
  ['mixed old/fresh team',({team})=>{if(team.validation) team.validation.members[1].validUntil='2000-01-01';}],
  ['member date from old snapshot',({team})=>{if(team.validation) team.validation.members[1].observedAt='2000-01-01';}],
  ['unverified member',({team})=>{if(team.validation) team.validation.members[1].verified=false;}],
  ['member snapshot mismatch',({team})=>{if(team.validation) team.validation.members[1].snapshotId='other';}],
  ['aggregate snapshot mismatch',({team})=>{if(team.validation) team.validation.snapshot.id='other';}],
  ['member ID mismatch',({team})=>{if(team.validation) team.validation.members[1].id='other';}],
  ['duplicate member',({team})=>{if(team.validation) team.validation.members[1].id='a';}],
  ['missing member',({team})=>{team.validation?.members.pop();}],
  ['owner mismatch',({team})=>{if(team.validation) team.validation.members[1].ownerId='owner-a';}],
  ['aggregate owner mismatch',({team})=>{if(team.validation) team.validation.ownerId='owner-a';}],
  ['window mismatch',({team})=>{if(team.validation) team.validation.snapshot.window.start='2000-01-01';}],
  ['report read date mismatch',({report})=>{report.generatedAt='2026-10-19T02:00:00Z';}],
  ['no own evidence',({team})=>{if(team.validation) team.validation.evidence={url:'',at:observedAt};}],
  ['evidence outside window',({team})=>{if(team.validation) team.validation.evidence={...evidence,at:'2000-01-01'};}],
  ['member evidence outside window',({team})=>{if(team.validation) team.validation.members[1].evidence={...evidence,at:'2000-01-01'};}],
  ['future member evidence',({team})=>{if(team.validation) team.validation.members[1].evidence={...evidence,at:'2026-10-20'};}],
  ['changed payload after evaluation',({team})=>{team.coldCount=1;}],
  ['expired producer validity',({team})=>{if(team.validation) team.validation.validity.maxAgeMs=1;}],
  ['invalid producer validity',({team})=>{if(team.validation) team.validation.validity.maxAgeMs=NaN;}],
  ['missing exact member list',({report})=>{delete report.drilldowns['team-open'];}],
];
for(const [name,mutate] of cases) test(`${name} blocks aggregate`,()=>{
  const f=fixture(); mutate(f);
  expect(verifiedContactAggregate(f.report,'team','all',now)).toBeNull();
});
test('role mismatch and missing owner cannot fall back to team',()=>{
  const {report}=fixture();
  expect(verifiedContactAggregate(report,'team','AE',now)).toBeNull();
  expect(verifiedContactAggregate(report,'missing','all',now)).toBeNull();
});