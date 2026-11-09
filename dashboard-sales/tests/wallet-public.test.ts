import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Script, runInNewContext } from 'node:vm';
import { walletDocument, walletSources, createWalletPublicGateway } from '../src/lib/wallet-public';
const root=resolve(import.meta.dir,'../..'),origin='https://hub.example.test';
const read=(path:string)=>readFile(resolve(root,path));
const hub=await readFile(resolve(root,'index.html'),'utf8'),standalone=await readFile(resolve(root,'wallet-standalone.js'),'utf8');
test('wallet export publishes only the wallet with its exact shared source formulas',()=>{
 const page=walletDocument(hub,standalone);expect(page).toContain('id="waArea"');expect(page).toContain('Estima tu billetera Meta');
 for(const marker of ['id="homeGrid"','id="s1"','id="roiArea"','id="s5"','id="s7"','id="ppTpl"','const BAG=','const SETUP=','DASHBOARD_SALES_URL','/hub-content/wallet-share.js','/api/hub/wallet/'])expect(page).not.toContain(marker);
 expect(()=>new Script(page.match(/<script>([\s\S]*?)<\/script>/)![1]!)).not.toThrow();
 const s=walletSources(hub),functions=s.rates+s.formulas+s.calculator;
 const calc=(existing:boolean,service:number)=>runInNewContext(functions+'\nJSON.stringify({base:metaBase(),total:metaEst(),range:svRange()})',{state:{existing,whatsapp:true,engage:true,out:{whatsapp:true,wacall:true},wa:{country:'CL',wallet:'recurrente',fee:null,service,marketing:100,utility:0,authentication:0,minutes:0,svPer:4,svConvs:2000}},roiVolume:()=>2000});
 for(const existing of [false,true]){const result=JSON.parse(calc(existing,10000));expect(result.base).toBeCloseTo(188.89);expect(result.total).toBeCloseTo(207.779);expect(result.range.mid).toBe(8000);}
});
test('missing or duplicate markers fail closed; query strings cannot expose other Hub files',async()=>{
 expect(()=>walletDocument(hub.replace('function walletManual()','function other()'),standalone)).toThrow();
 expect(()=>walletDocument(hub+'function waService()',standalone)).toThrow();
 const gateway=createWalletPublicGateway(read);
 for(const path of ['', 'brand-system.css','logoadereso.webp'])expect((await gateway(new Request(origin+'/billetera-meta/'+path)))?.status).toBe(200);
 const result=await gateway(new Request(origin+'/billetera-meta/?vista=pricing&template=index.html'));
 expect(await result?.text()).toBe(walletDocument(hub,standalone));expect(result?.headers.get('set-cookie')).toBeNull();
 for(const path of ['index.html','wallet-share.js','wallet-standalone.js','.env','academy/index.html','%2e%2e%2findex.html'])expect((await gateway(new Request(origin+'/billetera-meta/'+path)))?.status).toBe(404);
 expect((await gateway(new Request(origin+'/billetera-meta/',{method:'POST'})))?.status).toBe(405);
 expect(await gateway(new Request(origin+'/hub-content/index.html'))).toBeNull();
 expect((await gateway(new Request(origin+'/billetera-meta?w=test')))?.headers.get('location')).toBe('/billetera-meta/?w=test');
});
test('query input is numeric/enum allowlisted and cannot become private state or markup',()=>{
 const state=JSON.parse(runInNewContext(standalone+'\nJSON.stringify(state)',{URLSearchParams,location:{search:'?c='+encodeURIComponent(JSON.stringify({country:'<script>',existing:true,conversations:-1,fee:200,amount:Infinity,quantities:{service:1000,email:'private'},email:'private',access_token:'forged'}))},window:{matchMedia:()=>({matches:false})}}));
 expect(state.wa.country).toBe('CL');expect(state.wa.fee).toBe(20);expect(state.wa.service).toBe(1000);expect(state.wa.email).toBeUndefined();expect(state.email).toBeUndefined();expect(state.access_token).toBeUndefined();
});
test('the sharing controller is private and appears once in the Hub head',()=>{
 const script='<script src="/hub-content/wallet-share.js" defer></script>';
 expect(hub.slice(0,hub.indexOf('</head>'))).toContain(script);expect(hub.split(script)).toHaveLength(2);expect(hub).toContain('data-wallet-share');
});
