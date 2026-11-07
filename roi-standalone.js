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
}
