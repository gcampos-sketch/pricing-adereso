import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { setup } from './pricing-crm-parity.test';
// Checked against live CRM Mantenedor → Packs on 2026-11-13; product-specific tables, not inactive combo tables.
const caps=[2000,5000,15000,45000,135000,405000,1215000,3645000];
const deskPrices=[199,399,1099,2999,8299,23699,66999,193499],deskRates=[.0874,.0773,.0706,.0662,.0612,.0585,.0551,.0531];
const agentPrices=[199,499,1299,3599,9999,28799,81499,235399],agentRates=[.1063,.094,.0858,.0805,.0744,.0711,.067,.0646];
const flowPrices=[99,199,499,1499,4099,11799,33499,96799],flowRates=[.0437,.0386,.0353,.0331,.0306,.0292,.0276,.0265];
const quantities=[...new Set([1,1999,3000,4000,10000,20000,30000,100000,500000,4000000,...caps.flatMap(n=>[n-1,n,n+1])])].sort((a,b)=>a-b);
const combos=[{name:'Desk',desk:true,studio:false,type:'agent'}, {name:'Desk + Agent',desk:true,studio:true,type:'agent'}, {name:'Desk + Flow',desk:true,studio:true,type:'flow'}, {name:'Agent sin Desk',desk:false,studio:true,type:'agent'}, {name:'Flow sin Desk',desk:false,studio:true,type:'flow'}];
const rows:any[]=[];
function pack(q:number,prices:number[],rates:number[]){q=Math.max(2000,q);let i=0;while(i+1<caps.length&&caps[i+1]<=q)i++;return {price:Math.round((prices[i]+(q-caps[i])*rates[i])*1000)/1000,rate:rates[i]};}
for(const combo of combos)test('matrix · '+combo.name,()=>{
 const run=setup();
 for(const q of quantities)for(const existing of [false,true])for(const contractedDesk of [false,true])for(const moreBots of [0,1,3]){
  const d=pack(q,deskPrices,deskRates),s=pack(q,combo.type==='flow'?flowPrices:agentPrices,combo.type==='flow'?flowRates:agentRates);
  const multiplier=!combo.desk&&!(existing&&contractedDesk)?1.35:1;
  const list=(combo.desk?d.price:0)+(combo.studio?(s.price+160)*multiplier:0);
  const current=existing?list*.6:0;
  const scopes=existing&&combo.studio?['bolsa','ambas','bot']:['bolsa'];
  for(const scope of scopes){
   const state={desk:combo.desk,studio:combo.studio,studioType:combo.type,existing,hasDeskContracted:contractedDesk,volMode:'custom',volCustom:q,scope,currentPay:current,extraAgents:moreBots,bots:Math.max(1,moreBots)};
   run.setState(state);
   const expected=existing?(scope==='bot'?0:Math.max(0,list-current))+(scope!=='bolsa'?Math.max(1,moreBots)*160*multiplier:0):list+(combo.studio?moreBots*160*multiplier:0);
   expect(run('monthly()')).toBeCloseTo(expected,7);
   const rate=(combo.desk?d.rate:0)+(combo.studio?s.rate:0);
   expect(run('extraTicket().total')).toBeCloseTo(rate*1.15,10);
   if(existing&&scope==='bot')expect(run('spotUnit()')).toBeNull();else expect(run('spotUnit().total')).toBeCloseTo(rate,10);
   if(!existing)expect(run(`simBagPrice(${Math.max(2000,q)})`)).toBeCloseTo(expected,7);
   rows.push({combination:combo.name,volume:q,existing,hasDeskContracted:contractedDesk,moreBots,scope,currentPay:current,expected,actual:run('monthly()')});
  }
 }
},30000);
test('Desk integration support, full-current-payment delta and improvement-only scope',()=>{
 expect(setup({studio:false,deskInteg:true,vol:30000})('monthly()')).toBe(2318);
 expect(setup({existing:true,currentPay:558,vol:2000})('monthly()')).toBe(0);
 expect(setup({existing:true,currentPay:558,vol:3000})('monthly()')).toBeCloseTo(193.7);
 expect(setup({existing:true,desk:false,studio:false,scope:'bot',bots:2,hasDeskContracted:false})('monthly()')).toBe(432);
 expect(setup({existing:true,desk:false,studio:false,scope:'bolsa',improve:true})('monthly()')).toBe(0);
});
test('audit artifact records the coverage and all numerical comparisons',()=>{
 expect(rows.length).toBeGreaterThan(3000);
 if(process.env.PRICING_AUDIT_REPORT)writeFileSync(process.env.PRICING_AUDIT_REPORT,JSON.stringify({source:'Live CRM pack tables checked 2026-11-13',tiers:caps,quantities,caseCount:rows.length,rows},null,2));
});

test('setup plans remain one-time charges and displayed currency retains cents',()=>{
 for(const studioType of ['agent','flow'])for(const [plan,price] of [['esencial',558],['inteligente',990],['avanzado',1600],['enterprise',2700]] as const){
  const run=setup({studioType,setup:plan});expect(run('setupCost()')).toBe(price);expect(run('monthly()')).toBe(studioType==='agent'?4904:3346.5);
 }
 expect(setup({setupMode:'paquetizado'})('setupCost()')).toBe(0);
 expect(setup({setupMode:'paquetizado'})('monthly()')).toBe(4904);
 expect(setup({studio:false,deskInteg:true})('setupCost()')).toBe(990);
 expect(setup({studio:false,vol:30000})('selVol()')).toBe('30.000 conv');
 expect(setup()('usd(3346.5)')).toBe('$3,346.5');
 expect(setup()('usd(751.7)')).toBe('$751.7');
});
