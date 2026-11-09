/* Standalone inputs for the shared ROI calculation; no pricing catalog or Hub state. */
const query=new URLSearchParams(location.search);
const bounded=(value,fallback,max=1e9)=>{if(value===null||value==='')return fallback;const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(0,n)):fallback;};
const state={desk:true,studio:true,engage:true,cassper:true,vol:Math.round(bounded(query.get('volumen'),2000)),volMode:'tile',out:{correo:true,whatsapp:true},wa:{marketing:0},roiActive:{},roiAuto:{},roiAutoKey:{},roiVals:{},roiAlloc:{},roiTicket:null,roiMacroOpen:{Ventas:true,Postventa:true},currentPay:0,externalCost:bounded(query.get('mensualidad'),0),externalRate:bounded(query.get('plantilla'),null,100)};
const usd=n=>'$'+(+n||0).toLocaleString('es-CL',{maximumFractionDigits:0});
const usd3=n=>'$'+(+n||0).toLocaleString('es-CL',{maximumFractionDigits:4});
function hasService(){return true}
function monthly(){return state.externalCost}
function xCost(){return 0}
function casspM(){return 0}
function waP(){return {marketing:state.externalRate,flag:'',name:'Tarifa ingresada'}}
function metaFeeRate(){return 0} // Standalone unit rate already includes Meta + fee.
function applyReveal(root){root.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'))}
// Pricing refresh hooks have no other sections to update in the standalone document.
function renderMods(){} function renderWa(){} function renderWaLive(){} function renderRail(){} function renderSummary(){} function refreshFlow(){} function svRefresh(){}
function renderAll(){renderRoi()}
function startStandaloneRoi(){
 const cost=document.getElementById('roiStandaloneCost'),volume=document.getElementById('roiStandaloneVolume'),rate=document.getElementById('roiStandaloneRate');
 cost.value=state.externalCost||'';volume.value=state.vol;rate.value=state.externalRate==null?'':state.externalRate;
 cost.addEventListener('input',()=>{state.externalCost=bounded(cost.value,0);calcRoiNumbers()});
 rate.addEventListener('input',()=>{state.externalRate=bounded(rate.value,null,100);calcRoiNumbers()});
 volume.addEventListener('change',()=>{state.vol=Math.round(bounded(volume.value,0));state.roiAlloc={};syncRoiVolume()});
 renderRoi();paintIcons();
 startRoiActivity();
}

// A page fetch or a mail preview is not a visit. Only a visible JavaScript
// calculator records opens; scenarios require an actual browser interaction.
function startRoiActivity(){
 const token=query.get('r');
 if(!/^[a-f0-9]{64}$/.test(token||'')||query.get('preview')==='1')return;
 let sessionId,sequence=0,lastScenario='',timer,opened=false;
 const key='roi-session:'+token;
 try{
  const saved=JSON.parse(sessionStorage.getItem(key)||'null');
  if(saved&&/^[a-f0-9-]{36}$/.test(saved.id)&&Date.now()-saved.at<30*60*1000){sessionId=saved.id;sequence=Math.min(500,Math.max(0,saved.sequence||0));}
 }catch{/* Storage is optional; calculation and activity work without it. */}
 sessionId=sessionId||crypto.randomUUID();
 function remember(){try{sessionStorage.setItem(key,JSON.stringify({id:sessionId,sequence,at:Date.now()}));}catch{}}
 function send(kind,scenario){
  if(kind==='scenario'&&sequence>=500)return;
  const current=kind==='open'?0:++sequence;remember();
  fetch('/api/roi/events',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,sessionId,sequence:current,kind,scenario}),keepalive:true}).catch(()=>{});
 }
 function snapshot(){
  const numeric=v=>Number.isFinite(+v)?Math.min(1e9,Math.max(0,+v)):0;
  return {context:{mensualidad:numeric(state.externalCost),volumen:Math.round(numeric(state.vol)),plantilla:state.externalRate==null?null:Math.min(100,numeric(state.externalRate))},
   cases:ROI_ORDER.filter(k=>state.roiActive[k]&&!roiPending(k)).map(id=>({id,values:Object.fromEntries(ROI_CASES[id].fields.map(f=>[f.id,numeric(roiVals(id)[f.id])]))})),
   gain:Math.min(1e15,Math.max(0,Number.isFinite(roiTot.gain)?roiTot.gain:0)),cost:Math.min(1e15,Math.max(0,Number.isFinite(roiTot.cost)?roiTot.cost:0))};
 }
 lastScenario=JSON.stringify(snapshot());
 function open(){if(opened||document.visibilityState!=='visible')return;opened=true;send('open',null);}
 const openTimer=setTimeout(open,1200);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')open();});
 function record(){if(document.visibilityState!=='visible')return;open();const value=snapshot(),encoded=JSON.stringify(value);if(encoded===lastScenario)return;lastScenario=encoded;send('scenario',value);}
 function changed(e){
  if(!e.isTrusted||!e.target.closest('#roiArea,#roiStandaloneCost,#roiStandaloneVolume,#roiStandaloneRate'))return;
  clearTimeout(timer);timer=setTimeout(record,1200);
 }
 // Capture before the calculator replaces a clicked card; a detached target
 // would otherwise no longer have #roiArea among its ancestors.
 document.addEventListener('input',changed,true);document.addEventListener('change',changed,true);document.addEventListener('click',changed,true);
 window.addEventListener('pagehide',()=>{clearTimeout(openTimer);if(timer){clearTimeout(timer);record();}});
}
