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
 const state=initial(),ui=events("document.addEventListener('change',e=>{if(!e.target.matches('[data-has-desk]'))", '/* Plazo de contrato:',state);
 ui.fire({},'[data-has-desk]','change');expect(state.hasDeskContracted).toBe(false);expect(ui.calls).toEqual(['renderMods','renderAll','refreshFlow']);
});
test('existing Desk integrations use the same setup, support and upsell basis as new customers',()=>{
 const run=setup({existing:true,studio:false,deskInteg:true,currentPay:199,vol:30000});
 expect(run('monthly()')).toBe(2119);expect(run('setupCost()')).toBe(990);
});
test('existing Studio types keep CRM tariffs and bot-only/improvement charges separate',()=>{
 const run=setup({existing:true,desk:true,studio:true,vol:3000,currentPay:558});
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
 expect(ctx.restored.vol).toBe(2000);expect(ctx.restored.currentPay).toBe(0);
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
