import { describe, expect, test } from 'bun:test';
import { legacyContactPercent, crmFractionPercent, episodeResponseMetric, dealIntelligence, intelligenceDeals, verifiedContext, type AdoboVerifiedContextV1, type FollowupEpisodesV1 } from '../src/lib/adobo-intelligence';
import { contactTemperature, normRate } from '../src/lib/adobo.server';
import type { DealDTO } from '../src/lib/pulse-types';

const evidence = { url: 'https://example.org/evidence', at: '2026-10-19T00:00:00Z' };
const NOW = Date.parse('2026-10-19T03:29:00Z');
const temporal = (): NonNullable<AdoboVerifiedContextV1['temporal']> => ({version:'adobo-context-time/v1', observedAt:evidence.at,
  window:{start:'2026-10-01',end:evidence.at}, validity:{version:'producer-validity/v1',maxAgeMs:24*60*60*1000}});
// Test-only producer contract, not a commercial/default TTL.
const metric = (): FollowupEpisodesV1 => ({ version: 'followup-episodes/v1', methodology: 'responded-eligible-episodes', verified: true, fresh: true, coverageVerified: true, pauseAgreed: false, window: { start: '2026-10-01', end: '2026-10-19' }, observedAt: evidence.at, validity: {version:'producer-validity/v1', maxAgeMs: 24 * 60 * 60 * 1000}, coverage: { covered: 3, total: 3 }, episodes: [
  { id: '1', state: 'eligible', response: evidence, evidence: {...evidence, at:'2026-10-17T00:00:00Z'} },
  { id: '2', state: 'eligible', response: null, evidence: {...evidence, at:'2026-10-17T00:00:00Z'}, dueAt:'2026-10-18T00:00:00Z' },
  { id: '3', state: 'pending', response: null, evidence },
] });
const deal = (id = 'a'): DealDTO => ({ id, name: id, owner: 'Owner', ownerId: 'unknown-owner', stage: 'E2', segment: 'Inbound', adoboScoreValue: 80, adobo: { properties: { adobo_closing_score: '80' }, scoreChangedAt: evidence.at } } as DealDTO);

describe('documented contact percent vs CRM fractions', () => {
  for (const [raw, expected] of [[null,null], ['',null], ['0',0], ['0.5',0.5], ['1',1], ['25',25], ['100',100], ['150',150]] as const) {
    test(`legacy ${String(raw)} retains percent units`, () => {
      expect(legacyContactPercent(raw)).toBe(expected);
      expect(normRate(raw)).toBe(expected);
    });
  }
  test('CRM fractions keep their separate contract', () => {
    expect(crmFractionPercent('0.5')).toBe(50);
    expect(crmFractionPercent('1')).toBe(100);
    expect(crmFractionPercent(null)).toBeNull();
    expect(crmFractionPercent('')).toBeNull();
  });
});
describe('episode metric contract', () => {
  test('one response per eligible episode, pending excluded', () => {
    expect(episodeResponseMetric(metric(), NOW)).toMatchObject({value: 50, responded: 1, eligible: 2, coverageStatus:'complete'});
  });
  test('valid eligible plus future-due pending preserves eligible metric', () => {
    const m=metric(); m.episodes=m.episodes.filter(e=>e.id!=='2'); m.coverage={covered:2,total:2};
    m.episodes[1].dueAt='2026-10-25T00:00:00Z';
    expect(episodeResponseMetric(m,NOW)).toMatchObject({value:100,eligible:1,responded:1});
    m.episodes[1].evidence={...evidence,at:'2026-10-20'};
    expect(episodeResponseMetric(m,NOW)).toBeNull();
  });
  test('no eligible denominator is missing, not zero', () => {
    const m = metric(); m.episodes = m.episodes.filter(e => e.state === 'pending');
    m.coverage = {covered:1,total:1};
    expect(episodeResponseMetric(m, NOW)).toMatchObject({value:null, eligible:0});
  });
  test('duplicate episodes rejected, not silently truncated', () => {
    const m = metric(); m.episodes.push(m.episodes[0] as typeof m.episodes[number]);
    expect(episodeResponseMetric(m, NOW)).toBeNull();
  });
  for (const key of ['verified','fresh','coverageVerified'] as const) test(`requires ${key}`, () => {
    const m = metric(); m[key] = false; expect(episodeResponseMetric(m, NOW)).toBeNull();
  });
  test('unknown pause and missing source rejected', () => {
    const m = metric(); m.pauseAgreed = null; expect(episodeResponseMetric(m, NOW)).toBeNull();
    m.pauseAgreed = false; m.episodes[0].evidence = { url: 'javascript:alert(1)', at: evidence.at };
    expect(episodeResponseMetric(m, NOW)).toBeNull();
  });
  const withFollowup = (m: FollowupEpisodesV1) => {
    const d = deal();
    d.adobo.verifiedContext = {version:'adobo-evidence/v1', temporal:temporal(), verified:true, fresh:true, coverageVerified:true, evaluation: evidence, history:[], lastCustomerResponse:null, nextStep:null, commitment:null, pinzasEvidence:null, followup:m};
    return d;
  };
  test('zero coverage 0/3 is explicit, never a zero rate or confirmed absence', () => {
    const m = metric(); m.coverage.covered = 0; m.episodes = [];
    expect(episodeResponseMetric(m, NOW)).toMatchObject({value:null, coverageStatus:'partial', eligible:0});
    expect(dealIntelligence(withFollowup(m), NOW)).toMatchObject({noResponse:null, insufficient:true, action:false});
  });
  for (const key of ['covered','total'] as const) {
    for (const value of [NaN, Infinity, -Infinity, 0.5, 1.5, -1]) test(`invalid coverage ${key}=${value}`, () => {
      const m = metric(); m.coverage[key] = value;
      expect(episodeResponseMetric(m, NOW)).toBeNull();
    });
  }
  test('total must be positive', () => {
    const m = metric(); m.coverage = {covered:0,total:0}; m.episodes=[];
    expect(episodeResponseMetric(m, NOW)).toBeNull();
  });
  test('coverage cannot exceed total or disagree with episode evidence', () => {
    const m = metric(); m.coverage.covered = 4;
    expect(episodeResponseMetric(m, NOW)).toBeNull();
    m.coverage.covered = 0;
    expect(episodeResponseMetric(m, NOW)).toBeNull();
  });
  test('partial coverage never confirms global absence', () => {
    const m = metric(); m.episodes = [m.episodes[1]]; m.coverage.covered=1;
    expect(episodeResponseMetric(m, NOW)).toMatchObject({value:null, coverageStatus:'partial', eligible:1, responded:0});
    expect(dealIntelligence(withFollowup(m), NOW)).toMatchObject({noResponse:null, action:false, insufficient:true});
  });
  test('complete, expired eligible episodes can confirm absence; pending excluded', () => {
    const m = metric(); m.episodes = m.episodes.slice(1); m.coverage={covered:2,total:2};
    expect(episodeResponseMetric(m, NOW)).toMatchObject({value:0, eligible:1, responded:0});
    expect(dealIntelligence(withFollowup(m), NOW).noResponse).toBe(true);
  });
  for (const validity of [undefined, null, {version:'producer-validity/v1' as const,maxAgeMs:0}, {version:'producer-validity/v1' as const,maxAgeMs:NaN}, {version:'producer-validity/v1' as const,maxAgeMs:Infinity}, {version:'producer-validity/v1' as const,maxAgeMs:0.5}, {version:'producer-validity/v1' as const,maxAgeMs:1}]) {
    test(`missing/invalid/expired producer validity ${String(validity?.maxAgeMs)}`, () => {
      const m=metric(); m.validity=validity;
      expect(episodeResponseMetric(m,NOW)).toBeNull();
      expect(dealIntelligence(withFollowup(m),NOW).noResponse).toBeNull();
    });
  }
  test('TTL exact expiry boundary is not fresh', () => {
    const m=metric();
    expect(episodeResponseMetric(m, Date.parse(m.observedAt) + (m.validity?.maxAgeMs ?? 0))).toBeNull();
  });
  test('year 2000 snapshot cannot assert fresh merely through booleans', () => {
    const m=metric(); m.window={start:'2000-01-01',end:'2000-01-03'}; m.observedAt='2000-01-03';
    m.episodes=[{id:'old',state:'eligible',evidence:{...evidence,at:'2000-01-01'},response:null,dueAt:'2000-01-02'}]; m.coverage={covered:1,total:1};
    expect(episodeResponseMetric(m,NOW)).toBeNull();
    expect(dealIntelligence(withFollowup(m),NOW).noResponse).toBeNull();
  });
  for (const mutate of [
    (m:FollowupEpisodesV1)=>{m.window.start='2026-10-20';},
    (m:FollowupEpisodesV1)=>{m.window.end='2026-10-20';},
    (m:FollowupEpisodesV1)=>{m.observedAt='2026-10-20';},
    (m:FollowupEpisodesV1)=>{m.observedAt='2026-10-18';},
    (m:FollowupEpisodesV1)=>{m.window.start='invalid';},
    (m:FollowupEpisodesV1)=>{m.episodes[0].evidence={...evidence,at:'2026-09-30'};},
    (m:FollowupEpisodesV1)=>{m.episodes[0].evidence={...evidence,at:'2026-10-20'};},
    (m:FollowupEpisodesV1)=>{m.episodes[0].response={...evidence,at:'2026-09-30'};},
    (m:FollowupEpisodesV1)=>{m.episodes[0].response={...evidence,at:'2026-10-20'};},
    (m:FollowupEpisodesV1)=>{m.episodes[0].response={...evidence,at:'2026-10-16'};},
    (m:FollowupEpisodesV1)=>{m.episodes[0].response={url:'http://example.org',at:evidence.at};},
    (m:FollowupEpisodesV1)=>{m.episodes[1].dueAt=null;},
    (m:FollowupEpisodesV1)=>{m.episodes[1].dueAt='invalid';},
    (m:FollowupEpisodesV1)=>{m.episodes[1].dueAt='2026-10-16';},
    (m:FollowupEpisodesV1)=>{m.episodes[1].dueAt='2026-10-19T00:00:00Z';},
    (m:FollowupEpisodesV1)=>{m.episodes[1].dueAt='2026-10-19T01:00:00Z';},
    (m:FollowupEpisodesV1)=>{m.episodes[1].dueAt='2026-10-20';},
  ]) test(`rejects invalid chronology/evidence/deadline case ${mutate.toString()}`, () => {
    const m=metric(); mutate(m);
    expect(episodeResponseMetric(m,NOW)).toBeNull();
    expect(dealIntelligence(withFollowup(m),NOW).noResponse).toBeNull();
  });
  test('injected now must be finite', () => {
    expect(episodeResponseMetric(metric(),NaN)).toBeNull();
    expect(episodeResponseMetric(metric(),Infinity)).toBeNull();
  });
});
describe('no invented contact alerts or score caps', () => {
  for (const replies of [null,'','0']) test(`unverified replies ${String(replies)} never caps`, () => {
    expect(contactTemperature({ adobo_intentos_contacto_prospecto: '5', adobo_respuestas_prospecto: replies, adobo_tasa_contactabilidad_prospecto: '0.5', adobo_closing_score: '90' }))
      .toMatchObject({state: 'unknown', cap: null, rawScore: 90, cappedScore: 90, rate: 0.5});
  });
  test('unknown replies remain unknown even with verified legacy envelope', () => {
    expect(contactTemperature({ adobo_intentos_contacto_prospecto: '5', adobo_respuestas_prospecto: null, adobo_tasa_contactabilidad_prospecto: '1' }, { verified: true, fresh: true, coverageVerified: true, pauseAgreed: false }).cap).toBeNull();
  });
  test('old evidence and agreed pause never caps', () => {
    const p = { adobo_intentos_contacto_prospecto: '5', adobo_respuestas_prospecto: '0', adobo_tasa_contactabilidad_prospecto: '0' };
    expect(contactTemperature(p, {verified: true, fresh: false, coverageVerified: true, pauseAgreed: false}).cap).toBeNull();
    expect(contactTemperature(p, {verified: true, fresh: true, coverageVerified: true, pauseAgreed: true}).cap).toBeNull();
  });
  test('snapshot date and trend do not invent evaluation, delta or no-response', () => {
    const d = deal(); d.adobo.scoreTrend = 'baja'; d.adobo.contactReplies = 0;
    expect(dealIntelligence(d, Date.parse(evidence.at))).toMatchObject({delta: null, noResponse: null, overdue: null, context: null, insufficient: true});
  });
  test('0 score is valid, blank score is not zero', () => {
    const d = deal(); d.adobo.properties = {adobo_closing_score: '0'};
    expect(dealIntelligence(d, 0).score).toBe(0);
    d.adobo.properties.adobo_closing_score = ''; expect(dealIntelligence(d, 0).score).toBeNull();
  });
  test('agreed pause prevents no-response action even with eligible episodes', () => {
    const d = deal(); const m = metric(); m.pauseAgreed = true;
    m.episodes = m.episodes.slice(1); m.coverage = {covered:2,total:2};
    expect(episodeResponseMetric(m, NOW)).toMatchObject({value:0, eligible:1, pauseAgreed:true});
    d.adobo.verifiedContext = {version:'adobo-evidence/v1', temporal:temporal(), verified:true, fresh:true, coverageVerified:true, evaluation: evidence, history:[], lastCustomerResponse:null, nextStep:null, commitment:null, pinzasEvidence:null, followup:m};
    expect(dealIntelligence(d, NOW).noResponse).toBeNull();
    expect(dealIntelligence(d, NOW).action).toBe(false);
  });
});
describe('context temporal evidence contract', () => {
  const fixture=()=>{
    const d=deal();
    const c:AdoboVerifiedContextV1={version:'adobo-evidence/v1',temporal:temporal(),verified:true,fresh:true,coverageVerified:true,
      evaluation:evidence,history:[{score:90,evidence:{...evidence,at:'2026-10-17'}},{score:80,evidence}],
      lastCustomerResponse:null,nextStep:null,commitment:null,pinzasEvidence:null,followup:metric()};
    d.adobo.verifiedContext=c;
    return {d,c};
  };
  test('valid context admits real historic delta and current evaluation',()=>{
    const {d}=fixture();
    expect(dealIntelligence(d,NOW)).toMatchObject({delta:-10,context:{evaluation:evidence}});
  });
  const mutations:[string,(c:AdoboVerifiedContextV1)=>void][]=[
    ['missing contract',c=>{c.temporal=null;}],
    ['expired validity',c=>{if(c.temporal)c.temporal.validity.maxAgeMs=1;}],
    ['NaN validity',c=>{if(c.temporal)c.temporal.validity.maxAgeMs=NaN;}],
    ['future observation',c=>{if(c.temporal)c.temporal.observedAt='2026-10-20';}],
    ['inverted window',c=>{if(c.temporal)c.temporal.window.start='2026-10-20';}],
    ['old evaluation in current snapshot',c=>{c.evaluation={...evidence,at:'2026-10-02'};}],
    ['future evaluation',c=>{c.evaluation={...evidence,at:'2026-10-20'};}],
    ['future history',c=>{c.history[1].evidence={...evidence,at:'2026-10-20'};}],
    ['history outside window',c=>{c.history[0].evidence={...evidence,at:'2000-01-01'};}],
    ['history NaN score',c=>{c.history[0].score=NaN;}],
    ['commitment without evidence',c=>{c.commitment={dueAt:'2026-10-18',completed:false,evidence:{url:'',at:'2026-10-17'}};}],
    ['old commitment evidence',c=>{c.commitment={dueAt:'2026-10-18',completed:false,evidence:{...evidence,at:'2026-10-02'}};}],
    ['commitment due before evidence',c=>{c.commitment={dueAt:'2026-10-18',completed:false,evidence};}],
    ['future commitment evidence',c=>{c.commitment={dueAt:'2026-10-25',completed:false,evidence:{...evidence,at:'2026-10-20'}};}],
    ['old last response',c=>{c.lastCustomerResponse={...evidence,at:'2026-10-02'};}],
    ['next step due before source',c=>{c.nextStep={text:'Real step',responsible:null,dueAt:'2026-10-18',evidence};}],
  ];
  for(const [name,mutate] of mutations)test(`${name} fails closed`,()=>{
    const {d,c}=fixture(); mutate(c);
    expect(verifiedContext(d,NOW)).toBeNull();
    expect(dealIntelligence(d,NOW)).toMatchObject({context:null,delta:null,overdue:null,noResponse:null});
  });
  test('real overdue commitment is admitted, future due date is not fabricated overdue',()=>{
    const {d,c}=fixture();
    c.commitment={dueAt:'2026-10-18T23:30:00Z',completed:false,evidence:{...evidence,at:'2026-10-18T23:00:00Z'}};
    expect(dealIntelligence(d,NOW).overdue).toBe(true);
    c.commitment.dueAt='2026-10-25';
    expect(dealIntelligence(d,NOW).overdue).toBe(false);
  });
  test('null evaluation remains missing, never inferred from snapshot time',()=>{
    const {d,c}=fixture(); c.evaluation=null;
    expect(verifiedContext(d,NOW)?.evaluation).toBeNull();
  });
  test('nonfinite now and exact expiry fail closed',()=>{
    const {d}=fixture();
    expect(verifiedContext(d,NaN)).toBeNull();
    expect(verifiedContext(d,Date.parse(evidence.at)+24*60*60*1000)).toBeNull();
  });
});
describe('shared scope and verifiable priority', () => {
  test('owner, stage, type filters and duplicate IDs', () => {
    const a = deal('a'), b = deal('b'); b.ownerId = 'other';
    expect(intelligenceDeals([a,a,b], {owner:'unknown-owner',role:'all',stages:['E2'],matchesType:d=>d.segment==='Inbound'},0).map(d=>d.id)).toEqual(['a']);
    expect(intelligenceDeals([a], {owner:'team',role:'all',stages:['E4'],matchesType:()=>true},0)).toEqual([]);
    expect(intelligenceDeals([a], {owner:'team',role:'AE',stages:[],matchesType:()=>true},0)).toEqual([]);
  });
  test('real CRM pinzas ranks first without inventing reason', () => {
    const a = deal('a'), b = deal('b'); b.adobo.properties = {adobo_closing_score:'80', seguimiento_con_pinzas:'true'};
    expect(intelligenceDeals([a,b],{owner:'team',role:'all',stages:[],matchesType:()=>true},0).map(d=>d.id)).toEqual(['b','a']);
  });
});