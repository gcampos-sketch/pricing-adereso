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
   trigger.setAttribute('aria-haspopup','dialog');
   trigger.setAttribute('aria-controls','adobo-flow');
   const heroIntro=document.querySelector('.hero p');
   (heroIntro||status).after(trigger);

   const dialog=el('dialog','adobo-flow');dialog.id='adobo-flow';
   dialog.setAttribute('aria-labelledby','adobo-flow-title');
   const header=el('header','adobo-flow-header');
   const title=el('h2','','Flujo comercial');title.id='adobo-flow-title';
   const close=el('button','adobo-flow-close','×');
   close.type='button';close.setAttribute('aria-label','Cerrar flujo');close.autofocus=true;
   const actions=el('div','adobo-flow-actions');
   const back=el('button','adobo-flow-back','Volver al mapa');
   back.type='button';back.hidden=true;
   actions.append(back,close);header.append(title,actions);

   const overview=el('div','adobo-flow-overview');
   const hint=el('p','adobo-flow-hint','Abre un nodo para ver qué ocurre y quién interviene.');
   const route=el('ol','adobo-flow-route');route.setAttribute('aria-label','Recorrido principal');
   const branches=el('ul','adobo-flow-branches');branches.setAttribute('aria-label','Entradas, salidas y controles');
   overview.append(hint,route,branches);

   const panel=el('section','adobo-flow-panel');panel.id='adobo-flow-panel';panel.hidden=true;
   const panelTitle=el('h3','adobo-flow-panel-title');panelTitle.id='adobo-flow-panel-title';
   panel.setAttribute('aria-labelledby',panelTitle.id);
   const steps=el('nav','adobo-flow-steps');steps.setAttribute('aria-label','Etapas de este tramo');
   const body=el('section','adobo-flow-body');body.id='adobo-flow-detail';body.hidden=true;
   const stageTitle=el('h4','adobo-flow-stage');stageTitle.id='adobo-flow-stage';
   body.setAttribute('aria-labelledby',stageTitle.id);
   const cards=el('div','adobo-flow-cards');
   body.append(stageTitle,cards);panel.append(panelTitle,steps,body);

   const info=el('details','adobo-flow-info');
   info.append(el('summary','','Alcance y fuente'));
   const intro=el('div','adobo-flow-intro');
   const source=el('a','','Ver fuente en Notion');source.target='_blank';source.rel='noopener noreferrer';
   info.append(intro,source);
   dialog.append(header,overview,panel,info);
   document.body.append(dialog);

   const definitions=[
    {id:'sdr',label:'Captación',detail:'SDR · Prospección y calificación',codes:['SDR'],main:true},
    {id:'sale',label:'Venta',detail:'E1–E5.1 · Reunión a negociación',codes:['E1','E2','E3','E4','E5'],main:true},
    {id:'delivery',label:'Firma y servicio',detail:'E6–E8 · Cierre a servicio iniciado',codes:['E6','E7','E8'],main:true},
    {id:'expansion',label:'Expansión',detail:'E0 · Entrada a venta desde cartera',codes:['E0']},
    {id:'loss',label:'Pérdidas y churn',detail:'Salidas de venta y servicio',codes:['Salidas']},
    {id:'health',label:'Saneación y control',detail:'Apoyo a todo el pipeline',codes:['Todo el pipeline']},
   ];
   let groups=[],groupId='',stageId='',opener=null;
   function reveal(heading){
    const {top,bottom}=heading.getBoundingClientRect();
    const frame=dialog.getBoundingClientRect();
    const headerBottom=header.getBoundingClientRect().bottom;
    if(top<headerBottom||bottom>frame.bottom-24)heading.scrollIntoView({block:'start',behavior:'instant'});
   }
   function selectStage(stage){
    stageId=stage?.heading.id||'';
    body.hidden=!stage;
    cards.replaceChildren();
    for(const button of steps.querySelectorAll('button'))button.setAttribute('aria-expanded',String(button.dataset.stage===stageId));
    if(!stage)return;
    stageTitle.replaceChildren();rich(stageTitle,stage.heading.text);
    let target=cards;
    for(const block of stage.blocks){
     if(block.type==='heading_3'){
      target=el('section','adobo-flow-card');
      const label=el('h5');rich(label,block.text);target.append(label);cards.append(target);
     }else target.append(node(block));
    }
   }
   function selectGroup(group,rememberedStage=''){
    groupId=group?.id||'';
    panel.hidden=!group;back.hidden=!group;
    for(const button of overview.querySelectorAll('button'))button.setAttribute('aria-expanded',String(button.dataset.group===groupId));
    steps.replaceChildren();
    if(!group){selectStage(null);return;}
    const single=group.stages.length===1;
    panelTitle.textContent=group.label;
    panelTitle.hidden=single;
    steps.hidden=single;
    if(!single){
     for(const stage of group.stages){
      const button=el('button','adobo-flow-step');
      button.type='button';button.dataset.stage=stage.heading.id;button.setAttribute('aria-controls',body.id);
      if(stage.code)button.append(el('span','adobo-flow-code',stage.code));
      button.append(el('span','adobo-flow-label',stage.label));
      button.addEventListener('click',()=>{
       const expand=stageId!==stage.heading.id;
       selectStage(expand?stage:null);
       if(expand)reveal(stageTitle);
      });
      steps.append(button);
     }
    }
    selectStage(single?group.stages[0]:group.stages.find(stage=>stage.heading.id===rememberedStage));
   }
   function open(origin){
    if(!groups.length||dialog.open)return;
    opener=origin;dialog.showModal();
   }
   trigger.addEventListener('click',()=>open(trigger));
   close.addEventListener('click',()=>dialog.close());
   back.addEventListener('click',()=>{
    dialog.scrollTop=0;
    overview.querySelector('button[aria-expanded="true"]')?.focus({preventScroll:true});
   });
   dialog.addEventListener('close',()=>{(opener?.isConnected?opener:trigger).focus({preventScroll:true});opener=null;});
   return {open,render(doc){
    const stages=[],preface=[];
    for(const block of doc?.blocks||[]){
     if(block.type==='heading_2'){
      const heading=plain(block);
      const split=heading.indexOf(' · ');
      stages.push({heading:block,blocks:[],code:split<0?'':heading.slice(0,split),label:split<0?heading:heading.slice(split+3)});
     }else (stages.at(-1)?.blocks??preface).push(block);
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
    intro.replaceChildren(...preface.map(node));
    source.href=safe(doc.url)||'https://www.notion.so/'+flowPageId.replaceAll('-','');

    const {group:focusedGroup,stage:focusedStage}=document.activeElement.dataset;
    route.replaceChildren();branches.replaceChildren();
    for(const group of groups){
     const item=el('li','adobo-flow-item');
     const button=el('button','adobo-flow-node');
     button.type='button';button.dataset.group=group.id;button.setAttribute('aria-controls',panel.id);
     button.append(el('span','adobo-flow-node-label',group.label));
     if(group.detail)button.append(el('span','adobo-flow-node-detail',group.detail));
     const chevron=el('span','adobo-flow-chevron');chevron.setAttribute('aria-hidden','true');button.append(chevron);
     button.addEventListener('click',()=>{
      const expand=groupId!==group.id;
      selectGroup(expand?group:null);
      if(expand)reveal(panelTitle.hidden?stageTitle:panelTitle);
     });
     item.append(button);(group.main?route:branches).append(item);
    }
    selectGroup(groups.find(group=>group.id===groupId),stageId);
    const restored=[...dialog.querySelectorAll('button[data-stage],button[data-group]')].find(button=>
     (focusedGroup&&button.dataset.group===focusedGroup)||(focusedStage&&button.dataset.stage===focusedStage));
    if(restored)restored.focus({preventScroll:true});
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
