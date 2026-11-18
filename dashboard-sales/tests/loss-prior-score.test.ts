import { expect, test } from 'bun:test';
import { lossPriorScore, valueBeforeLoss, priorScoreBuckets, type LossPriorScore } from '../src/lib/loss-prior-score';
const stage='lost'; const lost=new Set([stage]); const entry='2026-11-10T10:00:00.000Z'; const read='2026-11-18T10:00:00.000Z';
const v=(value:string,timestamp='2026-11-09T10:00:00.000Z')=>({value,timestamp});
const properties={pipeline:'commercial',dealstage:stage,[`hs_v2_date_entered_${stage}`]:entry};
const histories={dealstage:[v(stage,entry),v('open','2026-11-01T10:00:00.000Z')],adobo_closing_score:[v('0','2026-11-11T10:00:00.000Z'),v('72')],hs_deal_stage_probability:[v('0',entry),v('.85')]};
test('uses last strictly pre-loss values, independent of post-loss zero or simultaneous reset',()=>{
 const result=lossPriorScore('1',properties,histories,lost,'commercial',read);
 expect(result.eligible).toBe(true);expect(result.enteredAt).toBe(entry);
 expect(result.adobo).toEqual({value:72,at:'2026-11-09T10:00:00.000Z'});expect(result.probability.value).toBe(85);
});
test('reentry takes the latest corroborated loss entry, retaining scores from the reopened interval',()=>{
 const h={...histories,dealstage:[v(stage,entry),v('open','2026-11-08T10:00:00.000Z'),v(stage,'2026-11-02T10:00:00.000Z')],adobo_closing_score:[v('62'),v('90','2026-11-01T10:00:00.000Z')]};
 expect(lossPriorScore('1',properties,h,lost,'commercial',read).adobo.value).toBe(62);
});
test('never uses current values or close date when native entry or corroborating chronology is missing',()=>{
 for(const [p,h] of [[{...properties,hs_v2_date_entered_lost:null},histories],[properties,{...histories,dealstage:[]}],[properties,{...histories,dealstage:[v(stage)]}],[{...properties,hs_v2_date_entered_lost:'2027-01-01T00:00:00Z'},histories]] as const){
  const result=lossPriorScore('1',p,h,lost,'commercial',read);expect(result.enteredAt).toBeNull();expect(result.adobo.value).toBeNull();expect(result.probability.value).toBeNull();
 }
});
test('latest blank, invalid, undated or conflicting history stays unknown rather than bridging backwards',()=>{
 const cutoff=Date.parse(entry),now=Date.parse(read);
 for(const values of [[v(''),v('85','2026-11-08T00:00:00Z')],[v('bad')],[v('85','bad')],[v('85'),v('65')],[v('101')],[v('85','2027-01-01T00:00:00Z')]]) expect(valueBeforeLoss(values,cutoff,now).value).toBeNull();
 expect(valueBeforeLoss([v('0')],cutoff,now).value).toBe(0);
 expect(valueBeforeLoss([v('85'),v('85')],cutoff,now).value).toBe(85);
 expect(valueBeforeLoss([v('85')],cutoff,now,true).value).toBeNull();
});
test('noncommercial, reopened or won deals are not eligible even with historical loss',()=>{
 for(const p of [{...properties,pipeline:'other'},{...properties,dealstage:'open'},{...properties,dealstage:'won'}]) expect(lossPriorScore('1',p,histories,lost,'commercial',read).eligible).toBe(false);
});
test('buckets conserve exact distinct membership, 0 and 100, boundary values and unknowns separately for each metric',()=>{
 const values=[0,19.5,20,40,60,80,100,null];const rows:Record<string,LossPriorScore>={};
 const deals=values.map((value,i)=>{const id=String(i);rows[id]={id,eligible:true,stageId:stage,enteredAt:entry,adobo:{value,at:entry},probability:{value:100,at:entry}};return{id};});
 rows.excluded={...rows['0'],id:'excluded',eligible:false};
 const result=priorScoreBuckets([...deals,deals[0],{id:'excluded'}],rows,'adobo');
 expect(result.map(b=>b.deals.length)).toEqual([2,1,1,1,2,1]);expect(result.reduce((n,b)=>n+b.deals.length,0)).toBe(8);
 expect(priorScoreBuckets(deals,rows,'probability').map(b=>b.deals.length)).toEqual([0,0,0,0,8,0]);
});
