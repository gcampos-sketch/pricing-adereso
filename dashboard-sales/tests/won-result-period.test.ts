import {test,expect} from 'bun:test';
import {wonByStage6Entry,withWonDeals,stage6AttributionDates} from '../src/lib/won-result-period';
import type {DealDTO,StageJourney} from '../src/lib/pulse-types';
const row=(id:string,entry:string,stage='173990327',close='2026-10-15'):StageJourney=>({deal:{id,name:id,stageId:stage,ownerId:'owner',amountValue:100,otfValue:120,closeDateValue:close} as DealDTO,entered:entry?{E6:entry}:{},days:{},createdAt:'2020-01-01'});
test('E6 attribution uses the selected recorded entry period, never close date or later won stages',()=>{
 const rows=[row('entryQ4','2026-10-01','1086544542','2026-09-01'),row('entryQ3','2026-09-30'),row('missing',''),row('lost','2026-10-01','171385869'),row('future','2027-01-01')];
 expect(wonByStage6Entry([...rows,rows[0]!],['2026-Q4']).map(deal=>deal.id)).toEqual(['entryQ4']);
 expect(wonByStage6Entry(rows,['2026-Q1','2026-Q2','2026-Q3','2026-Q4']).map(deal=>deal.id)).toEqual(['entryQ4','entryQ3']);
});
test('changing won attribution updates amounts and OTF while preserving separate closed losses',()=>{
 const stats=withWonDeals(undefined,wonByStage6Entry([row('a','2026-10-01')],['2026-Q4']));
 expect([stats.won,stats.wonAmount,stats.wonOtf,stats.lost]).toEqual([1,100,120,0]);
 expect(stage6AttributionDates([row('a',String(Date.parse('2026-10-01T00:00:00Z')))])).toEqual({a:'2026-10-01'});
});
