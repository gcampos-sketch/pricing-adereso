import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('function finishCustomVolume(');
const source=html.slice(start,html.indexOf("document.getElementById('volArea').addEventListener('focusout'",start));
function finish(value:string,previous={volMode:'tile',volCustom:0,vol:5000}){
 const state={...previous};
 const node=()=>({hidden:false,textContent:'',attributes:{} as Record<string,string>,classList:{toggle:(_k:string,_v:boolean)=>{},remove:(_k:string)=>{}},setAttribute(k:string,v:string){this.attributes[k]=v;}});
 const number=node(),label=node(),check=node(),hint=node();
 const button={...node(),querySelector:(s:string)=>s==='.conv'?number:s==='.lbl'?label:check};
 const box={...node(),querySelector:(s:string)=>s==='[data-vol-edit]'?button:hint};
 const input={value,hidden:false,closest:()=>box};
 const fixed={...node(),dataset:{vol:'5000'}};
 const updated:string[]=[];
 const ctx:any={state,document:{querySelectorAll:()=>[box,fixed]}};
 for(const name of ['updateSpot','updateConversationStatus','syncRoiVolume','renderRail','renderSummary'])ctx[name]=()=>updated.push(name);
 runInNewContext(source+';finishCustomVolume(input);',{...ctx,input});
 return {state,input,button,number,label,check,updated};
}
test('confirming a custom bag displays its formatted quantity and selected accessible state',()=>{
 const r=finish('32500');
 expect(r.state).toEqual({volMode:'custom',volCustom:32500,vol:5000});
 expect(r.number.textContent).toBe('32.500');expect(r.label.textContent).toBe('bolsa personalizada');
 expect(r.button.attributes['aria-pressed']).toBe('true');expect(r.button.attributes['aria-label']).toContain('32.500 conversaciones');
 expect(r.input.hidden).toBe(true);expect(r.button.hidden).toBe(false);expect(r.check.hidden).toBe(false);
 expect(r.updated).toEqual(['updateSpot','updateConversationStatus','syncRoiVolume','renderRail','renderSummary']);
});
test('clearing or cancelling preserves the previous confirmed bag',()=>{
 expect(finish('').state).toEqual({volMode:'tile',volCustom:0,vol:5000});
 const r=finish('',{volMode:'custom',volCustom:32500,vol:5000});
 expect(r.state.volCustom).toBe(32500);expect(r.number.textContent).toBe('32.500');
});
test('custom quantities are finite whole conversations with a 2000 minimum',()=>{
 expect(finish('1500').state.volCustom).toBe(2000);
 expect(finish('2500.8').state.volCustom).toBe(2501);
 for(const value of ['-20','NaN','Infinity'])expect(finish(value).state.volMode).toBe('tile');
});
