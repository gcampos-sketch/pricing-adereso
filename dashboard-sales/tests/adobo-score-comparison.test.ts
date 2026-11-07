import {expect,test} from 'bun:test';
import {adoboScoreComparison,closingProbabilityComparison} from '../src/lib/adobo-score-comparison';
import type {DealDTO} from '../src/lib/pulse-types';
const now=Date.parse('2026-11-07T12:00Z');
function deal(previous='75',trend='subiendo'):DealDTO {return {id:'1',url:'https://app.hubspot.com/contacts/23480943/deal/1',stageId:'stage',adoboScoreValue:81,adobo:{scoreTrend:trend,properties:{adobo_closing_score:'81'},propertyHistory:{version:'hubspot-property-history/v1',dealId:'1',recordUrl:'https://app.hubspot.com/contacts/23480943/deal/1',fetchedAt:'2026-11-07T11:00Z',complete:true,properties:{adobo_closing_score:{truncated:false,versions:[{value:'81',at:'2026-11-06T12:00Z',sourceType:null},{value:previous,at:'2026-11-05T12:00Z',sourceType:null}]},dealstage:{truncated:false,versions:[{value:'stage',at:'2026-11-01T12:00Z',sourceType:null}]}}}}} as DealDTO;}
test('up, down and neutral use real prior score in the current stage interval',()=>{
  expect(adoboScoreComparison(deal(),now)).toMatchObject({label:'↑ Subiendo',delta:6});
  expect(adoboScoreComparison(deal('90','bajando'),now).delta).toBe(-9);
  expect(adoboScoreComparison(deal('81','estable'),now).label).toBe('→ Neutro');
});
test('reopening uncertainty, conflicting producer trend and absent history fail closed',()=>{
  const d=deal();d.adobo.propertyHistory!.properties.dealstage!.versions[0]!.at='2026-11-06T00:00Z';
  expect(adoboScoreComparison(d,now).delta).toBeNull();
  expect(adoboScoreComparison(deal('75','bajando'),now).delta).toBeNull();
  d.adobo.propertyHistory=null;expect(adoboScoreComparison(d,now).label).toBe('Sin comparación');
});

function probability(previous='0.3',current='0.5') {
  const d=deal(); d.probabilityValue=Number(current);
  d.adobo.propertyHistory!.properties.hs_deal_stage_probability={truncated:false,versions:[
    {value:current,at:'2026-11-06T12:00Z',sourceType:null},
    {value:previous,at:'2026-11-05T12:00Z',sourceType:null},
  ]};return d;
}
test('CRM probability compares fractions as percentage points, independently from Adobo trend',()=>{
  expect(closingProbabilityComparison(probability(),now).delta).toBe(20);
  expect(closingProbabilityComparison(probability('0.7'),now).delta).toBe(-20);
  expect(closingProbabilityComparison(probability('0.5'),now).delta).toBe(0);
  expect(closingProbabilityComparison(probability('0','0.5'),now).detail).toContain('antes 0%');
});
test('probability never bridges an uncertain cycle or pretends a local edit is history',()=>{
  const d=probability(); d.adobo.propertyHistory!.properties.dealstage!.versions[0]!.at='2026-11-06T00:00Z';
  expect(closingProbabilityComparison(d,now).delta).toBeNull();
  const edited=probability();edited.probabilityValue=.6;
  expect(closingProbabilityComparison(edited,now).delta).toBeNull();
  const partial=probability();partial.adobo.propertyHistory!.complete=false;
  expect(closingProbabilityComparison(partial,now).delta).toBeNull();
  expect(closingProbabilityComparison(probability('50'),now).delta).toBeNull();
  const conflicting=probability();conflicting.adobo.propertyHistory!.properties.hs_deal_stage_probability!.versions.splice(1,0,{value:'0.7',at:'2026-11-06T12:00Z',sourceType:null});
  expect(closingProbabilityComparison(conflicting,now).delta).toBeNull();
});
