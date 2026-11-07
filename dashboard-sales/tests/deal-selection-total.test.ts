import {expect,test} from 'bun:test';
import {dealSelectionTotal,type SelectionQuota} from '../src/lib/deal-selection-total';
import type {DealDTO} from '../src/lib/pulse-types';
const context:SelectionQuota={quota:1000,won:200,label:'Holly · Q4-26',periods:['2026-Q4'],wonIds:['won'],openIds:['a','b','wallet','outside','undated','won']};
const row=(id:string,amount=100,extra:Partial<DealDTO>={}):DealDTO=>({id,amountValue:amount,otfValue:0,segment:'Inbound',dealType:'newbusiness',productToHire:'Bot',closeDateValue:'2026-11-15',...extra} as DealDTO);
test('checkbox selection adds to the existing period baseline and uses eligible OTF/12',()=>{
 const result=dealSelectionTotal([row('a'),row('b',300,{otfValue:120})],['a','b'],context);
 expect(result).toMatchObject({count:2,amount:400,contribution:410,total:610,attainment:61,otfBonus:10,excluded:0});
});
test('already won, excluded and outside-period deals never inflate the period total',()=>{
 const rows=[row('won'),row('wallet',100,{productToHire:'Billetera Engage'}),row('outside',100,{closeDateValue:'2027-01-01'}),row('undated',100,{closeDateValue:''})];
 expect(dealSelectionTotal(rows,rows.map(d=>d.id),context)).toMatchObject({contribution:0,total:200,excluded:4});
});
test('filters, deselection and duplicate rows reconcile the selected sum',()=>{
 const rows=[row('a'),row('a'),row('b',300)];
 expect(dealSelectionTotal(rows,['a'],context).total).toBe(300);
 expect(dealSelectionTotal([row('b',300)],['a','b'],context)).toMatchObject({count:1,amount:300,total:500});
 expect(dealSelectionTotal(rows,[],context)).toMatchObject({count:0,contribution:0,total:200});
});
test('missing quota is unknown; a list without a period context only totals its selection',()=>{
 expect(dealSelectionTotal([row('a')],['a'],{...context,quota:0}).attainment).toBeNull();
 expect(dealSelectionTotal([row('a')],['a'])).toMatchObject({count:1,amount:100,contribution:null,total:null,attainment:null});
});
test('calendar quarter boundaries and locally edited close dates control contribution',()=>{
 expect(dealSelectionTotal([row('a',100,{closeDateValue:'2026-10-01'})],['a'],context).total).toBe(300);
 expect(dealSelectionTotal([row('a',100,{closeDateValue:'2026-09-30'})],['a'],context).total).toBe(200);
});
