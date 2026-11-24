/* Live commercial content: source prose only; no remote HTML or executable markup. */
(()=>{'use strict';
 const guide=document.currentScript?.dataset.guide;
 const flowPageId='4219c274-7df5-81d4-b9c8-f940f928eb50';
 if(!['playbook','operativa'].includes(guide))return;
 function init(){
  const host=document.getElementById(guide==='playbook'?'secs':'tree');if(!host)return;
  const nav=document.getElementById('toc');let version='',busy=false,pending=null;const documentIds=new Set();
  const el=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!=null)x.textContent=value;return x;};
  const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  function rich(parent,runs){for(const r of runs||[]){let n=el(r.code?'code':'span','',r.text||'');if(r.bold){const b=el('strong');b.append(n);n=b;}if(r.italic){const i=el('em');i.append(n);n=i;}if(r.underline)n.style.textDecoration='underline';if(r.strike)n.style.textDecoration='line-through';if(safe(r.href)){const a=el('a');a.href=safe(r.href);a.target='_blank';a.rel='noopener noreferrer';a.append(n);n=a;}parent.append(n);}}
  const plain=b=>(b.text||[]).map(x=>x.text).join('');
  function node(b){
   const label=plain(b),fold=b.type==='toggle'||(/^heading_/.test(b.type)&&b.children?.length);
   let x;
   if(fold){x=el('details','guide-fold');const summary=el('summary');rich(summary,b.text);if(!label)summary.textContent='Ver detalle';x.append(summary);const inside=el('div','guide-inner');for(const c of b.children||[])inside.append(node(c));x.append(inside);}
   else if(/^heading_[123]$/.test(b.type)){x=el('h'+(Number(b.type.at(-1))+1),'guide-heading');rich(x,b.text);}
   else if(b.type==='table'){x=el('div','guide-table-wrap');const table=el('table');for(const row of b.children||[]){const tr=el('tr');for(const cell of row.cells||[]){const td=el('td');rich(td,cell);tr.append(td);}table.append(tr);}x.append(table);}
   else if(b.type==='divider')x=el('hr');
   else if(b.type==='table_of_contents')x=el('div','guide-source-toc');
   else if(b.type==='code'){x=el('pre');rich(x,b.text);}
   else {x=el(b.type==='quote'?'blockquote':'div','guide-line guide-'+b.type);
    if(b.type==='to_do')x.append(el('span','guide-bullet',b.checked?'☑':'☐'));
    if(b.type==='bulleted_list_item'||b.type==='numbered_list_item')x.append(el('span','guide-bullet',b.type==='bulleted_list_item'?'•':'›'));
    const body=el('div','guide-line-body');rich(body,b.text);
    if(b.type==='child_page'&&documentIds.has(b.id)){const a=el('a','guide-link',label||'Ver documento');a.href='#guide-document-'+b.id;body.replaceChildren(a);}
    else if(b.url&&safe(b.url)){const a=el('a','guide-link',label||({image:'Ver imagen',pdf:'Abrir PDF',video:'Ver video',file:'Abrir archivo'}[b.type]||'Abrir recurso'));a.href=safe(b.url);a.target='_blank';a.rel='noopener noreferrer';body.replaceChildren(a);}
    for(const c of b.children||[])body.append(node(c));x.append(body);
   }
   x.id='guide-block-'+b.id;
   // Keep personal practice/notes alongside the source text; these never edit Notion.
   const stageNumber=guide==='playbook'&&/^heading_/.test(b.type)?label.match(/^ETAPA\s+(\d+)/i)?.[1]:null;
   const stage=stageNumber!=null&&typeof STAGES!=='undefined'?STAGES.find(s=>String(s.num)===stageNumber):null;
   if(stage&&fold){
    x.setAttribute('data-sec','');const card=el('div','card guide-note-card');card.setAttribute('data-card','');const tools=el('div','guide-tools');
    if(typeof PST!=='undefined'&&PST.includes(stage.id)){const practice=el('div','prac'),button=el('button','btn prac-b','Practicar escenario');button.type='button';button.dataset.prac=stage.id;button.setAttribute('aria-expanded','false');const pop=el('div','pr-pop');pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Escenario de práctica');practice.append(button,pop);tools.append(practice);}
    const write=el('button','btn','Tomar nota');write.type='button';write.dataset.write=x.id;tools.append(write);card.append(tools);
    const form=el('div','myn'),area=el('textarea');area.placeholder='Tu nota sobre esta etapa';const buttons=el('div'),cancel=el('button','btn sm','Cancelar'),save=el('button','btn pri sm','Guardar nota');cancel.type=save.type='button';cancel.dataset.write=x.id;save.dataset.noteSave=stage.id;buttons.append(cancel,save);form.append(area,buttons);card.append(form);x.insertBefore(card,x.querySelector('.guide-inner'));
   }
   return x;
  }
  const style=el('style');style.textContent=`
   .guide-tools{display:flex;gap:10px;flex-wrap:wrap;margin:0 22px 14px}.guide-note-card{padding:0 0 6px}.guide-note-card .myn{margin:0 22px 14px}.guide-status{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin:18px 0 28px;color:var(--t2,#a1a1aa);font-size:13px}.guide-status button{cursor:pointer}.guide-doc{margin:28px 0 42px;padding:clamp(20px,3vw,42px);border:1px solid var(--b,#34353b);border-radius:24px;background:var(--surface,#191b20);line-height:1.65;overflow-wrap:anywhere}.guide-related>summary{cursor:pointer;font:500 24px var(--head,system-ui);color:var(--t,#fff)}.guide-related>summary:hover{color:var(--brand,#ffd540)}.guide-related>summary+div{margin-top:22px}.guide-doc>h2{margin:0 0 22px;font-size:clamp(24px,3vw,34px);color:var(--t,#fff)}.guide-line{display:flex;gap:10px;margin:10px 0;color:var(--t2,#b2b3bd)}.guide-line-body{min-width:0;flex:1;white-space:pre-wrap}.guide-line-body>.guide-line{white-space:normal}.guide-line strong{color:var(--t,#fff)}.guide-bullet{color:var(--brand,#ffd540);flex:none}.guide-heading{margin:28px 0 12px;scroll-margin-top:30px}.guide-fold{border:1px solid var(--b,#34353b);border-radius:16px;margin:14px 0;background:rgba(255,255,255,.018)}.guide-fold>summary{cursor:pointer;padding:18px 22px;font:500 19px var(--head,system-ui);color:var(--t,#fff)}.guide-fold>summary:hover{color:var(--brand,#ffd540)}.guide-inner{padding:0 22px 18px}.guide-callout,.guide-quote{padding:14px 18px;border-left:2px solid var(--brand,#ffd540);background:rgba(255,213,64,.045);border-radius:0 12px 12px 0}.guide-column_list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:20px}.guide-column_list>.guide-line-body{display:contents}.guide-table-wrap{overflow:auto;margin:20px 0}.guide-table-wrap table{min-width:100%;border-collapse:collapse;font-size:14px}.guide-table-wrap td{padding:12px 16px;border:1px solid var(--b,#34353b);white-space:pre-wrap;min-width:130px;vertical-align:top}.guide-doc a{color:var(--brand,#ffd540);text-underline-offset:3px}.guide-doc code,.guide-doc pre{font-family:ui-monospace,monospace;font-size:.9em;background:rgba(255,255,255,.06);border-radius:6px;padding:2px 5px}.guide-doc pre{white-space:pre-wrap;padding:18px}.guide-doc hr{border:0;border-top:1px solid var(--b,#34353b);margin:24px 0}.guide-doc [hidden]{display:none!important}.guide-notice{padding:18px;border:1px solid var(--b,#34353b);border-radius:14px;margin:18px 0}.guide-status a{color:var(--brand,#ffd540)}
  `;document.head.append(style);
  const status=el('div','guide-status'),caption=el('span','','Cargando la versión de Notion…'),refresh=el('button','btn sm','Actualizar');refresh.type='button';status.append(caption,refresh);host.before(status);
  // Do not silently present the embedded, dated copy as current while the source is unavailable.
  host.replaceChildren();const loading=el('p','guide-notice','Cargando contenido…');host.append(loading);
  document.querySelectorAll('.hero .tl,.hero .legend').forEach(x=>x.hidden=true);
  const sidebarDate=document.querySelector('.side-box .dt,.chapter-resource-panel .dt');if(sidebarDate)sidebarDate.textContent='Conectando con Notion';
  const flow=guide==='operativa'?createFlow():null;

  function createFlow(){
   const stylesheet=el('link');stylesheet.rel='stylesheet';stylesheet.href='/hub-content/operativa/adobo-flow.css';document.head.append(stylesheet);
   const trigger=el('button','adobo-flow-trigger','Ver flujo comercial');
   trigger.type='button';trigger.hidden=true;
   trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','adobo-flow');
   (document.querySelector('.hero p')||status).after(trigger);

   const dialog=el('dialog','adobo-flow');dialog.id='adobo-flow';
   dialog.setAttribute('aria-labelledby','adobo-flow-title');
   const header=el('header','adobo-flow-header');
   const heading=el('div');
   const title=el('h2','','Mapa de Operativa');title.id='adobo-flow-title';
   const hint=el('p','','Toca un nodo para extender el flujo o ver su detalle.');
   heading.append(title,hint);
   const scope=el('details','adobo-flow-scope');
   const scopeContent=el('div','adobo-flow-scope-content');
   const preface=el('div');
   const source=el('a','','Ver fuente en Notion');source.target='_blank';source.rel='noopener noreferrer';
   scopeContent.append(preface,source);scope.append(el('summary','','Alcance y fuente'),scopeContent);
   const close=el('button','adobo-flow-icon','×');close.type='button';close.setAttribute('aria-label','Cerrar flujo');close.autofocus=true;
   const headerActions=el('div','adobo-flow-header-actions');headerActions.append(scope,close);
   header.append(heading,headerActions);

   const workspace=el('div','adobo-flow-workspace');
   const viewport=el('div','adobo-flow-viewport');
   viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','Lienzo del flujo comercial. Usa las flechas para moverlo.');
   const canvas=el('canvas','adobo-flow-lines');canvas.setAttribute('aria-hidden','true');
   const world=el('div','adobo-flow-world');
   viewport.append(canvas,world);

   const toolbar=el('div','adobo-flow-toolbar');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Controles del mapa');
   const zoomOut=el('button','adobo-flow-icon','−');zoomOut.type='button';zoomOut.setAttribute('aria-label','Alejar');
   const scaleLabel=el('output','adobo-flow-scale');
   const zoomIn=el('button','adobo-flow-icon','+');zoomIn.type='button';zoomIn.setAttribute('aria-label','Acercar');
   const fit=el('button','adobo-flow-fit','Encuadrar');fit.type='button';
   toolbar.append(zoomOut,scaleLabel,zoomIn,fit);

   const detail=el('section','adobo-flow-detail');detail.id='adobo-flow-detail';detail.hidden=true;
   const detailHeader=el('div','adobo-flow-detail-header');
   const detailTitle=el('h3');detailTitle.id='adobo-flow-stage';
   detail.setAttribute('aria-labelledby',detailTitle.id);
   const detailClose=el('button','adobo-flow-icon','×');detailClose.type='button';detailClose.setAttribute('aria-label','Cerrar detalle');
   detailHeader.append(detailTitle,detailClose);
   const cards=el('div','adobo-flow-cards');detail.append(detailHeader,cards);
   workspace.append(viewport,toolbar,detail);dialog.append(header,workspace);
   document.body.append(dialog);

   const definitions=[
    {id:'sdr',label:'Captación',detail:'SDR · Prospección y calificación',codes:['SDR'],main:true},
    {id:'sale',label:'Venta',detail:'E1–E5.1 · De reunión a negociación',codes:['E1','E2','E3','E4','E5'],main:true},
    {id:'delivery',label:'Firma y servicio',detail:'E6–E8 · De firma a servicio iniciado',codes:['E6','E7','E8'],main:true},
    {id:'expansion',label:'Expansión',detail:'E0 · Entrada desde cartera',codes:['E0']},
    {id:'loss',label:'Pérdidas y churn',detail:'Salidas de venta y servicio',codes:['Salidas']},
    {id:'health',label:'Saneación y control',detail:'Apoyo transversal',codes:['Todo el pipeline']},
   ];
   const width=208,height=82,gap=258,lane=154,minZoom=.26,maxZoom=1.45;
   const openGroups=new Map(),buttons=new Map();
   const camera={x:0,y:0,k:1};
   let groups=[],graph={nodes:[],edges:[]},selected='',opener=null,frame=0;
   let canvasWidth=0,canvasHeight=0;
   const pointers=new Map();
   const compact=matchMedia('(max-width: 719px)');

   function buildGraph(){
    const nodes=[],edges=[],bounds=new Map();
    const add=(item,x,y,group,stage)=>{
     const n={id:stage?.heading.id||group.id,x,y,group,stage,title:item.label,caption:item.detail||item.code};
     nodes.push(n);return n;
    };
    const connect=(from,to,kind='primary',fromSide='right',toSide='left')=>{
     if(from&&to)edges.push({from,to,kind,fromSide,toSide});
    };
    let col=0,previous=null;
    for(const group of groups.filter(group=>group.main)){
     const root=add(group,col++*gap,lane,group);
     connect(previous,root);
     let tail=root;
     for(const stage of group.stages.slice(0,openGroups.get(group.id)||0)){
      const next=add(stage,col++*gap,lane,group,stage);
      connect(tail,next,'stage');tail=next;
     }
     bounds.set(group.id,{root,tail});previous=tail;
    }
    const sale=bounds.get('sale'),delivery=bounds.get('delivery');
    for(const group of groups.filter(group=>!group.main)){
     const positions={
      expansion:[Math.max(0,(sale?.root.x||gap)-gap*.45),0],
      loss:[(delivery?.root.x??previous?.x??gap)+gap*.4,312],
      health:[Math.max(0,(sale?.root.x||gap)-gap*.45),312],
      other:[0,462],
     };
     const [x,y]=positions[group.id];
     const root=add(group,x,y,group);
     if(group.id==='expansion')connect(root,sale?.root,'alternate','bottom','top');
     if(group.id==='loss'){
      connect(sale?.tail,root,'loss','bottom','top');
      connect(delivery?.tail,root,'loss','bottom','top');
     }
     if(group.id==='health')connect(root,sale?.root,'control','top','bottom');
     if(openGroups.has(group.id)){
      let tail=root;
      for(const [index,stage] of group.stages.slice(0,openGroups.get(group.id)||0).entries()){
       const next=add(stage,x+(index+1)*gap,y,group,stage);
       connect(tail,next,'stage');tail=next;
      }
     }
    }
    return {nodes,edges};
   }

   function point(n,side){
    if(side==='top')return [n.x+width/2,n.y];
    if(side==='bottom')return [n.x+width/2,n.y+height];
    return [n.x+(side==='right'?width:0),n.y+height/2];
   }
   function paint(){
    if(!dialog.open)return;
    world.style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.k})`;
    viewport.style.setProperty('--grid-x',camera.x+'px');
    viewport.style.setProperty('--grid-y',camera.y+'px');
    viewport.style.setProperty('--grid-size',24*camera.k+'px');
    const w=viewport.clientWidth,h=viewport.clientHeight,ratio=Math.min(devicePixelRatio||1,2);
    if(w!==canvasWidth||h!==canvasHeight||canvas.width!==Math.round(w*ratio)){
     canvasWidth=w;canvasHeight=h;canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    }
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
    ctx.translate(camera.x,camera.y);ctx.scale(camera.k,camera.k);
    for(const edge of graph.edges){
     const {from,to,kind,fromSide,toSide}=edge;
     const [x1,y1]=point(from,fromSide),[x2,y2]=point(to,toSide);
     const vertical=fromSide==='bottom'||fromSide==='top';
     const mid=vertical?(y1+y2)/2:(x1+x2)/2;
     ctx.strokeStyle=ctx.fillStyle={primary:'#8394ab',stage:'#ffd46a',alternate:'#9d91f2',loss:'#fa9ba9',control:'#78c8bd'}[kind];
     ctx.lineWidth=1.55/camera.k;
     ctx.setLineDash(['primary','stage'].includes(kind)?[]:[5/camera.k,5/camera.k]);
     ctx.beginPath();ctx.moveTo(x1,y1);
     if(vertical)ctx.bezierCurveTo(x1,mid,x2,mid,x2,y2);
     else ctx.bezierCurveTo(mid,y1,mid,y2,x2,y2);
     ctx.stroke();
     if(kind==='control')continue;
     const angle=vertical?(toSide==='top'?Math.PI/2:-Math.PI/2):0;
     const length=6/camera.k;
     ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x2,y2);
     ctx.lineTo(x2-length*Math.cos(angle-.55),y2-length*Math.sin(angle-.55));
     ctx.lineTo(x2-length*Math.cos(angle+.55),y2-length*Math.sin(angle+.55));
     ctx.closePath();ctx.fill();
    }
    scaleLabel.value=Math.round(camera.k*100)+'%';
    zoomOut.disabled=camera.k<=minZoom;zoomIn.disabled=camera.k>=maxZoom;
   }
   function queuePaint(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{frame=0;paint();});
   }
   function usefulWidth(){
    return viewport.clientWidth-(!detail.hidden&&!compact.matches?detail.offsetWidth:0);
   }
   function usefulHeight(){
    return viewport.clientHeight-(!detail.hidden&&compact.matches?detail.offsetHeight:0);
   }
   function fitGraph(initial=false){
    if(!graph.nodes.length||!viewport.clientWidth)return;
    const left=Math.min(...graph.nodes.map(n=>n.x));
    const right=Math.max(...graph.nodes.map(n=>n.x+width));
    const top=Math.min(...graph.nodes.map(n=>n.y));
    const bottom=Math.max(...graph.nodes.map(n=>n.y+height));
    const w=usefulWidth(),h=usefulHeight();
    if(initial&&w<640){
     camera.k=Math.max(.58,Math.min(.8,(w-44)/(gap+width)));
     camera.x=22-left*camera.k;camera.y=h*.37-lane*camera.k;
    }else{
     camera.k=Math.max(minZoom,Math.min(1.05,(w-56)/(right-left),(h-104)/(bottom-top)));
     camera.x=(w-(right-left)*camera.k)/2-left*camera.k;
     camera.y=(h-42-(bottom-top)*camera.k)/2-top*camera.k;
    }
    queuePaint();
   }
   function showRange(first,last=first){
    if(!first)return;
    const w=usefulWidth(),h=usefulHeight();
    const needed=last.x+width-first.x;
    if(first!==last&&w<575)camera.k=Math.min(camera.k,Math.max(.58,(w-50)/needed));
    if(needed*camera.k<=w-48){
     camera.x=(w-needed*camera.k)/2-first.x*camera.k;
    }else{
     camera.x=24-first.x*camera.k;
    }
    const focusY=h*.43;
    camera.y=focusY-(first.y+height/2)*camera.k;
    queuePaint();
   }
   function zoom(k,x=viewport.clientWidth/2,y=viewport.clientHeight/2){
    const next=Math.min(maxZoom,Math.max(minZoom,k)),ratio=next/camera.k;
    camera.x=x-(x-camera.x)*ratio;camera.y=y-(y-camera.y)*ratio;camera.k=next;queuePaint();
   }

   function renderGraph(){
    graph=buildGraph();
    const live=new Set(graph.nodes.map(n=>n.id));
    for(const [id,button] of buttons)if(!live.has(id)){button.remove();buttons.delete(id);}
    for(const [i,n] of graph.nodes.entries()){
     let button=buttons.get(n.id);
     if(!button){
      button=el('button','adobo-flow-node');button.type='button';button.dataset.node=n.id;
      button.addEventListener('click',()=>activate(n.id));
      button.addEventListener('focus',()=>ensureInFrame(n.id));
      buttons.set(n.id,button);
     }
     if(world.children[i]!==button)world.insertBefore(button,world.children[i]||null);
     const isGroup=!n.stage&&n.group.stages.length>1;
     const expanded=isGroup?openGroups.has(n.id):selected===n.id;
     button.classList.toggle('is-stage',Boolean(n.stage));
     button.dataset.kind=n.group.id;
     button.style.left=n.x+'px';button.style.top=n.y+'px';
     button.setAttribute('aria-expanded',String(expanded));
     if(!isGroup)button.setAttribute('aria-controls',detail.id);
     else button.removeAttribute('aria-controls');
     const frontier=n.stage&&n.group.stages.indexOf(n.stage)===openGroups.get(n.group.id)-1&&openGroups.get(n.group.id)<n.group.stages.length;
     button.classList.toggle('is-frontier',Boolean(frontier));
     const label=el('span','adobo-flow-node-label',n.title);
     const caption=el('span','adobo-flow-node-caption',n.caption||'');
     const marker=el('span','adobo-flow-node-marker',isGroup?(expanded?'−':'+'):frontier?'+':'↗');
     marker.setAttribute('aria-hidden','true');
     button.replaceChildren(...(n.stage?[caption,label,marker]:[label,caption,marker]));
    }
    queuePaint();
   }
   function ensureInFrame(id){
    const n=graph.nodes.find(node=>node.id===id);if(!n)return;
    const left=camera.x+n.x*camera.k,top=camera.y+n.y*camera.k;
    const w=usefulWidth();
    if(left<12||left+width*camera.k>w-12||top<8||top+height*camera.k>usefulHeight()-8)showRange(n);
   }
   function showDetail(stage,nodeId){
    selected=stage?nodeId:'';
    detail.hidden=!stage;
    cards.replaceChildren();
    if(!stage)return;
    detailTitle.replaceChildren();rich(detailTitle,stage.heading.text);detail.scrollTop=0;
    let target=cards;
    for(const block of stage.blocks){
     if(block.type==='heading_3'){
      target=el('section','adobo-flow-card');
      const label=el('h4');rich(label,block.text);target.append(label);cards.append(target);
     }else target.append(node(block));
    }
   }
   function activate(id){
    const n=graph.nodes.find(item=>item.id===id);if(!n)return;
    const group=n.group;
    if(!n.stage&&group.stages.length>1){
     const opening=!openGroups.delete(id);
     if(opening)openGroups.set(id,1);
     if(!opening&&group.stages.some(stage=>stage.heading.id===selected))showDetail(null);
     renderGraph();
     const root=graph.nodes.find(item=>item.id===id);
     const first=opening?graph.nodes.find(item=>item.group.id===id&&item.stage):null;
     showRange(root,first||root);
     return;
    }
    const opening=selected!==id;
    const count=openGroups.get(group.id);
    const index=group.stages.indexOf(n.stage);
    const extendsRoute=opening&&count&&index===count-1&&count<group.stages.length;
    if(extendsRoute)openGroups.set(group.id,count+1);
    showDetail(opening?n.stage||group.stages[0]:null,id);
    renderGraph();
    const next=extendsRoute?graph.nodes.find(item=>item.stage===group.stages[count]):null;
    showRange(n,next||n);
   }
   const resize=new ResizeObserver(queuePaint);resize.observe(viewport);
   viewport.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button')||pointers.size>=2)return;
    pointers.set(event.pointerId,[event.clientX,event.clientY]);
    viewport.setPointerCapture(event.pointerId);viewport.classList.add('is-panning');
   });
   viewport.addEventListener('pointermove',event=>{
    const previous=pointers.get(event.pointerId);if(!previous)return;
    const next=[event.clientX,event.clientY],dx=next[0]-previous[0],dy=next[1]-previous[1];
    pointers.set(event.pointerId,next);
    if(pointers.size===1){camera.x+=dx;camera.y+=dy;queuePaint();return;}
    const [ax,ay]=[...pointers.entries()].find(([id])=>id!==event.pointerId)[1];
    const oldDistance=Math.hypot(ax-previous[0],ay-previous[1]);
    const newDistance=Math.hypot(ax-next[0],ay-next[1]);
    const rect=viewport.getBoundingClientRect();
    camera.x+=dx/2;camera.y+=dy/2;
    if(oldDistance>0)zoom(camera.k*newDistance/oldDistance,(ax+next[0])/2-rect.left,(ay+next[1])/2-rect.top);
    else queuePaint();
   });
   viewport.addEventListener('lostpointercapture',event=>{
    pointers.delete(event.pointerId);
    if(!pointers.size)viewport.classList.remove('is-panning');
   });
   viewport.addEventListener('wheel',event=>{
    event.preventDefault();
    if(event.ctrlKey||event.metaKey){
     const rect=viewport.getBoundingClientRect();
     zoom(camera.k*Math.exp(-event.deltaY*.012),event.clientX-rect.left,event.clientY-rect.top);
    }else{camera.x-=event.deltaX;camera.y-=event.deltaY;queuePaint();}
   },{passive:false});
   viewport.addEventListener('keydown',event=>{
    if(event.target!==viewport)return;
    const offset={ArrowLeft:[54,0],ArrowRight:[-54,0],ArrowUp:[0,54],ArrowDown:[0,-54]}[event.key];
    if(!offset)return;
    event.preventDefault();camera.x+=offset[0];camera.y+=offset[1];queuePaint();
   });
   zoomIn.addEventListener('click',()=>zoom(camera.k*1.2));
   zoomOut.addEventListener('click',()=>zoom(camera.k/1.2));
   fit.addEventListener('click',()=>fitGraph());
   detailClose.addEventListener('click',()=>{
    const last=selected;showDetail(null);renderGraph();buttons.get(last)?.focus();
   });
   function open(origin){
    if(!groups.length||dialog.open)return;
    opener=origin;dialog.showModal();fitGraph(true);
   }
   trigger.addEventListener('click',()=>open(trigger));
   close.addEventListener('click',()=>dialog.close());
   dialog.addEventListener('close',()=>{(opener?.isConnected?opener:trigger).focus({preventScroll:true});opener=null;});
   return {open,render(doc){
    const stages=[],intro=[];
    for(const block of doc?.blocks||[]){
     if(block.type==='heading_2'){
      const label=plain(block),split=label.indexOf(' · ');
      stages.push({heading:block,blocks:[],code:split<0?'':label.slice(0,split),label:split<0?label:label.slice(split+3)});
     }else (stages.at(-1)?.blocks??intro).push(block);
    }
    const assigned=new Set();
    groups=definitions.map(group=>({...group,stages:stages.filter(stage=>{
     const code=stage.code.match(/^(E\d+)/)?.[1]||stage.code;
     if(!group.codes.includes(code))return false;
     assigned.add(stage);return true;
    })})).filter(group=>group.stages.length);
    const other=stages.filter(stage=>!assigned.has(stage));
    if(other.length)groups.push({id:'other',label:'Otras etapas',stages:other});
    trigger.hidden=!groups.length;
    if(!groups.length){if(dialog.open)dialog.close();return false;}
    preface.replaceChildren(...intro.map(node));
    source.href=safe(doc.url)||'https://www.notion.so/'+flowPageId.replaceAll('-','');
    const activeStage=groups.flatMap(group=>group.stages.map(stage=>({group,stage}))).find(({group,stage})=>
     stage.heading.id===selected||(group.stages.length===1&&group.id===selected));
    showDetail(activeStage?.stage,selected);
    renderGraph();
    return true;
   }};
  }
  function mount(data){
   const anchor=Array.from(host.querySelectorAll('[id]')).find(x=>x.getBoundingClientRect().top>=0);const offset=anchor?.getBoundingClientRect().top;
   const open=new Set(Array.from(host.querySelectorAll('details[open]')).map(x=>x.id));
   const fragment=document.createDocumentFragment(),links=document.createDocumentFragment();
   documentIds.clear();for(const doc of data.snapshot.documents)documentIds.add(doc.id);
   const hero=document.querySelector('.hero');if(hero?.querySelector('h1'))hero.querySelector('h1').textContent=data.title;
   if(hero?.querySelector('p'))hero.querySelector('p').textContent='La guía del equipo comercial, con sus procesos, criterios y recursos.';
   const flowDoc=data.snapshot.documents.find(doc=>doc.id===flowPageId);
   const flowReady=flow?.render(flowDoc);
   const documents=flowReady?data.snapshot.documents.filter(doc=>doc!==flowDoc):data.snapshot.documents;
   for(const [i,doc] of documents.entries()){
    const section=el(i===0?'section':'details','guide-doc'+(i?' guide-related':''));section.id='guide-document-'+doc.id;
    const title=el(i===0?'h2':'summary','',doc.title);section.append(title);const content=el('div');for(const b of doc.blocks)content.append(node(b));section.append(content);fragment.append(section);
    const targets=i===0?[{id:section.id,label:'Inicio'}]:i===1?[{id:section.id,label:'Documentos relacionados'}]:[];
    if(i===0){const level=doc.blocks.some(b=>b.type==='heading_1')?'heading_1':'heading_2';for(const b of doc.blocks){if((b.type==='toggle'||b.type===level)&&plain(b))targets.push({id:'guide-block-'+b.id,label:plain(b)});}}
    for(const target of targets){const a=el('a','',target.label);a.href='#'+target.id;links.append(a);}
   }
   host.replaceChildren(fragment);if(nav)nav.replaceChildren(links);
   for(const x of host.querySelectorAll('details'))if(open.has(x.id))x.open=true;
   const updated=new Date(data.checkedAt||data.publishedAt).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'});
   caption.textContent=data.error?'Mostrando la última versión guardada; no se pudo comprobar Notion.':'Sincronizado con Notion · '+updated;
   if(sidebarDate)sidebarDate.textContent=updated;
   if(anchor&&offset!=null){const next=document.getElementById(anchor.id);if(next)scrollBy(0,next.getBoundingClientRect().top-offset);}
   version=data.version;pending=null;
   const q=document.getElementById('q');if(q?.value)search(q.value);
  }
  async function load(force=false){if(busy)return;busy=true;refresh.disabled=true;
   try{const r=await fetch('/api/guides/content?guide='+guide,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('source unavailable');const data=await r.json();if(data.schema!=='commercial-guide/v1'||data.guide!==guide||!data.snapshot?.documents?.length)throw Error('format');
    if(force||!version){mount(data);}
    else if(data.version!==version){pending=data;caption.textContent='Hay una versión nueva de Notion.';refresh.textContent='Ver cambios';}
    else if(data.error)caption.textContent='Última versión disponible · no se pudo comprobar Notion.';
    return true;
   }catch{caption.textContent=version?'Sin conexión · conservamos la última versión visible.':'No se pudo cargar Notion. Pulsa Actualizar para reintentar.';if(!version)loading.textContent='El contenido estará disponible al recuperar la conexión.';return false;}
   finally{busy=false;refresh.disabled=false;}
  }
  refresh.onclick=()=>{if(pending)mount(pending);else load(true);refresh.textContent='Actualizar';};
  document.addEventListener('click',event=>{const a=event.target.closest('a[href^="#guide-"]');if(!a)return;event.preventDefault();event.stopImmediatePropagation();if(flow&&!document.getElementById('guide-document-'+flowPageId)&&a.hash==='#guide-document-'+flowPageId){flow.open(a);return;}const target=document.getElementById(a.getAttribute('href').slice(1));if(target){let p=target;while(p){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}if(target.tagName==='DETAILS')target.open=true;target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}},true);
  function search(value){const q=value.trim().toLocaleLowerCase();let count=0;for(const doc of host.querySelectorAll('.guide-doc')){const hit=!q||doc.textContent.toLocaleLowerCase().includes(q);doc.hidden=!hit;if(hit)count++;if(q&&hit)doc.querySelectorAll('details').forEach(x=>x.open=x.textContent.toLocaleLowerCase().includes(q));}const cnt=document.getElementById('cnt');if(cnt)cnt.textContent=q?count+' secciones':'';const empty=document.getElementById('empty');if(empty)empty.style.display=q&&!count?'block':'none';}
  document.getElementById('q')?.addEventListener('input',event=>{event.stopImmediatePropagation();search(event.target.value);},true);
  for(const id of ['openAll','closeAll'])document.getElementById(id)?.addEventListener('click',event=>{event.stopImmediatePropagation();host.querySelectorAll('details').forEach(x=>x.open=id==='openAll');},true);
  window.aderesoContentReady=load();setInterval(()=>{if(!document.hidden)load();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
