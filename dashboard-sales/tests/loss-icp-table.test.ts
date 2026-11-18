import { expect,test } from 'bun:test';
import { lossPriorScore,lossIcpBuckets,icpScoreValue,icpFitBeforeLoss,type LossPriorScore } from '../src/lib/loss-prior-score';
const at='2026-11-10T10:00:00.000Z',read='2026-11-18T10:00:00.000Z';
const v=(value:string,timestamp='2026-11-09T10:00:00.000Z')=>({value,timestamp});
const props={pipeline:'commercial',dealstage:'lost',hs_v2_date_entered_lost:at,adobo_icp_score:'95',adobo_icp_fit:'alto'};
const history={dealstage:[v('lost',at),v('open')],adobo_icp_score:[v('95','2026-11-11T00:00:00Z'),v('42')],adobo_icp_fit:[v('alto',at),v('bajo')]};
test('ICP score and fit remain distinct native properties and strictly pre-loss values',()=>{
 const row=lossPriorScore('1',props,history,new Set(['lost']),'commercial',read);
 expect(row.icpVersion).toBe('native-icp/v1');expect(row.icpScore?.value).toBe(42);expect(row.icpFit?.value).toBe('bajo');
 expect(row.currentIcp).toEqual({score:95,fit:'alto'});
 expect(row.adobo.value).toBeNull();expect(row.probability.value).toBeNull();
});
test('never fills missing pre-loss ICP with current recorded values',()=>{
 const row=lossPriorScore('1',props,{dealstage:history.dealstage},new Set(['lost']),'commercial',read);
 expect(row.icpScore?.value).toBeNull();expect(row.icpFit?.value).toBeNull();expect(row.currentIcp?.score).toBe(95);
 const excluded=lossPriorScore('2',{...props,pipeline:'other'},history,new Set(['lost']),'commercial',read);
 expect(excluded.currentIcp).toEqual({score:null,fit:null});
});
test('fit preserves No validado separately from missing; latest blank/conflict/malformed date stays unknown',()=>{
 expect(icpFitBeforeLoss([v('no_validado')],Date.parse(at),Date.parse(read)).value).toBe('no_validado');
 for(const values of [[v(''),v('alto','2026-11-08T00:00:00Z')],[v('alto'),v('bajo')],[v('alto','bad')],[v('otro')],[v('alto','2027-01-01T00:00:00Z')]])expect(icpFitBeforeLoss(values,Date.parse(at),Date.parse(read)).value).toBeNull();
});
test('ICP numeric blanks, out-of-range and nonnumeric values never become zero',()=>{
 for(const value of ['',null,undefined,'bad','-1','101'])expect(icpScoreValue(value)).toBeNull();
 expect(icpScoreValue('0')).toBe(0);expect(icpScoreValue('100')).toBe(100);
});
test('table groups conserve exact memberships and MRR including zero, No validado and unknown',()=>{
 const values=[0,20,40,60,80,100,null];const fits=['alto','medio','bajo','no_validado',null,'alto','medio'];
 const evidence:Record<string,LossPriorScore>={};const deals=values.map((value,i)=>{
  const id=String(i);evidence[id]={id,eligible:true,stageId:'lost',enteredAt:at,adobo:{value:99,at},probability:{value:50,at},icpScore:{value,at},icpFit:{value:fits[i]!,at},currentIcp:{score:100,fit:'alto'}};return{id,amount:i*10};
 });
 const numeric=lossIcpBuckets([...deals,deals[0]!],evidence,'score','prior');expect(numeric.map(g=>g.deals.length)).toEqual([1,1,1,1,2,1]);
 expect(numeric.flatMap(g=>g.deals).reduce((n,d)=>n+d.amount,0)).toBe(210);
 const fit=lossIcpBuckets(deals,evidence,'fit','prior');expect(fit.map(g=>[g.key,g.deals.length])).toEqual([['alto',2],['medio',2],['bajo',1],['no_validado',1],['unknown',1]]);
 expect(lossIcpBuckets(deals,evidence,'score','current').map(g=>g.deals.length)).toEqual([0,0,0,0,7,0]);
 expect(lossIcpBuckets([],{},'fit','prior').every(g=>g.deals.length===0)).toBe(true);
});
