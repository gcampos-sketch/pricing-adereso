import type {DealDTO} from './pulse-types';
import {quotaStats,periodOfDate} from './quota-eligibility';

export type SelectionQuota = {quota:number;won:number;label:string;periods:string[];wonIds:string[];openIds:string[]};

/** Final filtered rows only; existing wins and ineligible/out-of-period rows never inflate attainment. */
export function dealSelectionTotal(rows:DealDTO[],selectedIds:string[],context?:SelectionQuota|null) {
  const ids=new Set(selectedIds);
  const selected=[...new Map(rows.filter(d=>ids.has(d.id)).map(d=>[d.id,d])).values()];
  const amount=selected.reduce((sum,d)=>sum+(Number.isFinite(d.amountValue)?d.amountValue:0),0);
  if(!context) return {count:selected.length,amount,contribution:null,total:null,attainment:null,excluded:0,otfBonus:0};
  const won=new Set(context.wonIds),open=new Set(context.openIds),periods=new Set(context.periods);
  const candidates=selected.filter(d=>!won.has(d.id)&&open.has(d.id)&&periods.has(periodOfDate(d.closeDateValue)));
  const stats=quotaStats(candidates);
  const otfBonus=stats.wonOtf/12,contribution=stats.wonAmount+otfBonus,total=context.won+contribution;
  return {count:selected.length,amount,contribution,total,attainment:context.quota>0?total/context.quota*100:null,excluded:selected.length-stats.eligible.length,otfBonus};
}
