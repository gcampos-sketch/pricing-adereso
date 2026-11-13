import { EDITION, ROLES, MISSIONS, CONSEQUENCES, skillResult, dueReviews, nextReview } from './academy-curriculum.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let progress = { role:'AE', mode:'onboarding', attempts:{}, reviews:{}, tasks:{}, legacy:{}, resume:null };
let revision = 0, ready = false, saving = false, dirty = false, blocked = false, active = null, conflict = false;
let lastStatus={text:'Comprobando tu avance…',error:false};
let originTab = 'home';
const role = () => ROLES[progress.role] || ROLES.AE;
const wikiChanged = () => (window.academySourceDates || []).some(d => d.id === '3219c274-7df5-81a2-baeb-de4de645d487' && Date.parse(d.editedAt) > Date.parse('2026-11-13T13:20:34.925Z'));
const record = id => progress.attempts[id]?.edition === EDITION ? progress.attempts[id] : null;
const passed = id => Boolean(record(id)?.passed);
const mission = id => MISSIONS.find(m => m.id === id);
const pending = () => role().missions.find(id => !passed(id)) || role().missions[0];
const tasks = ['Observé una reunión y anoté preguntas para revisar.', 'Preparé un caso y pedí feedback a mi referente.', 'Practiqué el recorrido completo y registré mis pendientes.'];
const saveNote = (text, error=false) => {lastStatus={text,error};document.body.classList.toggle('academy-save-error',error);document.querySelectorAll('[data-academy-save]').forEach(el=>{el.textContent=text;el.classList.toggle('error',error);});const banner=$('academy-save-banner');if(banner){banner.hidden=!error;banner.textContent=text;}};
const clone = value => JSON.parse(JSON.stringify(value));

async function load() {
  try {
    const response = await fetch('/api/academy/progress',{credentials:'same-origin',cache:'no-store'});
    if (!response.ok) throw Error('unavailable');
    const data = await response.json();
    revision = data.revision;
    progress = {...progress,...data.payload};
    state = {...state,...(progress.legacy || {})};
    ready = true; blocked = false; conflict = false;document.body.classList.remove('academy-pending');
    renderHome(); updateHeader(); renderProductAcademies(); renderAchievements(); render();
    saveNote(data.storage === 'development' ? 'Avance personal guardado en esta vista local.' : 'Avance personal sincronizado.');
  } catch {
    ready = false; blocked = true;document.body.classList.add('academy-pending');
    render(); saveNote('No pudimos cargar tu avance. Reintenta para practicar sin perderlo.',true);
  }
}
async function persist() {
  if(!ready || blocked) return;
  dirty = true;
  if(saving) return;
  saving = true;
  try {
    while(dirty) {
      dirty = false;
      const payload = clone(progress);
      saveNote('Guardando avance…');
      const response = await fetch('/api/academy/progress',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,payload})});
      if(!response.ok) {
        blocked = true; dirty = true; conflict = response.status===409;
        saveNote(response.status===409 ? 'Hay avance más reciente en otra pestaña. Tu práctica sigue aquí; recarga el avance antes de continuar.' : 'Guardado pendiente. Conserva esta pestaña y pulsa Reintentar guardado.',true);
        return;
      }
      revision = (await response.json()).revision;
      saveNote('Avance guardado.');
    }
  } catch { dirty = true; blocked = true; saveNote('Guardado pendiente. Conserva esta pestaña y pulsa Reintentar guardado.',true); }
  finally { saving = false; }
}

// Preserve the original learning actions, but store them under the verified account.
save = function() { if(!ready) return; progress.legacy = clone(state); void persist(); };
startSRS = () => startReview();
const originalHeader=updateHeader;
updateHeader=function(){originalHeader();const count=dueReviews(progress.reviews).length;$('srs-card').style.display=count?'block':'none';$('srs-text').textContent=count+' decisiones listas para repasar';};
for(const name of ['startQuiz','startFlashcards','startLessonChallenge','completeCurrentLesson','openProductAcademy','startMatchGame','startTFGame','startOrderGame','startMemoryGame']){
  const original=window[name];
  window[name]=function(...args){if(!ready){saveNote('Carga tu avance desde Onboarding para guardar esta práctica. La biblioteca sigue disponible.',true);return;}return original(...args);};
}
const oldSwitch = switchTab;
switchTab = function(tab) {
  $('academy-mission-view').classList.remove('active');
  $('academy-mission-view').style.display='none';
  oldSwitch(tab);
  active=null;
  if(tab==='home') render();
  if(tab==='progress') renderSkills();
  accessible();
};
resetProgress = function() {
  if(!ready || !confirm('¿Reiniciar tu avance personal de Academy? Esta acción borra tus prácticas y apuntes guardados.')) return;
  progress = {role:progress.role,mode:progress.mode,attempts:{},reviews:{},tasks:{},legacy:{},resume:null};
  state = {completedLessons:[],xp:0,streak:0,quizzesDone:0,totalCorrect:0,totalAnswered:0,lastDate:'',level:'bronce',examsPassed:[],productsMastered:[]};
  progress.legacy=clone(state); void persist(); renderHome();updateHeader();renderProductAcademies();renderAchievements();render();renderSkills();
};

function accessible() {
  document.querySelectorAll('.lesson-card[onclick],.game-card[onclick],.back-btn,.eco-case-head,.build-item,.notes-toggle,.flashcard,.order-chip:not(.used),.order-slot.filled,.match-item,.memory-card').forEach(el=>{
    if(el.tagName==='BUTTON') return;
    el.setAttribute('role','button');el.tabIndex=0;
    if(el.classList.contains('back-btn'))el.setAttribute('aria-label','Volver');
  });
}
document.addEventListener('keydown',event=>{
  const target=event.target.closest('[role=button]');
  if(target && (event.key==='Enter'||event.key===' ')) {event.preventDefault();target.click();}
});
const observer=new MutationObserver(()=>accessible());observer.observe($('app'),{childList:true,subtree:true});

// Only presentation state lives here. Opening/pinning never changes learning state.
function installAcademyNavigation(icons) {
  const nav=document.querySelector('.nav');
  const zone=document.createElement('div');zone.className='academy-nav-zone';
  const edge=document.createElement('div');edge.className='academy-nav-edge';
  const opener=document.createElement('button');opener.type='button';opener.innerHTML=icons.open;
  opener.setAttribute('aria-label','Mostrar menú de Academy');opener.title='Mostrar menú de Academy';
  opener.setAttribute('aria-controls','academy-section-navigation');edge.append(opener);
  nav.id='academy-section-navigation';nav.setAttribute('role','navigation');nav.setAttribute('aria-label','Secciones de Sales Academy');
  const header=document.createElement('div');header.className='academy-nav-header';
  header.innerHTML='<div><span>Sales Academy</span><strong>Tu aprendizaje</strong></div>';
  const pin=document.createElement('button');pin.type='button';pin.className='academy-nav-pin';header.append(pin);nav.prepend(header);
  const description=document.createElement('p');description.className='academy-nav-hint';description.textContent='Tu recorrido y tus prácticas, siempre a mano.';nav.append(description);
  nav.before(zone);zone.append(edge,nav);
  const tabs=['home','games','products','progress'];
  const buttons=[...nav.querySelectorAll('.nav-item')];
  buttons.forEach((button,i)=>{
    const icon=button.querySelector('.nav-icon');
    const emoji=document.createElement('span');emoji.className='academy-nav-mobile-icon';emoji.textContent=icon.textContent;
    const vector=document.createElement('span');vector.className='academy-nav-desktop-icon';vector.innerHTML=icons[tabs[i]];
    icon.replaceChildren(emoji,vector);
  });
  const desktop=window.matchMedia('(min-width:768px)');
  const preference='adereso_academy_navigation_pinned_v1';
  let pinned=false,peek=false,timer,suppressFocus=false;
  try{pinned=localStorage.getItem(preference)==='true';}catch{/* The menu works without preference storage. */}
  const cancel=()=>clearTimeout(timer);
  function apply(){
    const expanded=desktop.matches&&(pinned||peek);
    zone.dataset.open=String(expanded);zone.dataset.pinned=String(desktop.matches&&pinned);
    document.body.classList.toggle('academy-nav-pinned',desktop.matches&&pinned);
    nav.inert=desktop.matches&&!expanded;
    opener.setAttribute('aria-expanded',String(expanded));
    pin.setAttribute('aria-label',pinned?'Ocultar menú de Academy':'Fijar menú de Academy');
    pin.title=pinned?'Ocultar menú':'Dejar el menú abierto';pin.setAttribute('aria-pressed',String(pinned));
    if(pin.dataset.pinned!==String(pinned)){pin.innerHTML=pinned?icons.close:icons.open;pin.dataset.pinned=String(pinned);}
  }
  function focusEdge(){suppressFocus=true;opener.focus({preventScroll:true});queueMicrotask(()=>{suppressFocus=false;});}
  function close(){cancel();if(pinned||!desktop.matches)return;peek=false;apply();}
  function show(){cancel();if(!desktop.matches||pinned||suppressFocus||peek)return;peek=true;apply();}
  zone.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')show();});
  zone.addEventListener('pointerleave',()=>{
    cancel();timer=setTimeout(()=>{if(!nav.contains(document.activeElement))close();},180);
  });
  zone.addEventListener('focusin',show);
  zone.addEventListener('focusout',event=>{if(!zone.contains(event.relatedTarget)){cancel();close();}});
  function togglePin(){
    cancel();pinned=!pinned;peek=false;
    try{localStorage.setItem(preference,String(pinned));}catch{/* Cosmetic preference only. */}
    apply();if(pinned)pin.focus({preventScroll:true});else focusEdge();
  }
  opener.addEventListener('click',togglePin);pin.addEventListener('click',togglePin);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&desktop.matches&&peek&&!pinned){event.preventDefault();event.stopPropagation();close();focusEdge();}
  });
  nav.addEventListener('click',event=>{if(event.target.closest('.nav-item')&&desktop.matches&&!pinned){close();focusEdge();}});
  function current(){buttons.forEach(button=>{if(button.classList.contains('active'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});}
  new MutationObserver(current).observe(nav,{attributes:true,subtree:true,attributeFilter:['class']});
  desktop.addEventListener('change',()=>{
    cancel();peek=false;const hadFocus=nav.contains(document.activeElement);apply();
    if(desktop.matches&&!pinned&&hadFocus)focusEdge();
    if(!desktop.matches&&document.activeElement===opener)buttons.find(button=>button.classList.contains('active'))?.focus({preventScroll:true});
  });
  current();apply();
}

function render() {
  const current = progress.resume && mission(progress.resume.id) ? progress.resume.id : pending();
  const next = mission(current);
  const completed = role().missions.filter(passed).length;
  const due = dueReviews(progress.reviews);
  $('academy-dashboard').innerHTML = `
    <div class="academy-controls">
      <label>Tu recorrido<select id="academy-role" ${!ready?'disabled':''}>${Object.entries(ROLES).map(([id,r])=>`<option value="${id}" ${id===progress.role?'selected':''}>${r.name}</option>`).join('')}</select></label>
      <div class="academy-mode" role="group" aria-label="Modo de aprendizaje">${[['onboarding','Estoy empezando'],['practice','Quiero practicar']].map(([id,label])=>`<button class="academy-btn" data-mode="${id}" aria-pressed="${progress.mode===id}" ${!ready?'disabled':''}>${label}</button>`).join('')}</div>
    </div>
    <section class="academy-hero">
      <div class="academy-kicker">${progress.mode==='onboarding'?'Tu ruta de onboarding':'Tu entrenamiento de hoy'} · ${escape(progress.role)}</div>
      <h2>${progress.resume?'Retoma tu misión':completed===role().missions.length?'Sigue afinando tu criterio':'Tu próxima misión'}<br>${escape(next.title)}</h2>
      <p>${escape(next.story)}<br>${next.minutes} minutos · 3 decisiones · feedback en cada paso</p>
      <div class="academy-actions"><button class="academy-btn primary" data-start="${current}" ${!ready?'disabled':''}>${progress.resume?'Continuar misión':'Comenzar desafío'} →</button><button class="academy-btn" data-review ${!ready?'disabled':''}>${due.length?'Repasar '+due.length+' decisiones':'Practicar un caso distinto'}</button></div>
      <p class="academy-muted">${completed}/${role().missions.length} misiones aprobadas · ${escape(role().goal)}</p>
      <div class="academy-sync-note" data-academy-save role="status"></div>
      <p class="academy-muted academy-edition">${wikiChanged()?'La wiki tiene cambios posteriores a esta edición. Consulta las novedades; las prácticas requieren revisión editorial.':'Prácticas edición '+EDITION+' · biblioteca siempre disponible para contrastar novedades.'}</p>
      <div class="academy-actions academy-recovery"><button class="academy-btn" id="academy-retry">${!ready?'Reintentar carga':'Reintentar guardado'}</button><button class="academy-btn" id="academy-reload">Cargar avance guardado</button></div>
      ${hasLegacy()?'<button class="academy-btn" id="academy-import">Recuperar mi avance anterior de este navegador</button>':''}
    </section>
    <section class="academy-main-missions"><div class="academy-section-head"><h3>${progress.mode==='onboarding'?'Aprende resolviendo':'Elige tu desafío'}</h3><span class="academy-muted">Sin límite de intentos</span></div>
      <div class="academy-mission-grid">${(progress.mode==='onboarding'?role().missions.map(mission):MISSIONS).map((m,i)=>`<button class="mission-card" data-start="${m.id}" ${!ready?'disabled':''}><div class="academy-muted"><span>${String(i+1).padStart(2,'0')} · ${escape(m.skill)}</span><span>${m.minutes} min</span></div><h4>${escape(m.title)}</h4><p>Un caso, tres decisiones y un próximo paso.</p><div class="academy-actions"><span class="academy-pill ${passed(m.id)?'done':''}">${passed(m.id)?'Práctica aprobada':record(m.id)?'Por reforzar':'Por descubrir'}</span><span class="academy-muted">${progress.resume?.id===m.id?'Retomar →':'Resolver →'}</span></div></button>`).join('')}</div>
    </section>
    <aside class="academy-sidebar"><section class="academy-panel"><div class="academy-kicker">${progress.mode==='onboarding'?'De conocer a practicar':'Tu siguiente mejora'}</div><h3>${progress.mode==='onboarding'?'Tu recorrido, paso a paso':'Entrena con intención'}</h3><ol class="academy-path"><li>Comprende el cliente y el alcance.</li><li>Resuelve los casos de tu rol.</li><li>Practica con tu referente y revisa dudas.</li></ol><p class="academy-muted">El ritmo es flexible. Aprobar un ejercicio no certifica preparación para trabajar sin acompañamiento.</p>
    ${progress.mode==='onboarding'?tasks.map((t,i)=>`<label class="academy-check"><input type="checkbox" data-task="${progress.role}-${i}" ${progress.tasks[progress.role+'-'+i]?'checked':''} ${!ready?'disabled':''}>${t}</label>`).join(''): `<p class="academy-muted" style="margin-top:16px">${due.length?due.length+' decisiones listas para repasar.':'Aún no tienes repasos vencidos. Los errores volverán mañana; los aciertos se espacian.'}</p>`}
    <div class="academy-actions"><button class="academy-btn" data-library>Consultar la biblioteca ↗</button></div></section></aside>`;
  $('academy-role').addEventListener('change',event=>{progress.role=event.target.value;void persist();render();});
  $('academy-dashboard').querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{progress.mode=button.dataset.mode;void persist();render();});
  $('academy-retry').onclick=()=>{if(!ready)void load();else if(conflict)saveNote('Carga el avance guardado para conciliar la otra pestaña. Tu práctica pendiente sigue visible aquí.',true);else{blocked=false;void persist();}};
  $('academy-reload').onclick=()=>{if(dirty&&!confirm('Hay cambios pendientes en esta pestaña. ¿Descartarlos y cargar el avance guardado?'))return;dirty=false;void load();};
  if($('academy-import'))$('academy-import').onclick=()=>{
    if(!confirm('¿Confirmas que el avance anterior de este navegador es tuyo? Lo copiaremos a tu cuenta sin borrar el original.'))return;
    try{const previous=JSON.parse(localStorage.getItem('adereso_academy'));if(!previous||JSON.stringify(previous).length>70000)throw Error();state={...state,...previous};progress.legacy=clone(state);progress.legacyImported=true;void persist();renderHome();updateHeader();renderProductAcademies();renderAchievements();render();}
    catch{saveNote('No se pudo recuperar el avance anterior. El original sigue en este navegador.',true);}
  };
  $('academy-dashboard').querySelectorAll('[data-task]').forEach(input=>input.onchange=()=>{progress.tasks[input.dataset.task]=input.checked;void persist();});
  saveNote(lastStatus.text,lastStatus.error);
  accessible();
}
function hasLegacy(){try{return ready&&!progress.legacyImported&&!progress.legacy?.completedLessons?.length&&Boolean(localStorage.getItem('adereso_academy'));}catch{return false;}}
function openMission(id, reviewQuestions) {
  if(!ready || !mission(id)) return;
  originTab=$('tab-games').style.display!=='none'?'games':'home';
  const saved=!reviewQuestions&&progress.resume?.id===id&&progress.resume.edition===EDITION?progress.resume:null;
  active={id,review:Boolean(reviewQuestions),questions:reviewQuestions||mission(id).questions,answers:saved?.answers||[],index:saved?.index||0};
  if(!reviewQuestions&&!saved){progress.resume={id,edition:EDITION,index:0,answers:[]};void persist();}
  document.querySelectorAll('.tab-content,.lesson-view,.quiz-view').forEach(el=>el.style.display='none');
  $('academy-mission-view').style.display='block';$('academy-mission-view').classList.add('active');
  showStep();
}
function showStep() {
  const m=mission(active.id),q=active.questions[active.index];
  if(!q) {showResult();return;}
  const answer=active.answers[active.index],answered=Number.isInteger(answer);
  $('academy-mission-view').innerHTML=`<div class="lesson-header"><button class="back-btn" data-exit aria-label="Volver a desafíos">←</button><h2>${escape(active.review?'Repaso de decisiones':m.title)}</h2></div>
    <div class="mission-layout"><aside class="academy-panel mission-story"><div class="academy-kicker">${escape(m.skill)} · ${m.minutes} min</div><h3>El contexto</h3><p>${escape(m.story)}</p><p class="academy-muted" style="margin-top:20px">Puedes salir y retomar una misión. Cada decisión se guarda después de tu respuesta.</p><div class="academy-actions"><button class="academy-btn" data-source>Consultar referencias ↗</button></div></aside>
    <section class="mission-stage"><div class="mission-progress">${active.review?'Repaso':'Decisión'} ${active.index+1}/${active.questions.length}</div><h3 tabindex="-1" id="mission-prompt">${escape(q.prompt)}</h3>
    ${q.options.map((option,i)=>`<button class="mission-option ${answered&&i===q.correct?'correct':answered&&i===answer?'wrong':''}" data-answer="${i}" ${answered?'disabled':''}>${answered&&i===q.correct?'✓ ':answered&&i===answer?'Por revisar · ':String.fromCharCode(65+i)+' · '}${escape(option)}</button>`).join('')}
    ${answered?`<div class="mission-consequence"><span class="academy-kicker">En esta simulación</span><p>${escape(CONSEQUENCES[q.id]?.[answer===q.correct?0:1] || 'Revisa cómo esta decisión afecta el siguiente paso.')}</p></div><div class="mission-feedback" role="status"><strong>${answer===q.correct?'Buena decisión.':q.critical?'Hay un punto importante por reforzar.':'Veamos qué cambia.'}</strong><p>${escape(q.explanation)}</p>${q.critical&&answer!==q.correct?'<p>Esta decisión debe corregirse para aprobar la práctica.</p>':''}</div><div class="academy-actions"><button class="academy-btn primary" data-next>${active.index===active.questions.length-1?'Ver mi resultado':'Continuar'} →</button></div>`:''}
    <div class="academy-sync-note" data-academy-save role="status"></div></section></div>`;
  $('academy-mission-view').querySelector('[data-exit]').onclick=exit;
  $('academy-mission-view').querySelector('[data-source]').onclick=library;
  $('academy-mission-view').querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{
    if(Number.isInteger(active.answers[active.index]))return;
    const choice=Number(button.dataset.answer);active.answers[active.index]=choice;
    const key=active.id+':'+q.id;
    progress.reviews[key]=nextReview(progress.reviews[key],choice===q.correct);
    if(!active.review)progress.resume={id:active.id,edition:EDITION,index:active.index,answers:[...active.answers]};
    void persist();showStep();
  });
  const next=$('academy-mission-view').querySelector('[data-next]');
  if(next)next.onclick=()=>{active.index++;if(!active.review){progress.resume={id:active.id,edition:EDITION,index:active.index,answers:[...active.answers]};void persist();}showStep();};
  $('mission-prompt').focus({preventScroll:true});window.scrollTo(0,0);
}
function showResult() {
  const m=mission(active.id);
  const result=active.review?{correct:active.questions.filter((q,i)=>active.answers[i]===q.correct).length,total:active.questions.length,passed:true,criticalMiss:false}:skillResult(m,active.answers);
  if(!active.review) {
    const previous=record(active.id);
    if(result.passed&&!previous?.passed)state.xp+=60;
    const today=new Date().toDateString();if(state.lastDate!==today){state.streak++;state.lastDate=today;}
    progress.legacy=clone(state);updateHeader();
    progress.attempts[active.id]={edition:EDITION,passed:result.passed||Boolean(previous?.passed),lastPassed:result.passed,correct:result.correct,total:result.total,at:new Date().toISOString()};
    progress.resume=null;
    void persist();
  }
  const misses=active.questions.filter((q,i)=>active.answers[i]!==q.correct);
  $('academy-mission-view').innerHTML=`<div class="mission-stage"><div class="academy-kicker">${active.review?'Repaso completado':result.passed?'Práctica aprobada':'Una nueva oportunidad para mejorar'}</div><h2>${result.correct}/${result.total} decisiones acertadas</h2><p style="margin:16px 0">${result.criticalMiss?'Hay una decisión crítica por reforzar. Revísala y vuelve a intentar.':misses.length?'Ya tienes feedback concreto para el siguiente intento.':'Resolviste el caso. Ahora prueba aplicar el criterio en una conversación de práctica.'}</p>
    ${misses.length?`<ul class="mission-review-list">${misses.map(q=>`<li>${escape(q.explanation)}</li>`).join('')}</ul>`:'<p class="academy-muted">El siguiente paso es practicar con tu referente. Este resultado no es una certificación comercial.</p>'}
    <p class="academy-muted" style="margin-top:16px">Tus decisiones volverán en repasos espaciados. Edición ${EDITION}.</p><div class="academy-actions"><button class="academy-btn primary" data-exit>Volver a mi ruta →</button><button class="academy-btn" data-retry>Practicar de nuevo</button><button class="academy-btn" data-lesson>Consultar la lección</button></div><div class="academy-sync-note" data-academy-save role="status"></div></div>`;
  const reflection=document.createElement('label');reflection.className='academy-reflection';reflection.textContent='Llévalo a la práctica: ¿qué preguntarías o harías en tu próxima reunión?';
  const note=document.createElement('textarea');note.maxLength=1000;note.rows=3;note.placeholder='Escribe tu próximo paso (opcional)…';note.value=progress.reflections?.[m.id]||'';
  note.oninput=()=>{progress.reflections||={};progress.reflections[m.id]=note.value;void persist();};reflection.append(note);$('academy-mission-view').querySelector('.mission-stage').append(reflection);
  $('academy-mission-view').querySelector('[data-exit]').onclick=exit;
  $('academy-mission-view').querySelector('[data-retry]').onclick=()=>openMission(active.id);
  $('academy-mission-view').querySelector('[data-lesson]').onclick=()=>{exit();openLesson(m.lesson);};
  window.scrollTo(0,0);
}
function exit() {$('academy-mission-view').classList.remove('active');$('academy-mission-view').style.display='none';switchTab(originTab);active=null;}
function library() {if(active)exit();switchTab('products');$('academy-sources').open=true;$('academy-source-search').focus();}
function startReview() {
  const keys=dueReviews(progress.reviews),groups=new Map();
  for(const key of keys){const [id,qid]=key.split(':');const m=mission(id),q=m?.questions.find(q=>q.id===qid);if(q){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(q);}}
  if(groups.size){const [id,questions]=groups.entries().next().value;openMission(id,questions);}
  else {const current=pending();const alternative=MISSIONS.find(m=>m.id!==current&&!passed(m.id))||MISSIONS.find(m=>m.id!==current);openMission(alternative.id);}
}
function renderSkills() {
  const node=$('academy-skills');node.innerHTML=`<div class="section-title">Tus habilidades en práctica</div><p class="academy-muted" style="margin-bottom:16px">Resultados de desafíos · una práctica aprobada no equivale a certificación.</p><div class="academy-evidence-grid">${MISSIONS.map(m=>{const r=record(m.id);return `<div class="academy-evidence"><h3>${escape(m.skill)}</h3><p class="academy-muted">${!r?'Aún sin práctica':r.lastPassed?'Último caso aprobado':r.passed?'Aprobada antes · último intento por reforzar':'Por reforzar'}${r?' · '+r.correct+'/'+r.total:''}</p><div class="academy-actions"><button class="academy-btn" data-start="${m.id}">Practicar →</button></div></div>`;}).join('')}</div>`;
}
document.addEventListener('click',event=>{
  const start=event.target.closest('[data-start]');if(start)openMission(start.dataset.start);
  if(event.target.closest('[data-review]'))startReview();
  if(event.target.closest('[data-library]'))library();
});
document.addEventListener('academy:sources-checked',()=>{if($('academy-dashboard'))render();});
const view=document.createElement('div');view.id='academy-mission-view';view.className='main mission-view';$('app').insertBefore(view,document.querySelector('.nav'));
const banner=document.createElement('p');banner.id='academy-save-banner';banner.setAttribute('role','status');banner.hidden=true;document.querySelector('.header').append(banner);
const dashboard=document.createElement('div');dashboard.id='academy-dashboard';dashboard.className='academy-home';$('tab-home').prepend(dashboard);
const skills=document.createElement('div');skills.id='academy-skills';$('tab-progress').prepend(skills);
const practice=document.createElement('section');practice.className='academy-panel';practice.innerHTML='<div class="academy-kicker">Entrena tu criterio</div><h2>Un caso antes del próximo cliente</h2><p class="academy-muted">Resuelve una situación comercial o repasa decisiones de prácticas anteriores.</p><div class="academy-actions"><button class="academy-btn primary" data-start="objection">Resolver una objeción →</button><button class="academy-btn" data-review>Repasar decisiones</button></div>';$('tab-games').prepend(practice);
// Lucide icons rendered from the project's existing lucide-react package.
installAcademyNavigation({"home": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-house\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"></path><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"></path></svg>", "games": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-dumbbell\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\"></path><path d=\"m2.5 21.5 1.4-1.4\"></path><path d=\"m20.1 3.9 1.4-1.4\"></path><path d=\"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z\"></path><path d=\"m9.6 14.4 4.8-4.8\"></path></svg>", "products": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-graduation-cap\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\"></path><path d=\"M22 10v6\"></path><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\"></path></svg>", "progress": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chart-no-axes-combined\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 16v5\"></path><path d=\"M16 14v7\"></path><path d=\"M20 10v11\"></path><path d=\"m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15\"></path><path d=\"M4 18v3\"></path><path d=\"M8 14v7\"></path></svg>", "open": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-panel-left-open\" aria-hidden=\"true\" focusable=\"false\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"></rect><path d=\"M9 3v18\"></path><path d=\"m14 9 3 3-3 3\"></path></svg>", "close": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-panel-left-close\" aria-hidden=\"true\" focusable=\"false\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"></rect><path d=\"M9 3v18\"></path><path d=\"m16 15-3-3 3-3\"></path></svg>"});
document.body.classList.add('academy-pending');
render();void load();
