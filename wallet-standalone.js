/* Isolated wallet inputs. No account, CRM records or other Hub sections. */
const walletQuery=new URLSearchParams(location.search);
const walletNumber=(value,fallback=0,max=1e9)=>Number.isFinite(+value)&&+value>=0?Math.min(max,+value):fallback;
let walletInitial={};
try { const raw=JSON.parse(walletQuery.get('c')||'{}');if(raw&&typeof raw==='object'&&!Array.isArray(raw))walletInitial=raw; } catch {/* A malformed scenario never becomes code or markup. */}
const walletCountry=['CL','AR','BR','CO','MX','PE','ES','XL'].includes(walletInitial.country)?walletInitial.country:'CL';
const walletQty=walletInitial.quantities&&typeof walletInitial.quantities==='object'?walletInitial.quantities:{};
const state={existing:walletInitial.existing===true,whatsapp:true,walletOnly:false,engage:true,out:{whatsapp:true,wacall:true},roiCostTouched:true,
 vol:Math.round(walletNumber(walletInitial.conversations,2000)),wa:{country:walletCountry,wallet:walletInitial.wallet==='recurrente'?'recurrente':'no_recurrente',fee:walletInitial.fee==null?null:walletNumber(walletInitial.fee,null,20),
 svConvs:Math.round(walletNumber(walletInitial.conversations,2000)),svPer:Math.max(1,walletNumber(walletInitial.messagesPerConversation,4,20)),
 service:walletNumber(walletQty.service),marketing:walletNumber(walletQty.marketing),utility:walletNumber(walletQty.utility),authentication:walletNumber(walletQty.authentication),minutes:walletNumber(walletQty.minutes),
 amount:walletNumber(walletInitial.amount),amountSource:walletInitial.manual===true?'manual':'estimate',calcOpen:true}};
const prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const usd2=n=>'$'+(+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const usd3=n=>'$'+(+n||0).toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
const WA_LABEL={marketing:'Marketing',utility:'Utilidad',authentication:'Autenticación',service:'Service'};
function roiVolume(){return state.vol;}
function renderRail(){}function renderSummary(){}function calcRoiNumbers(){}function renderMods(){}function renderOpts(){}function refreshFlow(){}
function applyReveal(root){root.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));}
function walletPublicContext(){return {existing:state.existing,country:state.wa.country,wallet:state.wa.wallet,fee:state.wa.fee??null,conversations:Math.round(walletNumber(state.existing?svRange().v:state.vol)),messagesPerConversation:Math.max(1,walletNumber(state.wa.svPer,4,20)),quantities:Object.fromEntries(['service','marketing','utility','authentication','minutes'].map(k=>[k,walletNumber(state.wa[k])])),amount:walletNumber(walletAmount()),manual:walletManual()};}
function startStandaloneWallet(){
 renderWa();paintIcons();
 const input=document.getElementById('walletVolume');input.value=state.vol;
 document.getElementById('walletVolumeField').hidden=state.existing;
 input.addEventListener('input',()=>{state.vol=Math.round(walletNumber(input.value));svRefresh();});
 document.getElementById('waArea').addEventListener('click',e=>{if(e.target.closest('[data-pop]'))document.getElementById('walletHelp').showModal();});
 startWalletActivity();
}
// A GET, email preview or hidden tab is not a confirmed calculator visit.
function startWalletActivity(){
 const token=walletQuery.get('w');if(!/^[a-f0-9]{64}$/.test(token||'')||walletQuery.get('preview')==='1'){document.getElementById('walletActivityNotice').hidden=true;return;}
 let sessionId,sequence=0,lastScenario='',timer,opened=false;const key='wallet-session:'+token;
 try { const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved&&/^[a-f0-9-]{36}$/.test(saved.id)&&Date.now()-saved.at<30*60*1000){sessionId=saved.id;sequence=Math.min(500,Math.max(0,saved.sequence||0));} } catch {}
 sessionId=sessionId||crypto.randomUUID();
 function remember(){try{sessionStorage.setItem(key,JSON.stringify({id:sessionId,sequence,at:Date.now()}));}catch{}}
 function send(kind,scenario){if(kind==='scenario'&&sequence>=500)return;const current=kind==='open'?0:++sequence;remember();fetch('/api/wallet/events',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,sessionId,sequence:current,kind,scenario}),keepalive:true}).catch(()=>{});}
 function snapshot(){return {context:walletPublicContext(),meta:metaBase(),fee:metaFee(),estimated:metaEst()};}
 lastScenario=JSON.stringify(snapshot());
 function open(){if(opened||document.visibilityState!=='visible')return;opened=true;send('open',null);}
 const openTimer=setTimeout(open,1200);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')open();});
 function record(){if(document.visibilityState!=='visible')return;open();const scenario=snapshot(),encoded=JSON.stringify(scenario);if(encoded===lastScenario)return;lastScenario=encoded;send('scenario',scenario);}
 function changed(e){if(!e.isTrusted||!e.target.closest('#waArea,#walletVolume'))return;clearTimeout(timer);timer=setTimeout(record,1400);}
 document.addEventListener('input',changed,true);document.addEventListener('change',changed,true);document.addEventListener('click',changed,true);
 window.addEventListener('pagehide',()=>{clearTimeout(openTimer);if(timer){clearTimeout(timer);record();}});
}
