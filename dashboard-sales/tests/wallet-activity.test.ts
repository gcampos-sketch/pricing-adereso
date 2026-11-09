import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { walletEventInput } from '../src/lib/wallet-sharing';
const source=readFileSync(new URL('../../wallet-standalone.js',import.meta.url),'utf8');
function calculator(search:string,visible=true){
 const listeners:Record<string,(event?:unknown)=>void>={},tasks=new Map<number,()=>void>(),requests:unknown[]=[];let n=0;
 const document={visibilityState:visible?'visible':'hidden',getElementById:()=>({hidden:false}),addEventListener:(kind:string,fn:()=>void)=>{listeners[kind]=fn;}};
 const sandbox=createContext({URLSearchParams,location:{search},crypto,document,window:{matchMedia:()=>({matches:false}),addEventListener:(kind:string,fn:()=>void)=>{listeners[kind]=fn;}},sessionStorage:{getItem:()=>null,setItem(){}},walletAmount:()=>0,walletManual:()=>false,metaBase:()=>0,metaFee:()=>0,metaEst:()=>0,fetch:async(url:string,init:RequestInit)=>{expect(url).toBe('/api/wallet/events');expect(init.credentials).toBe('omit');requests.push(JSON.parse(String(init.body)));},setTimeout:(fn:()=>void)=>{tasks.set(++n,fn);return n;},clearTimeout:(id:number)=>tasks.delete(id)});
 runInContext(source+'\nstartWalletActivity();',sandbox);
 return {document,sandbox,requests,tick(){const callbacks=[...tasks.values()];tasks.clear();callbacks.forEach(fn=>fn());},input(trusted=true){listeners.input?.({isTrusted:trusted,target:{closest:()=>({})}});},show(){document.visibilityState='visible';listeners.visibilitychange?.();}};
}
const query='?w='+'a'.repeat(64);
test('previews and invalid tokens never record activity; hidden pages wait for visibility',()=>{
 for(const search of ['','?w=guess',query+'&preview=1']){const c=calculator(search);c.tick();c.input();c.tick();expect(c.requests).toHaveLength(0);}
 const c=calculator(query,false);c.tick();expect(c.requests).toHaveLength(0);c.show();c.show();expect(c.requests).toHaveLength(1);expect(c.requests[0]).toMatchObject({kind:'open',sequence:0,scenario:null});
});
test('trusted changes debounce, record a full wallet scenario and ignore identical/programmatic input',()=>{
 const c=calculator(query);runInContext('state.wa.marketing=100',c.sandbox);for(let i=0;i<10;i++)c.input();c.tick();expect(c.requests).toHaveLength(2);
 for(const event of c.requests)expect(walletEventInput.safeParse(event).success).toBe(true);
 expect(c.requests[1]).toMatchObject({kind:'scenario',sequence:1,scenario:{context:{quantities:{marketing:100}}}});
 c.input();c.tick();expect(c.requests).toHaveLength(2);runInContext('state.wa.utility=50',c.sandbox);c.input(false);c.tick();expect(c.requests).toHaveLength(2);c.input();c.tick();expect(c.requests).toHaveLength(3);expect(JSON.stringify(c.requests)).not.toContain('dealId');
});
