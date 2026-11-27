import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setup } from './pricing-crm-parity.test';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function events(start:string,end:string,state:any){
 const handlers:Record<string,Function[]>={},calls:string[]=[];
 const node={addEventListener:(event:string,fn:Function)=>(handlers[event]??=[]).push(fn)};
 const ctx:any={state,MODULES:['desk','studio','botOnly','improve','engage'].map(k=>({k})),SETUP:{inteligente:{}},document:{getElementById:()=>node,addEventListener:node.addEventListener},hasExistingDesk:()=>state.hasDeskContracted!==false,deskToast:()=>{},paintIcons:()=>{},prefersReduced:true};
 for(const name of ['renderMods','renderAll','refreshFlow','renderCust','renderSummary','renderRoi','renderRail','renderOpts'])ctx[name]=()=>calls.push(name);
 runInNewContext(html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start))),ctx);
 return {calls,fire:(dataset:Record<string,string>,selector:string,event='click')=>handlers[event]?.forEach(fn=>fn({target:{checked:false,closest:(s:string)=>s===selector?{dataset}:null,matches:(s:string)=>s===selector},stopPropagation(){},preventDefault(){}}))};
}
const initial=()=>({existing:true,desk:false,studio:false,scope:'bolsa',setup:'inteligente',chanNew:false,hasDeskContracted:true,out:{correo:true},roiCostTouched:false});
test('existing Studio does not silently add Desk; adding/removing development preserves selected bags',()=>{
 const state=initial(),ui=events('/* events */',"document.getElementById('optWa').addEventListener",state);
 ui.fire({mod:'studio'},'[data-mod]');expect(state.studio).toBe(true);expect(state.desk).toBe(false);
 ui.fire({mod:'botOnly'},'[data-mod]');expect(state.scope).toBe('ambas');expect(state.studio).toBe(true);
 Object.assign(state,{botOnly:true});ui.fire({mod:'botOnly'},'[data-mod]');expect(state.scope).toBe('bolsa');expect(state.studio).toBe(true);
 expect(ui.calls).toContain('refreshFlow');
});
test('changing channel mode refreshes wallet and navigation with the whole quote',()=>{
 const state=initial(),ui=events("document.getElementById('optWa').addEventListener", "document.getElementById('volArea').addEventListener",state);
 ui.fire({chanmode:'new'},'[data-chanmode]');expect(state.chanNew).toBe(true);expect(ui.calls).toEqual(['renderAll','refreshFlow']);
});
test('existing Desk status refreshes service prices, setup cards and all quote surfaces',()=>{
 const state={...initial(),engage:true,hasStudioContracted:true},ui=events("document.addEventListener('change',e=>{\n  const input=e.target;\n  let selector;", '/* Plazo de contrato:',state);
 ui.fire({},'[data-has-desk]','change');
 expect(state.hasDeskContracted).toBe(false);expect(state.engage).toBe(false);
 ui.fire({},'[data-has-studio]','change');
 expect(state.hasStudioContracted).toBe(false);
 expect(ui.calls).toEqual(['renderMods','renderAll','refreshFlow','renderMods','renderAll','refreshFlow']);
});
test('existing Desk integrations use the same setup, support and upsell basis as new customers',()=>{
 const run=setup({existing:true,studio:false,deskInteg:true,conversationPlans:{desk:{profile:'desk',pay:199}},vol:30000});
 expect(run('monthly()')).toBe(2119);expect(run('setupCost()')).toBe(990);
});
test('existing Studio types keep CRM tariffs and bot-only/improvement charges separate',()=>{
 const run=setup({existing:true,desk:true,studio:true,vol:3000,conversationPlans:{both:{profile:'both',pay:558}}});
 expect(run('monthly()')).toBeCloseTo(193.7);
 run.setState({studioType:'flow'});expect(run('monthly()')).toBeCloseTo(31.1);
 run.setState({desk:false,studio:false,scope:'bot',bots:2,hasDeskContracted:false});expect(run('monthly()')).toBe(432);expect(run('spotUnit()')).toBeNull();
 run.setState({scope:'bolsa',improve:true});expect(run('monthly()')).toBe(0);expect(run('setupCost()')).toBe(990);
});

test('reload starts a fresh quote even when a previous browser quote exists',()=>{
 const source=html.slice(html.indexOf('const state={'),html.indexOf('/* Hub navigation persistence:'));
 const saved={studioType:'flow',deskInteg:true,epA:[2,1],existing:true,vol:30000,currentPay:2500,extraAgents:3,wa:{amount:900}};
 const stored=new Map([['adereso_pricing_v1',JSON.stringify({state:saved})],['unrelated-preference','keep']]);
 const ctx:any={localStorage:{getItem:(key:string)=>stored.get(key),removeItem:(key:string)=>stored.delete(key)}};
 runInNewContext(source+';this.restored=state;this.initial=INITIAL_STATE;',ctx);
 expect(ctx.restored).toEqual(ctx.initial);
 expect(ctx.restored.studioType).toBe('agent');expect(ctx.restored.existing).toBe(false);
 expect(ctx.restored.vol).toBe(2000);expect(ctx.restored.conversationPlans).toEqual({});
 expect(ctx.restored.deskInteg).toBe(false);expect(Array.from(ctx.restored.epA)).toEqual([]);
 expect(stored.has('adereso_pricing_v1')).toBe(false);expect(stored.get('unrelated-preference')).toBe('keep');
});

test('session saving preserves navigation without persisting quote inputs',()=>{
 const start=html.indexOf('function saveSession(){');
 const source=html.slice(start,html.indexOf('window.addEventListener',start));
 let saves=0;
 const ctx={saveHubNavigation:()=>saves++,localStorage:{setItem:()=>{throw new Error('Quote must not persist');}}};
 runInNewContext(source+';saveSession();',ctx);
 expect(saves).toBe(1);
});

test('a new Desk and Studio bag uses the full tier without credit',()=>{
 const run=setup({existing:true,vol:5000});
 expect(run('conversationQuote().pending')).toBeTruthy();
 run.setState({conversationPlans:{both:{profile:'new'}}});
 expect(run('monthly()')).toBe(1058);
});

test('adding the other product at the existing quota bills only the new product',()=>{
 const run=setup({existing:true,vol:30000,conversationPlans:{both:{profile:'desk',change:'keep',volume:5000}}});
 expect(run('effectiveConversationVolume()')).toBe(5000);
 expect(run('monthly()')).toBe(659);
 run.setState({conversationPlans:{both:{profile:'studio',change:'keep',volume:5000}}});
 expect(run('monthly()')).toBe(399);
});

test('raising the quota credits only the replaced product while billing the new one at its full tier',()=>{
 const run=setup({existing:true,vol:10000,conversationPlans:{both:{profile:'desk',change:'increase',volume:5000,pay:399}}});
 expect(run('conversationQuote()')).toMatchObject({replacement:785.5,credit:399,addition:1129,delta:1515.5});
 run.setState({conversationPlans:{both:{profile:'studio',change:'increase',volume:5000,pay:1500}}});
 expect(run('conversationQuote().delta')).toBe(785.5);
 run.setState({vol:5000});
 expect(run('conversationQuote().pending')).toBe('El nuevo volumen debe superar al actual.');
});

test('SSPP expansion supports estimating the current bag and quoting distinct product volumes',()=>{
 const run=setup({existing:true,upsell:{splitVolumes:true,deskVolume:5000,studioVolume:10000},
  conversationPlans:{both:{profile:'desk',change:'increase',volume:2000,basis:'volume'}}});
 expect(run('conversationQuote()')).toMatchObject({replacement:399,credit:199,addition:1129,delta:1329});
 run.setState({upsell:{splitVolumes:true,deskVolume:15000,studioVolume:1000}});
 expect(run('conversationQuote().pending')).toContain('2.000');
 run.setState({conversationPlans:{both:{profile:'desk',change:'keep',volume:5000}}});
 expect(run('conversationQuote()')).toMatchObject({addition:659,delta:659});
});

test('SSPP pack references reject non-increasing upgrades and cap the product credit',()=>{
 const start=html.indexOf('const positiveInteger=');
 const end=html.indexOf('function upsellEmail(',start);
 const ctx={state:{upsell:{plans:{email:{increase:true,basis:'volume',quantity:10000},gpt:{increase:true,pay:120}}}}};
 const run=(expr:string)=>runInNewContext(html.slice(start,end)+';'+expr,ctx);
 expect(run("upsellPack('email',29,10000,()=>29,1000).pending")).toContain('superar');
 expect(run("upsellPack('email',49,20000,()=>29,1000)")).toEqual({monthly:20,credit:29});
 expect(run("upsellPack('gpt',100,2000,()=>0)")).toEqual({monthly:0,credit:100});
});
