import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Script, runInNewContext } from 'node:vm';
import { roiDocument, roiSources, createRoiPublicGateway } from '../src/lib/roi-public';
const root=resolve(import.meta.dir,'../..');
const read=(path:string)=>readFile(resolve(root,path));
const hub=await readFile(resolve(root,'index.html'),'utf8');
const context=await readFile(resolve(root,'roi-standalone.js'),'utf8');
const origin='https://hub.example.test';
test('ROI export contains the calculator, not hidden Pricing sections or the Hub',()=>{
 const page=roiDocument(hub,context);expect(page).toContain('id="roiArea"');expect(page).toContain('Inversión mensual Adereso (USD)');
 for(const privateMarker of ['id="homeGrid"','id="s1"','id="s5"','id="s7"','id="ppTpl"','const BAG=','const SETUP=','DASHBOARD_SALES_URL','data-next="s7"'])expect(page).not.toContain(privateMarker);
 const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];expect(script).toBeDefined();expect(()=>new Script(script!)).not.toThrow();
});
test('deal sharing loads in the main Hub document rather than an embedded tool template',()=>{
 const script='<script src="/hub-content/roi-share.js" defer></script>';
 expect(hub.slice(0,hub.indexOf('</head>'))).toContain(script);
 expect(hub.split(script)).toHaveLength(2);
 expect(roiDocument(hub,context)).not.toContain('/hub-content/roi-share.js');
});
test('missing or ambiguous ROI source markers fail closed instead of publishing the Hub',()=>{
 expect(()=>roiDocument(hub.replace('<section class="lvl" id="s6"','<section id="other"'),context)).toThrow();
 expect(()=>roiDocument(hub+'/* ===== ROI · caso de negocio',context)).toThrow();
});
test('standalone ROI reuses the exact source formulas for revenue and variable cost',()=>{
 const source=roiSources(hub).calculator;
 const sandbox={state:{out:{whatsapp:true},roiActive:{},roiVals:{}},document:{getElementById:()=>({addEventListener(){}}),addEventListener(){}},waP:()=>({marketing:0.1}),metaFeeRate:()=>0};
 const result=runInNewContext(source+'\nJSON.stringify({gain:ROI_CASES.carrito.gain({carritos:1000,recup:10,ticket:50}),cost:ROI_CASES.carrito.cost({carritos:1000}),lostFee:ROI_CASES.cassper.cost({perdidas:1000,recup:10,ticket:50})})',sandbox);
 expect(JSON.parse(result)).toEqual({gain:5000,cost:100,lostFee:250});
 expect(source).toContain("const ROI_URL='https://adereso-partners.onrender.com/roi/'");
});
test('external numeric parameters are bounded and cannot inject markup or private state',()=>{
 const state=JSON.parse(runInNewContext(context+'\nJSON.stringify(state)',{URLSearchParams,location:{search:'?mensualidad=<script>&volumen=-20&plantilla=Infinity&vista=pricing&access_token=forged'}}));
 expect(state.externalCost).toBe(0);expect(state.vol).toBe(0);expect(state.externalRate).toBeNull();expect(state.access_token).toBeUndefined();
});
test('resharing a linked calculator keeps the deal link without carrying private or preview parameters',()=>{
 const token='a'.repeat(64),location={origin,search:'?r='+token+'&preview=1&dealId=private&access_token=forged'};
 const calculator=roiSources(hub).calculator;
 const sandbox={URL,URLSearchParams,location,startStandaloneRoi(){},state:{out:{whatsapp:true},roiActive:{},roiVals:{}},document:{getElementById:()=>({addEventListener(){}}),addEventListener(){}},waP:()=>({marketing:0.1}),metaFeeRate:()=>0};
 const result=runInNewContext(calculator+`\nroiCostValue=()=>558;roiVolume=()=>2000;roiShareUrl();`,sandbox);
 const link=new URL(result);
 expect(link.origin).toBe(origin);expect(link.searchParams.get('r')).toBe(token);
 expect([...link.searchParams.keys()].sort()).toEqual(['mensualidad','plantilla','r','volumen']);
});
test('only ROI and its two visual dependencies are public; path and query flags cannot select Pricing',async()=>{
 const gateway=createRoiPublicGateway(read);
 for(const path of ['', 'brand-system.css','logoadereso.webp'])expect((await gateway(new Request(origin+'/roi/'+path)))?.status).toBe(200);
 const response=await gateway(new Request(origin+'/roi/?vista=pricing&template=index.html'));
 expect(await response?.text()).toBe(roiDocument(hub,context));expect(response?.headers.get('set-cookie')).toBeNull();
 for(const path of ['index.html','dashboard-settings.js','roi-standalone.js','.env','academy/index.html','%2e%2e%2findex.html'])expect((await gateway(new Request(origin+'/roi/'+path)))?.status).toBe(404);
 expect((await gateway(new Request(origin+'/roi/',{method:'POST'})))?.status).toBe(405);
 expect(await gateway(new Request(origin+'/hub-content/index.html'))).toBeNull();
 expect((await gateway(new Request(origin+'/roi?mensualidad=558')))?.headers.get('location')).toBe('/roi/?mensualidad=558');
});
