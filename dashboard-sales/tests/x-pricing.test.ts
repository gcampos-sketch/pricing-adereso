import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const formula=html.slice(html.indexOf('const X_PRICE='),html.indexOf('/* Agentes a implementar:'));
function quote(volume:unknown,overrides={}){
 return JSON.parse(runInNewContext(formula+'JSON.stringify({volume:xVolume(),added:xBagAdded(),addedCost:xBagAddedCost(),monthly:xCost(),extra:X_EXTRA})',{state:{xVolume:volume,chan:{x:true},existing:false,...overrides},hasService:()=>true}));
}
test('X separates base, contracted expansion and out-of-bag rates',()=>{
 for(const [volume,monthly,addedCost] of [[7000,600,0],[8000,685,85],[10000,855,255],[15000,1280,680],[7001,600.09,0.09]])expect(quote(volume)).toEqual({volume,added:volume-7000,addedCost,monthly,extra:0.0977});
});
test('invalid saved volume normalizes; unselected and existing channels are not charged',()=>{
 for(const value of [undefined,null,0,-50,6999,Infinity,'bad'])expect(quote(value).monthly).toBe(600);
 expect(quote(10000,{chan:{x:false}}).monthly).toBe(0);
 expect(quote(10000,{existing:true,chanNew:false}).monthly).toBe(0);
 expect(quote(10000,{existing:true,chanNew:true}).monthly).toBe(855);
});
test('X card displays its expansion breakdown, extra rate and separate volume editor',()=>{
 const card=html.slice(html.indexOf("  let xCard='';"),html.indexOf('  /* --- BOLSA SPOT'));
 const text=runInNewContext(formula+card+'xCard',{state:{xVolume:10000,chan:{x:true}},hasService:()=>true,rdet:(_d:string,_r:string,_w:unknown,mini:string)=>mini});
 for(const expected of ['855','7.000','3.000 × USD 0.085','255','10.000','USD 0.0977','data-ed="xVol"'])expect(text).toContain(expected);
});
test('all inline Hub scripts compile',()=>{
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  if(/src=|application\//.test(m[1]))continue;
  expect(()=>new Script(m[2])).not.toThrow();
 }
});
