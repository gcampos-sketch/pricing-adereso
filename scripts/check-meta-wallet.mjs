import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
let scripts=0;for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(/src=|application\/|type="module"/.test(m[1]))continue;new vm.Script(m[2]);scripts++;}
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
function setup(reduced=false){
 let timers=new Map(),animations=[],dots=[],next=0,updates=0;
 const cls=()=>({add(){},remove(){}});
 const price={classList:cls(),getBoundingClientRect:()=>({left:70,top:160,width:100,height:30})};
 const source={isConnected:true,classList:cls(),getBoundingClientRect:()=>({left:50,top:260,width:180,height:40}),closest:()=>({querySelector:()=>price})};
 const amount={isConnected:true,value:0,getBoundingClientRect:()=>({left:50,top:50,width:180,height:40})};
 const box={classList:cls()};
 const context=vm.createContext({console,prefersReduced:reduced,state:{existing:false,whatsapp:true,engage:true,out:{whatsapp:true,wacall:true},wa:{country:'CL',wallet:'recurrente',fee:null,service:0,marketing:0,utility:0,authentication:0,minutes:0,amount:0}},setTimeout:fn=>{timers.set(++next,fn);return next},clearTimeout:id=>timers.delete(id),renderWaLive(){updates++},renderRail(){},renderSummary(){},calcRoiNumbers(){},document:{getElementById:()=>amount,querySelector:()=>box,body:{animate(){},appendChild(d){dots.push(d)}},createElement:()=>{let own=[];return {setAttribute(){},remove(){dots=dots.filter(x=>x!==this)},getAnimations:()=>own,animate(frames,options){const an={frames,options,cancel(){an.cancelled=true}};own.push(an);animations.push(an);return an}}}}});
 vm.runInContext(between('const WA_PRICES=','/* ===== CASSPER')+between('function waService()','/* ---- module grid ---- */')+between('function walletManual()','/* Service sugerido:')+between('function waLoad(','function svHint()'),context);
 const run=s=>vm.runInContext(s,context);
 const flushTimers=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn())};
 const finish=()=>{while(animations.length){const a=animations.shift();if(!a.cancelled)a.onfinish?.()}};
 context.source=source;
 return {run,flushTimers,finish,amount,get dots(){return dots},get updates(){return updates}};
}
for(const existing of [false,true]){
 const t=setup();t.run(`state.existing=${existing}`);
 for(const [kind,qty] of [['marketing',1],['utility',1],['authentication',1],['minutes',1],['service',1001]]){
  const before=t.amount.value;t.run(`state.wa.${kind}=${qty};flyToWallet(source)`);t.flushTimers();assert.equal(t.dots.length,1);assert.equal(t.amount.value,before,'amount waits for arrival');t.finish();assert.equal(t.dots.length,0);assert.equal(+t.amount.value,t.run('Math.round(metaEst()*100)/100'));assert.ok(+t.amount.value>0);
 }
 t.run('state.wa.marketing=50;flyToWallet(source)');t.flushTimers();assert.equal(t.dots.length,1);t.run('state.wa.marketing=2;flyToWallet(source)');assert.equal(t.dots.length,0);t.flushTimers();t.finish();assert.equal(+t.amount.value,t.run('Math.round(metaEst()*100)/100'));
 t.run('flyToWallet(source)');t.flushTimers();t.run('cancelWalletFlight();state.wa.amount=123;document.getElementById().value=123');t.finish();assert.equal(t.amount.value,123,'manual value preserved');
 t.run('state.wa.service=0;state.wa.marketing=0;state.wa.utility=0;state.wa.authentication=0;state.wa.minutes=0;flyToWallet(source)');t.flushTimers();t.finish();assert.equal(t.amount.value,'','clearing quantities clears amount');
}
for(const existing of [false,true]){
 const t=setup();t.run(`state.existing=${existing};state.wa.amount=500;state.wa.amountSource='manual';state.wa.marketing=100`);
 t.amount.value=500;t.run('flyToWallet(source)');t.flushTimers();t.finish();assert.equal(t.amount.value,500,'simulation preserves manual recharge');
 t.run('waLoad(true)');assert.equal(+t.amount.value,9.78,'explicit use applies suggested cents');assert.equal(t.run('walletIsEstimate()'),true);
 t.run('state.wa.amount=0;state.wa.amountSource="manual";waLoad()');assert.equal(t.run('walletAmount()'),0,'manual zero is preserved');
 t.run('state.wa.amount=321;delete state.wa.amountSource;waLoad()');assert.equal(t.run('state.wa.amount'),321,'legacy positive amounts remain manual');
}
const reduced=setup(true);reduced.run('state.wa.marketing=1;flyToWallet(source)');assert.equal(+reduced.amount.value,.1);assert.equal(reduced.dots.length,0);
assert.match(html,/renderSummary\(\);flyToWallet\(inp\)/);
console.log(`PASS: ${scripts} inline scripts parse; both client formats, all five quantities, arrival timing, cents, accumulated totals, interrupted edits, manual amount, clearing and reduced motion.`);
