import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../../brochure.js',import.meta.url),'utf8');
const controller=source.slice(source.indexOf('function createShoppingDemo(node)'),source.indexOf("section.querySelectorAll('[data-br-live-demo]').forEach"));
function setup(reduced=false){
 const classes=()=>({toggle() {}}),handlers:any={},stageHandlers:any={},timers=new Map<number,()=>void>();let timerId=0,observe:any;
 const fields=['Juan','Aura Pro','Compra y retiro en tienda','Autorizar retiro en domingo'].map(shoppingValue=>({dataset:{shoppingValue},textContent:'—',classList:classes()}));
 const tags=[0,1,2].map(()=>({hidden:true})),reply={textContent:'Respuesta de la IA para el cliente.'},status={textContent:''},play={textContent:''},empty={hidden:false},summary={textContent:''},tagArea={classList:classes()};
 const stage={addEventListener:(name:string,fn:any)=>stageHandlers[name]=fn,contains:()=>false};
 const bodies=[0,1].map(()=>{const carousel:any={children:[{offsetLeft:0},{offsetLeft:210}],scrollTo:(v:any)=>carousel.lastScroll=v};const body:any={scrollTop:0,getBoundingClientRect:()=>({top:0}),querySelector:(s:string)=>s==='.br-shopping-products'?carousel:{getBoundingClientRect:()=>({top:100})},scrollTo:(v:any)=>body.lastScroll=v};return{body,carousel};});
 const panels=bodies.map(({body},i)=>({dataset:{shoppingPanel:i?'team':'client'},hidden:!!i,querySelector:()=>body}));
 const select=(s:string):any=>({'[data-shopping-reply]':reply,'[data-shopping-hover]':stage,'[data-shopping-empty-tags]':empty,'[data-shopping-summary]':summary,'.br-ticket-tag-area':tagArea,'[data-shopping-status]':status,'[data-shopping-play]':play}[s]);
 const selectAll=(s:string):any[]=>({'[data-shopping-field]':fields,'[data-shopping-tag]':tags,'[data-shopping-panel]':panels,'[data-shopping-view-button]':[], '[data-demo-show]':[], '[data-demo-phase]':[], '[data-shopping-reply]':[reply]}[s]||[]);
 const node:any={dataset:{},querySelector:select,querySelectorAll:selectAll,addEventListener:(name:string,fn:any)=>handlers['node-'+name]=fn};
 const doc:any={hidden:false,addEventListener:(name:string,fn:any)=>handlers[name]=fn,dispatchEvent:(event:any)=>handlers[event.type]?.(event)};
 const media={matches:reduced,addEventListener() {}};
 const context:any={document:doc,matchMedia:()=>media,CustomEvent:class{type:string;detail:any;constructor(type:string,options:any){this.type=type;this.detail=options.detail;}},clearTimeout:(id:number)=>timers.delete(id),setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},IntersectionObserver:class{constructor(fn:any){observe=fn;}observe(){}}};
 runInNewContext(controller,context);context.createShoppingDemo(node);
 const tick=()=>{const entry=timers.entries().next().value;if(entry){timers.delete(entry[0]);entry[1]();}};
 const until=(phase:number)=>{for(let n=0;n<2500&&Number(node.dataset.demoStep)<phase;n++)tick();expect(node.dataset.demoStep).toBe(String(phase));};
 return{node,fields,tags,reply,status,play,bodies,panels,timers,tick,until,doc,handlers,stageHandlers,visible:()=>observe([{isIntersecting:true}])};
}
test('the conversation waits for hover, types progressively, pauses on leave and resumes in place',()=>{
 const c=setup();c.visible();expect(c.timers.size).toBe(0);c.stageHandlers.pointerenter();c.tick();expect(c.node.dataset.demoStep).toBe('1');c.tick();const partial=c.reply.textContent;expect(partial.length).toBe(2);c.stageHandlers.pointerleave();expect(c.timers.size).toBe(0);expect(c.reply.textContent).toBe(partial);c.stageHandlers.pointerenter();c.tick();expect(c.reply.textContent.length).toBe(4);
});
test('the carousel slides before tags appear, then ticket fields are filled one at a time',()=>{
 const c=setup();c.visible();c.stageHandlers.pointerenter();c.until(3);expect(c.tags.every(t=>t.hidden)).toBe(true);c.until(4);expect(c.bodies[1].carousel.lastScroll.left).toBe(210);expect(c.tags.every(t=>t.hidden)).toBe(true);c.until(5);expect(c.node.dataset.shoppingView).toBe('team');expect(c.tags.every(t=>t.hidden)).toBe(true);c.tick();expect(c.tags.filter(t=>!t.hidden).length).toBe(1);expect(c.fields.every(f=>f.textContent==='—')).toBe(true);c.until(6);c.tick();expect(c.fields[0].textContent).toBe('J');expect(c.fields[1].textContent).toBe('—');c.until(7);expect(c.fields.map(f=>f.textContent)).toEqual(c.fields.map(f=>f.dataset.shoppingValue));expect(c.timers.size).toBe(1);c.until(8);expect(c.node.dataset.studioFocus).toBe('conversation');c.until(9);expect(c.node.dataset.studioFocus).toBe('handoff');c.until(10);expect(c.timers.size).toBe(0);
});
test('a hidden page stops typing and reduced motion has a complete, static ticket',()=>{
 const c=setup();c.visible();c.stageHandlers.pointerenter();c.until(1);c.doc.hidden=true;c.handlers.visibilitychange();expect(c.timers.size).toBe(0);const reduced=setup(true);reduced.visible();reduced.stageHandlers.pointerenter();expect(reduced.node.dataset.demoStep).toBe('10');expect(reduced.fields.every(f=>f.textContent===f.dataset.shoppingValue)).toBe(true);expect(reduced.timers.size).toBe(0);
});

test('manual classification and context steps open the team ticket rather than the client chat',()=>{const c=setup();c.visible();c.handlers['node-click']({target:{closest:(selector:string)=>selector==='[data-demo-phase]'?{dataset:{demoPhase:'7'}}:null}});expect(c.node.dataset.shoppingView).toBe('team');expect(c.node.dataset.demoStep).toBe('7');expect(c.fields.every(f=>f.textContent===f.dataset.shoppingValue)).toBe(true);expect(c.timers.size).toBe(0);});

test('the exception transfers the same ticket from the AI queue to the human queue',async()=>{
 const c=setup(),original=c.node.querySelector;let finish!:()=>void;let removed=false;let frames:any,options:any;
 const ghost:any={style:{},removeAttribute(){},classList:{add(){}},remove(){removed=true;},animate(f:any,o:any){frames=f;options=o;return{finished:new Promise<void>(r=>finish=r),play(){},pause(){}};}};
 const ai={getBoundingClientRect:()=>({left:50,top:100,width:160,height:130}),cloneNode:()=>ghost},human={getBoundingClientRect:()=>({left:230,top:100,width:160,height:130})};
 c.node.getBoundingClientRect=()=>({left:0,top:0});c.node.append=()=>{};c.node.querySelector=(q:string)=>q==='[data-studio-ai-card]'?ai:q==='[data-studio-human-card]'?human:original(q);
 c.handlers['node-click']({target:{closest:(s:string)=>s==='[data-demo-phase]'?{dataset:{demoPhase:'9'}}:null}});
 expect(c.node.dataset.studioFocus).toBe('handoff');expect(c.node.dataset.studioTransferring).toBe('true');expect(options.duration).toBe(1800);expect(frames.at(-1).transform).toBe('translate(180px,0px) scale(1)');finish();await Promise.resolve();expect(removed).toBe(true);expect(c.node.dataset.studioTransferring).toBeUndefined();
});


test('advancing during a paused transfer removes the ghost and reveals the final human ticket',()=>{
 const c=setup(),original=c.node.querySelector;let cancelled=false,removed=false;
 const ghost:any={style:{},removeAttribute(){},classList:{add(){}},remove(){removed=true;},animate(){return{finished:new Promise(()=>{}),cancel(){cancelled=true;},play(){},pause(){}};}};
 const ai={getBoundingClientRect:()=>({left:50,top:100,width:160,height:130}),cloneNode:()=>ghost},human={getBoundingClientRect:()=>({left:230,top:100,width:160,height:130})};
 c.node.getBoundingClientRect=()=>({left:0,top:0});c.node.append=()=>{};c.node.querySelector=(q:string)=>q==='[data-studio-ai-card]'?ai:q==='[data-studio-human-card]'?human:original(q);
 const originalAll=c.node.querySelectorAll;c.node.querySelectorAll=(q:string)=>q==='.br-studio-ticket-transfer,.br-typing-particle'&&c.node.dataset.studioTransferring?[ghost]:originalAll(q);
 const choose=(phase:string)=>c.handlers['node-click']({target:{closest:(s:string)=>s==='[data-demo-phase]'?{dataset:{demoPhase:phase}}:null}});
 choose('9');expect(c.node.dataset.studioTransferring).toBe('true');choose('10');expect(cancelled).toBe(true);expect(removed).toBe(true);expect(c.node.dataset.studioTransferring).toBeUndefined();expect(c.node.dataset.demoStep).toBe('10');
});
