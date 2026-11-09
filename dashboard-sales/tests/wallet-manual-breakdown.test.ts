import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { walletSources } from '../src/lib/wallet-public';
const hub=readFileSync(new URL('../../index.html',import.meta.url),'utf8'),source=walletSources(hub);
function calculator(existing:boolean,fee:number|null=10,wallet='recurrente'){
 const amount={value:'500'},detail={innerHTML:''};
 const state={existing,whatsapp:true,engage:true,out:{whatsapp:true,wacall:true},roiCostTouched:true,wa:{country:'CL',wallet,fee,amount:500,amountSource:'manual',service:0,marketing:0,utility:0,authentication:0,minutes:0}};
 const sandbox=createContext({state,usd2:(n:number)=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),document:{querySelector:()=>null,getElementById:(id:string)=>id==='waMix'?detail:id==='waAmt'?amount:null},renderRail(){},renderSummary(){}});
 runInContext(source.rates+source.formulas+source.calculator,sandbox);
 return {state,amount,detail,render:()=>runInContext('renderWaLive()',sandbox),useEstimate:()=>runInContext('waLoad(true)',sandbox)};
}
for(const existing of [false,true]){
 test(`${existing?'existing':'new'} client: manual recharge fills its own Meta/fee/total breakdown without inventing quantities`,()=>{
  const c=calculator(existing);c.render();
  expect(c.detail.innerHTML).toContain('Detalle de tu recarga');expect(c.detail.innerHTML).toContain('Saldo para Meta');expect(c.detail.innerHTML).toContain('$454.55');expect(c.detail.innerHTML).toContain('$45.45');expect(c.detail.innerHTML).toContain('$500.00');
  expect(c.detail.innerHTML).not.toContain('data-wa-estimate-detail');expect(c.detail.innerHTML).not.toContain('data-wa-use');
  expect(c.state.wa.service+c.state.wa.marketing+c.state.wa.utility+c.state.wa.authentication+c.state.wa.minutes).toBe(0);
 });
 test(`${existing?'existing':'new'} client: quantity estimate stays separate and explicit application replaces the manual amount`,()=>{
  const c=calculator(existing);c.state.wa.service=10000;c.render();
  expect(c.detail.innerHTML).toContain('data-wa-recharge-detail');expect(c.detail.innerHTML).toContain('data-wa-estimate-detail');expect(c.detail.innerHTML).toContain('Estimado por mensajes y minutos');expect(c.detail.innerHTML).toContain('$500.00');expect(c.detail.innerHTML).toContain('$198.00');expect(c.amount.value).toBe('500');
  c.useEstimate();expect(Number(c.amount.value)).toBe(198);expect(c.detail.innerHTML).not.toContain('data-wa-recharge-detail');expect(c.detail.innerHTML).toContain('Detalle del estimado');
 });
}
test('manual detail follows the effective standard or custom fee and preserves an explicit zero',()=>{
 const c=calculator(false,null,'no_recurrente');c.render();expect(c.detail.innerHTML).toContain('$446.43');expect(c.detail.innerHTML).toContain('$53.57');
 c.state.existing=true;c.state.wa.fee=0;c.render();expect(c.detail.innerHTML).toContain('$500.00');expect(c.detail.innerHTML).toContain('$0.00');
 c.state.wa.fee=20;c.render();expect(c.detail.innerHTML).toContain('$416.67');expect(c.detail.innerHTML).toContain('$83.33');
 c.state.wa.amount=0;c.render();expect(c.detail.innerHTML).toContain('data-wa-recharge-detail');expect(c.detail.innerHTML.match(/\$0\.00/g)).toHaveLength(3);
});
