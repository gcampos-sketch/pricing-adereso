import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const take=(a:string,b:string)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function fn(name:string){const a=html.indexOf('function '+name+'(');let at=html.indexOf('{',a),depth=1;while(depth){at++;if(html[at]==='{')depth++;if(html[at]==='}')depth--;}return html.slice(a,at+1);}
function setup(overrides={}){
 const state={desk:true,studio:true,studioType:'agent',existing:false,scope:'bolsa',vol:30000,volMode:'tile',extraAgents:0,bots:1,currentPay:0,spotDesk:true,spotStudio:true,...overrides};
 const ctx=createContext({state,STUDIO_NO_DESK_SURCHARGE:35,BOT_MANT:160,hasService:()=>state.desk||state.studio,termAdj:()=>0});
 runInContext(take('/* CRM ae_rules_v1:','const SETUP=')+['monthly','monthlyBase','bagPrice','mantDiscount','extraAgentsN','extraAgentsMant','bagDelta','upsellMonthly','newBotsMant','botsN','scopeBag','improveOnly'].map(fn).join('\n')+take('const EXTRA_MARKUP=','const usd3=')+fn('simExtraRate')+fn('simBagPrice'),ctx);
 return (s:string)=>runInContext(s,ctx);
}
test('CRM 30000 reconciles Desk 2158 + Agents 2586 + support 160',()=>{
 const run=setup();expect(run('priceForVolume(30000,DESK_BAG)')).toBe(2158);expect(run('priceForVolume(30000,AGENT_BAG)')).toBe(2586);expect(run('monthly()')).toBe(4904);expect(run('simBagPrice(30000)')).toBe(4904);expect(run('extraTicket().total')).toBeCloseTo(.17986,8);
});
test('official tiers and boundaries use active pack rates',()=>{
 const caps=[2000,5000,15000,45000,135000,405000,1215000,3645000];
 const products=[['DESK_BAG',[199,399,1099,2999,8299,23699,66999,193499],[.0874,.0773,.0706,.0662,.0612,.0585,.0551,.0531]],['AGENT_BAG',[199,499,1299,3599,9999,28799,81499,235399],[.1063,.094,.0858,.0805,.0744,.0711,.067,.0646]],['STUDIO_FLOW_BAG',[99,199,499,1499,4099,11799,33499,96799],[.0437,.0386,.0353,.0331,.0306,.0292,.0276,.0265]]] as const;
 const run=setup();for(const [name,prices,rates] of products)for(let i=0;i<caps.length;i++)for(const qty of [caps[i],caps[i]+1,...(i<7?[caps[i+1]-1]:[4000000])])expect(run(`priceForVolume(${qty},${name})`)).toBe(Math.round((prices[i]+(qty-caps[i])*rates[i])*1000)/1000);
 for(const [qty,want] of [[3000,751.7],[4000,945.4],[10000,1914.5],[20000,3340]])expect(run(`priceForVolume(${qty})`)).toBeCloseTo(want);
});
test('Desk, Flow, standalone Studio, added agents and upsells reconcile',()=>{
 expect(setup({studio:false})('monthly()')).toBe(2158);
 const flow=setup({studioType:'flow'});expect(flow('monthly()')).toBe(3346.5);expect(flow('extraTicket().total')).toBeCloseTo(.121785);expect(flow('spotUnit().total')).toBeCloseTo(.1059);
 expect(setup({desk:false})('monthly()')).toBeCloseTo(3707.1);expect(setup({desk:false})('extraTicket().total')).toBeCloseTo(.09867);
 expect(setup({vol:2000})('monthly()')).toBe(558);expect(setup({vol:2000,studioType:'flow'})('monthly()')).toBe(458);
 expect(setup({extraAgents:2})('monthly()')).toBe(5224);expect(setup({existing:true,currentPay:2000})('monthly()')).toBe(2744);expect(setup({existing:true,scope:'bot',bots:2})('monthly()')).toBe(320);
});
