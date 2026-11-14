import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const defaults=html.slice(html.indexOf('const state={'),html.indexOf('/* recuerda la cotización'));
const reset=html.slice(html.indexOf('function resetAll(){'),html.indexOf("document.getElementById('resetBtn').addEventListener"));
for(const existing of [false,true])test(`reset clears the quote and preserves ${existing?'existing':'new'} customer mode`,()=>{
 const active:string[]=[],ctx:any={};
 for(const name of ['renderMods','renderAll','refreshFlow','renderPortal','paintIcons','glideTo'])ctx[name]=()=>{};
 ctx.setActive=(id:string)=>active.push(id);
 runInNewContext(defaults+reset+`;Object.assign(state,{existing:${existing},currentPay:1234,studioType:'flow',deskInteg:true,extraAgents:3,epA:[2,1],spotQty:5000});state.wa.amount=900;resetAll();this.result=state;`,ctx);
 expect(ctx.result.existing).toBe(existing);expect(ctx.result.currentPay).toBe(0);expect(ctx.result.desk).toBe(!existing);expect(ctx.result.studio).toBe(!existing);expect(ctx.result.studioType).toBe('agent');expect(ctx.result.deskInteg).toBe(false);expect(ctx.result.wa.amount).toBe(0);expect(ctx.result.epA.length).toBe(0);expect(ctx.result.extraAgents).toBe(0);expect(ctx.result.spotQty).toBe(0);expect(active).toEqual([existing?'s0':'s1']);
});
