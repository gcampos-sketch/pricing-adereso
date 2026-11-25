import { LEGACY_MISSION_REVISION, ROLES, MISSIONS, DEMO_MISSIONS, ADVISORY_MISSIONS, HYPOTHESIS_MISSION, CONSEQUENCES, skillResult,
  dueReviews, nextReview, missionRevision, currentMissionEntry, currentMissionReview, AE_ONBOARDING_WEEKS, AE_ONBOARDING_EVIDENCE, AE_ROLEPLAY_STAGES } from './academy-curriculum.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let progress = { role:'AE', mode:'onboarding', attempts:{}, reviews:{}, tasks:{}, legacy:{}, resume:null };
let revision = 0, ready = false, saving = false, dirty = false, blocked = false, active = null, conflict = false;
let lastStatus={text:'Comprobando tu avance…',error:false};
let originTab = 'home';
let lessonOrigin = 'products';
let aeEvidenceDraft = {};
let roleplaySaveTimer;
let peoplePlan;
let onboardingWeeks = [];
let onboardingSlots = [];
let selectedWeek;
let selectedSlot;
const role = () => ROLES[progress.role] || ROLES.AE;
const wikiChanged = () => (window.academySourceDates || []).some(d => d.id === '3219c274-7df5-81a2-baeb-de4de645d487' && Date.parse(d.editedAt) > Date.parse('2026-11-13T13:20:34.925Z'));
const mission = id => MISSIONS.find(m => m.id === id);
const record = id => currentMissionEntry(mission(id),progress.attempts[id]);
const resume = () => currentMissionEntry(mission(progress.resume?.id),progress.resume);
const passed = id => Boolean(record(id)?.passed);
const reviewKeys = () => dueReviews(progress.reviews).filter(key=>{
  const [id,qid]=key.split(':');
  const m=mission(id);
  return m?.questions.some(q=>q.id===qid)&&currentMissionReview(m,progress.reviews[key]);
});
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
    peoplePlan = data.peoplePlan;
    loadOnboardingCalendar();
    progress.aeOnboardingEvidence = data.payload.aeOnboardingEvidence;
    clearTimeout(roleplaySaveTimer);
    roleplaySaveTimer = undefined;
    progress.aeRoleplayNotes = data.payload.aeRoleplayNotes;
    aeEvidenceDraft = {...progress.aeOnboardingEvidence};
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
updateHeader=function(){originalHeader();const count=reviewKeys().length;$('srs-card').style.display=count?'block':'none';$('srs-text').textContent=count+' decisiones listas para repasar';};
for(const name of ['startQuiz','startFlashcards','startLessonChallenge','completeCurrentLesson','openProductAcademy','startMatchGame','startTFGame','startOrderGame','startMemoryGame']){
  const original=window[name];
  window[name]=function(...args){if(!ready){saveNote('Carga tu avance desde Onboarding para guardar esta práctica. La biblioteca sigue disponible.',true);return;}return original(...args);};
}
const oldSwitch = switchTab;
const oldOpenLesson = openLesson;
openLesson = function(id) {
  const tab = document.querySelector('.nav-item.active')?.dataset.academyTab;
  if (tab) lessonOrigin = tab;
  oldOpenLesson(id);
};
closeLessonView = function() {
  switchTab(lessonOrigin);
  restoreOnboardingFocus();
};
const oldCloseExam = closeExamView;
closeExamView = function() {
  oldCloseExam();
  switchTab('progress');
};
switchTab = function(tab) {
  $('academy-mission-view').classList.remove('active');
  $('academy-mission-view').style.display='none';
  oldSwitch(tab);
  active=null;
  if(tab==='home'||tab==='games') render();
  if(tab==='progress') renderSkills();
  accessible();
};
resetProgress = function() {
  if(!ready || !confirm('¿Reiniciar tu avance personal de Academy? Esta acción borra tus prácticas y apuntes guardados.')) return;
  progress = {role:progress.role,mode:progress.mode,attempts:{},reviews:{},tasks:{},legacy:{},resume:null};
  aeEvidenceDraft = {};
  clearTimeout(roleplaySaveTimer);
  roleplaySaveTimer = undefined;
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
    button.dataset.academyTab=tabs[i];
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

function hasOpenedCase(id) {
  return Boolean(
    progress.openedCases?.includes(id) ||
    progress.attempts[id] ||
    progress.resume?.id===id ||
    Object.hasOwn(progress.reflections||{},id) ||
    Object.keys(progress.reviews).some(key=>key.startsWith(id+':')) ||
    (id===HYPOTHESIS_MISSION.id&&progress.hypothesis)
  );
}
function markCaseOpened(id) {
  if(hasOpenedCase(id))return false;
  progress.openedCases=[...(progress.openedCases||[]),id];
  return true;
}
const isNewCase = id => ready&&!hasOpenedCase(id);
function newCaseDot(show, label='Nuevo') {
  return show?`<span class="academy-new-dot" role="img" aria-label="${label}" title="${label}"></span>`:'';
}

function missionCard(m){
  return `<button class="mission-card" data-start="${m.id}" ${!ready?'disabled':''}><div class="academy-muted"><span>${escape(m.skill)}</span><span>${m.minutes} min</span></div><h4>${escape(m.title)}${newCaseDot((m.advice||m.playbook)&&isNewCase(m.id))}</h4><p>${m.demo||m.advice||m.playbook?escape(m.story.replace('Caso simulado · ','')):'Un caso, tres decisiones y un próximo paso.'}</p><div class="academy-actions"><span class="academy-pill ${passed(m.id)?'done':''}">${passed(m.id)?'Práctica aprobada':record(m.id)?'Por reforzar':'Por descubrir'}</span><span class="academy-muted">${resume()?.id===m.id?'Retomar →':'Resolver →'}</span></div></button>`;
}
function scrollToCaseSection(section){
  const heading = $('academy-'+section)?.querySelector('h3');
  if (!heading) return;
  const headerHeight = document.querySelector('.header').getBoundingClientRect().height;
  const offset = heading.getBoundingClientRect().top - headerHeight - 16;
  window.scrollBy(0, offset);
  heading.focus({preventScroll:true});
}
function advisoryChallenges(){
  return `<section aria-label="Escenarios de asesoría"><div class="academy-section-head"><h3 tabindex="-1">Escenarios de asesoría</h3></div><p class="academy-muted">El cliente trae un flujo. Elige qué ajustar, prepara dos alternativas y practica cómo se las explicarías.</p><div class="academy-mission-grid" style="margin-top:14px">${ADVISORY_MISSIONS.map(missionCard).join('')}</div></section>`;
}
function hypothesisCard(){
  const {id,title,story,skill,minutes}=HYPOTHESIS_MISSION;
  const practice=progress.hypothesis;
  const status=practice?.submittedAt?'Respuesta registrada':Object.values(practice?.answers||{}).some(text=>text.trim())?'Borrador':'Por descubrir';
  return `<button class="mission-card" type="button" data-hypothesis ${!ready?'disabled':''}><div class="academy-muted"><span>${escape(skill)}</span><span>${minutes} min</span></div><h4>${escape(title)}${newCaseDot(isNewCase(id))}</h4><p>${escape(story)}</p><div class="academy-actions"><span class="academy-pill">${status}</span><span class="academy-muted">${practice?.submittedAt?'Revisar →':'Practicar →'}</span></div></button>`;
}
function playbookChallenges(){
  const stages = AE_ROLEPLAY_STAGES.map(stage => {
    const practice = mission(stage.mission);
    return missionCard({...practice, skill:'Etapa ' + stage.stage + ' · ' + stage.title});
  });
  return `<section aria-label="Roleplays del Playbook"><div class="academy-section-head"><h3 tabindex="-1">Roleplays del Playbook</h3></div><div class="academy-mission-grid">${stages.join('')}${hypothesisCard()}</div></section>`;
}
function demoChallenges(){
  return `<section aria-label="¿Dónde lo mostrarías?"><div class="academy-section-head"><h3 tabindex="-1">¿Dónde lo mostrarías?</h3><span class="academy-muted">Desafíos de demo</span></div><p class="academy-muted">Resuelve una solicitud de cliente y ensaya la demo de tres minutos con tu equipo.</p><div class="academy-mission-grid" style="margin-top:14px">${DEMO_MISSIONS.map(missionCard).join('')}</div></section>`;
}
const aeActivityKey = id => 'ae-route-' + id;
const aeRoleplayKey = stage => 'ae-roleplay-' + stage;
const hasAeRoute = () => progress.role === 'AE';
const aeDays = AE_ONBOARDING_WEEKS.flatMap((week, weekIndex) => week.days.map((day, dayIndex) => {
  const key = weekIndex + '-' + dayIndex;
  return {
    ...day, key, weekIndex, dayIndex,
    entries: [
      ...day.activities.map(activity => ({...activity, key:aeActivityKey(activity.id)})),
      ...AE_ROLEPLAY_STAGES.filter(stage => stage.day === key).map(stage => ({...stage, key:aeRoleplayKey(stage.stage)})),
    ],
  };
}));
const weekOfDay = day => Math.ceil(day / 7);

function loadOnboardingCalendar() {
  const byDay = new Map(aeDays.map(day => [day.weekIndex * 7 + day.dayIndex + 1, day]));
  const periods = (peoplePlan?.periods ?? []).map((title, index) => {
    const day = Number(title.match(/^Día\s+(\d+)$/i)?.[1]);
    const range = title.match(/^Semanas?\s+(\d+)(?:\s*[-–]\s*(\d+))?$/i);
    const firstWeek = day ? weekOfDay(day) : Number(range?.[1]);
    const lastWeek = Number(range?.[2] ?? firstWeek);
    const groups = peoplePlan.phases.map(phase => ({
      title:phase.title,
      entries:phase.entries.filter(entry => entry.period === index).map(entry => ({...entry,key:'people-onboarding-' + entry.id})),
    })).filter(group => group.entries.length);
    return {key:'period-'+index,title,day,firstWeek,lastWeek,groups,entries:groups.flatMap(group => group.entries)};
  }).filter(period => period.entries.length);
  const lastWeek = Math.max(AE_ONBOARDING_WEEKS.length,...periods.map(period => period.lastWeek || 0));
  onboardingWeeks = Array.from({length:lastWeek}, (_, index) => {
    const number = index + 1;
    const days = Array.from({length:7}, (_, offset) => {
      const day = index * 7 + offset + 1;
      const ae = byDay.get(day);
      const groups = periods.filter(period => period.day === day).flatMap(period => period.groups);
      return {key:'day-'+day,title:'Día '+day,ae,groups,entries:[...(ae?.entries ?? []),...groups.flatMap(group => group.entries)]};
    });
    const windows = periods.filter(period => !period.day && period.firstWeek <= number && period.lastWeek >= number);
    return {number,days,windows,entries:[...days,...windows].flatMap(slot => slot.entries)};
  });
  const unscheduled = periods.filter(period => !period.firstWeek);
  if (unscheduled.length) onboardingWeeks.push({number:0,days:[],windows:unscheduled,entries:unscheduled.flatMap(slot => slot.entries)});
  onboardingSlots = [...new Set(onboardingWeeks.flatMap(week => [...week.days,...week.windows]))].filter(slot => slot.entries.length);
}
const aeCount = entries => entries.filter(({key}) => progress.tasks[key]).length;
const pendingSlot = slots => slots.find(slot => aeCount(slot.entries) < slot.entries.length);
const allOnboardingEntries = () => onboardingSlots.flatMap(slot => slot.entries);
const nextAeTitle = entry => entry.stage === undefined ? escape(entry.title) : `Roleplay · Etapa ${entry.stage} · ${escape(entry.title)}`;

function aeNext() {
  const slot = pendingSlot(onboardingSlots);
  const entry = slot?.entries.find(({key}) => !progress.tasks[key]);
  if (!entry) return '<p class="academy-next-title">Completaste el plan disponible.</p><button class="academy-btn" data-ae-evidence>Revisar el go-live →</button>';
  return `<div><p class="academy-kicker">Próximo paso · ${entry.key.startsWith('people-')?'People':'AE'} · ${escape(slot.title)}</p><p class="academy-next-title">${nextAeTitle(entry)}</p></div>
    <button class="academy-btn primary" type="button" data-ae-resume="${entry.key}" ${!ready?'disabled':''}>Continuar onboarding →</button>`;
}

let aeReturnEntry = null;
function focusAeEntry(key) {
  const item = $('academy-entry-' + key);
  if (!item) return;
  selectedSlot = item.closest('[data-calendar-detail]').dataset.calendarDetail;
  const weeks = onboardingWeeks.filter(week => [...week.days,...week.windows].some(slot => slot.key === selectedSlot));
  if (!weeks.some(week => week.number === selectedWeek)) selectedWeek = weeks[0].number;
  showOnboardingCalendar($('academy-ae-route'));
  item.scrollIntoView({block:'center'});
  item.querySelector('input').focus({preventScroll:true});
}

function restoreOnboardingFocus() {
  if (!aeReturnEntry) return;
  focusAeEntry(aeReturnEntry);
  aeReturnEntry = null;
}

function aeRoleplayCard(entry) {
  const disabled = ready ? '' : 'disabled';
  return `<li class="academy-roleplay" id="academy-entry-${entry.key}">
    <p class="academy-kicker">Roleplay con tu referente · Etapa ${entry.stage}</p>
    <h5>${escape(entry.title)}</h5>
    <p class="academy-muted">${escape(entry.check)}</p>
    <div class="academy-actions"><button type="button" class="academy-btn" data-start="${entry.mission}" ${disabled}>Abrir escenario de práctica →</button></div>
    <label class="academy-roleplay-note">Feedback y próximo intento
      <textarea class="notes-area" rows="2" maxlength="500" data-roleplay-note="${entry.stage}" ${disabled}>${escape(progress.aeRoleplayNotes?.[entry.stage] ?? '')}</textarea>
    </label>
    <label class="academy-check"><input type="checkbox" data-ae-task="${entry.key}" ${progress.tasks[entry.key]?'checked':''} ${disabled}><span>Roleplay etapa ${entry.stage} practicado con mi referente</span></label>
  </li>`;
}

function aeAction(action) {
  if (action === 'crm') return '<button type="button" class="academy-btn" data-ae-evidence>Ver práctica y revisión →</button>';
  if (typeof action === 'number') {
    const lesson = LESSONS.find(item => item.id === action);
    return `<button type="button" class="academy-btn" data-ae-lesson="${action}" ${!ready?'disabled':''}>${escape(lesson.title)} →</button>`;
  }
  return `<button type="button" class="academy-btn" data-start="${action}" ${!ready?'disabled':''}>${escape(mission(action).title)} →</button>`;
}

const aeResources = {
  4: ['Leer Marco Mental', 'https://www.notion.so/3409c2747df581a4b358e1ba9bf80491'],
  7: ['Ver video', 'https://youtu.be/99BVNGON6ZM'],
  8: ['Ver video', 'https://youtu.be/4h76P4flwxE'],
  9: ['Ver video', 'https://www.youtube.com/watch?v=qb0Pnn9Oc2E'],
  25: ['Abrir guía de HubSpot', 'https://app.notion.com/p/3529c2747df581ceac51f8285bb824e7'],
  36: ['Abrir evaluación', 'https://docs.google.com/forms/d/1Rn1kMbnz8i-SZIRjrgGPPqjyqxhAgxgowEgQPqfKYis/viewform'],
};

const weekLabel = number => number ? `Semana ${number}` : "Sin fecha";
const slotSources = slot => [slot.ae && "AE", slot.groups.length && "People"].filter(Boolean).join(" + ");
const progressLabel = entries => `${aeCount(entries)}/${entries.length} completadas`;

function calendarSlot(slot, isWindow) {
  if (!slot.entries.length) return `<div class="academy-calendar-empty"><strong>${escape(slot.title)}</strong><span>Sin tareas</span></div>`;
  const detail = isWindow ? slot.groups.map(group => group.title).join(" · ") : slot.ae?.title ?? slot.groups[0].title;
  return `<button type="button" class="academy-calendar-slot${isWindow ? ' academy-calendar-window' : ''}" data-calendar-slot="${slot.key}" aria-pressed="false" aria-controls="academy-calendar-${slot.key}">
    <span class="academy-calendar-slot-head"><strong>${escape(slot.title)}</strong><span class="academy-calendar-source">${slotSources(slot)}</span></span>
    <span class="academy-calendar-slot-title">${escape(detail)}</span>
    <span class="academy-calendar-slot-progress" data-calendar-count>${progressLabel(slot.entries)}</span>
    <span class="academy-calendar-slot-fill" aria-hidden="true"></span>
  </button>`;
}

function aeActivity(entry) {
  if (entry.stage !== undefined) return aeRoleplayCard(entry);
  const {id,title,source,actions,key} = entry;
  return `<li id="academy-entry-${key}">
    <label class="academy-check"><input type="checkbox" data-ae-activity="${id}" data-ae-task="${key}" ${progress.tasks[key]?'checked':''} ${!ready?'disabled':''}><span>${escape(title)}</span></label>
    <div class="academy-actions">${actions.map(aeAction).join('')}
      ${aeResources[id] ? `<a class="academy-btn" href="${aeResources[id][1]}" target="_blank" rel="noopener noreferrer">${aeResources[id][0]} ↗</a>` : ''}
      <a class="academy-btn" href="${source}" target="_blank" rel="noopener noreferrer">Ficha en Notion ↗</a>
    </div>
  </li>`;
}

function calendarDetail(slot) {
  return `<section class="academy-calendar-detail" id="academy-calendar-${slot.key}" data-calendar-detail="${slot.key}" aria-labelledby="academy-calendar-title-${slot.key}" hidden>
    <div class="academy-section-head"><h4 id="academy-calendar-title-${slot.key}">${escape(slot.title)}${slot.ae ? ' · ' + escape(slot.ae.title) : ''}</h4><span class="academy-pill" data-calendar-detail-count>${progressLabel(slot.entries)}</span></div>
    ${slot.ae ? `<section class="academy-ae-day"><h5>AE · Sales Academy</h5><ul>${slot.ae.entries.map(aeActivity).join('')}</ul></section>` : ''}
    ${slot.groups.map(group => `<section class="academy-people-group">
      <h5>People · ${escape(group.title)}</h5>
      <ul>${group.entries.map(entry => `<li id="academy-entry-${entry.key}">
        <label class="academy-check"><input type="checkbox" data-ae-task="${entry.key}" ${progress.tasks[entry.key]?'checked':''} ${!ready?'disabled':''}><span>${escape(entry.title)}</span></label>
        <p class="academy-muted"><strong>${escape(entry.owner)}</strong> · ${escape(entry.action)}</p>
      </li>`).join('')}</ul>
    </section>`).join('')}
  </section>`;
}

function onboardingCalendar() {
  return `<p class="academy-muted academy-calendar-caption">Días contados desde el inicio del onboarding.</p>
  <div class="academy-calendar-nav" role="group" aria-label="Semanas del onboarding">
    ${onboardingWeeks.map(week => `<button class="academy-btn" type="button" data-calendar-week="${week.number}" aria-pressed="false" aria-controls="academy-week-${week.number}">${weekLabel(week.number)}</button>`).join('')}
  </div>
  ${onboardingWeeks.map(week => `<section class="academy-calendar-week" id="academy-week-${week.number}" data-calendar-panel="${week.number}" aria-labelledby="academy-week-heading-${week.number}" hidden>
    <div class="academy-calendar-week-head">
      <h4 id="academy-week-heading-${week.number}">${weekLabel(week.number)}</h4>
      <span class="academy-muted" data-calendar-week-count aria-live="polite"></span>
      <progress aria-label="Avance de ${weekLabel(week.number)}" max="${week.entries.length || 1}" value="${aeCount(week.entries)}"></progress>
    </div>
    ${week.days.length ? `<div class="academy-calendar-scroll" role="region" aria-label="Calendario de ${weekLabel(week.number)}" tabindex="0"><div class="academy-calendar-days">${week.days.map(slot => calendarSlot(slot,false)).join('')}</div></div>` : ''}
    ${week.windows.map(slot => calendarSlot(slot,true)).join('')}
    ${week.entries.length ? '' : '<p class="academy-muted academy-calendar-no-tasks">No hay actividades programadas para esta semana.</p>'}
  </section>`).join('')}
  ${onboardingSlots.map(calendarDetail).join('')}`;
}

function showOnboardingCalendar(route) {
  const next = pendingSlot(onboardingSlots);
  const active = onboardingWeeks.find(week => week.number === selectedWeek) ??
    onboardingWeeks.find(week => week.days.includes(next) || week.windows.includes(next)) ?? onboardingWeeks[0];
  const slots = [...active.days,...active.windows].filter(slot => slot.entries.length);
  const current = slots.find(slot => slot.key === selectedSlot) ?? pendingSlot(slots) ?? slots[0];
  route.querySelectorAll("[data-calendar-week]").forEach(chip => {
    chip.setAttribute("aria-pressed", String(Number(chip.dataset.calendarWeek) === active.number));
  });
  route.querySelectorAll("[data-calendar-panel]").forEach(panel => { panel.hidden = Number(panel.dataset.calendarPanel) !== active.number; });
  route.querySelectorAll("[data-calendar-slot]").forEach(chip => {
    chip.setAttribute("aria-pressed", String(chip.dataset.calendarSlot === current?.key));
  });
  route.querySelectorAll("[data-calendar-detail]").forEach(detail => { detail.hidden = detail.dataset.calendarDetail !== current?.key; });
}

function updateOnboardingCounts(route) {
  route.querySelector("[data-ae-total]").textContent = progressLabel(allOnboardingEntries());
  route.querySelectorAll("[data-calendar-panel]").forEach(panel => {
    const {entries} = onboardingWeeks.find(week => week.number === Number(panel.dataset.calendarPanel));
    panel.querySelector("[data-calendar-week-count]").textContent = entries.length ? progressLabel(entries) : "Sin actividades";
    panel.querySelector("progress").value = aeCount(entries);
  });
  route.querySelectorAll("[data-calendar-slot]").forEach(chip => {
    const {entries} = onboardingSlots.find(slot => slot.key === chip.dataset.calendarSlot);
    chip.querySelector("[data-calendar-count]").textContent = progressLabel(entries);
    chip.style.setProperty("--academy-completed", `${100 * aeCount(entries) / entries.length}%`);
  });
  route.querySelectorAll("[data-calendar-detail]").forEach(detail => {
    const {entries} = onboardingSlots.find(slot => slot.key === detail.dataset.calendarDetail);
    detail.querySelector("[data-calendar-detail-count]").textContent = progressLabel(entries);
  });
}

function aeRoute() {
  return `<section id="academy-ae-route" class="academy-panel academy-ae-route" aria-labelledby="academy-ae-title">
    <div class="academy-section-head">
      <h3 id="academy-ae-title" tabindex="-1">Calendario de onboarding · AE + People</h3>
      <span class="academy-pill" data-ae-total aria-live="polite"></span>
    </div>
    <div class="academy-next" data-ae-next>${aeNext()}</div>
    ${ready && !peoplePlan ? '<p class="academy-muted">El plan de People no está disponible en este momento.</p>' : ''}
    ${onboardingCalendar()}
    <div class="academy-actions"><button class="academy-btn" type="button" data-ae-evidence>Ir a simulación final y go-live →</button></div>
    <section id="academy-ae-evidence" class="academy-ae-evidence" aria-labelledby="academy-ae-evidence-title">
      <h3 id="academy-ae-evidence-title" tabindex="-1">Simulación completa y revisión de go-live</h3>
      <p class="academy-muted">Caso de práctica. Una tienda recibe 4.000 consultas mensuales por WhatsApp. Le preocupa la atención fuera de horario y compara tu propuesta con un proveedor más barato. Operaciones evalúa la solución, Finanzas aprueba y la conexión al sistema de pedidos está por validar.</p>
      <p class="academy-muted">Practica con tu referente. Usa un deal de prueba en un entorno de capacitación, o describe cómo quedaría el registro si todavía no tienes acceso. Guarda aquí tu evidencia personal. La revisión de go-live se acuerda con tu líder.</p>
      <details class="academy-ae-rubric">
        <summary>Pauta para revisar con tu referente</summary>
        <ul>
          <li>Explica un dolor con impacto medible y distingue lo confirmado de los supuestos.</li>
          <li>Muestra un recorrido de demo y una excepción. Aclara qué debe validar el cliente o SSPP.</li>
          <li>Defiende el precio y comprueba que el deal de prueba conserva acuerdos, etapa y próxima actividad.</li>
          <li>Acuerda qué mejorar antes del go-live y cuándo revisar el plan de 30/60 días.</li>
        </ul>
      </details>
      <form id="academy-ae-evidence-form">
        <div class="academy-ae-fields">${AE_ONBOARDING_EVIDENCE.map(({id,label,hint}) => `<label>
          <strong>${escape(label)}</strong><span class="academy-muted" id="ae-hint-${id}">${escape(hint)}</span>
          <textarea class="notes-area" data-ae-field="${id}" aria-describedby="ae-hint-${id}" maxlength="800" ${!ready?'disabled':''}>${escape(aeEvidenceDraft[id] ?? '')}</textarea>
        </label>`).join('')}</div>
        <button class="academy-btn primary" type="submit" ${!ready?'disabled':''}>Guardar evidencia</button>
        <span class="academy-muted" data-academy-save role="status"></span>
      </form>
    </section>
  </section>`;
}

function wireAeRoute() {
  const route = $('academy-ae-route');
  if (!route) return;
  showOnboardingCalendar(route);
  updateOnboardingCounts(route);
  route.addEventListener('click', event => {
    const week = event.target.closest('[data-calendar-week]');
    const slot = event.target.closest('[data-calendar-slot]');
    if (!week && !slot) return;
    if (week) {
      selectedWeek = Number(week.dataset.calendarWeek);
      selectedSlot = undefined;
    } else {
      selectedWeek = Number(slot.closest('[data-calendar-panel]').dataset.calendarPanel);
      selectedSlot = slot.dataset.calendarSlot;
    }
    showOnboardingCalendar(route);
  });
  route.addEventListener('change', event => {
    const input = event.target.closest('[data-ae-task]');
    if (input) {
      progress.tasks[input.dataset.aeTask] = input.checked;
      route.querySelector('[data-ae-next]').innerHTML = aeNext();
      updateOnboardingCounts(route);
      void persist();
    }
    if (event.target.matches('[data-roleplay-note]') && roleplaySaveTimer !== undefined) {
      clearTimeout(roleplaySaveTimer);
      roleplaySaveTimer = undefined;
      void persist();
    }
  });
  route.addEventListener('input', event => {
    const note = event.target.closest('[data-roleplay-note]');
    if (!note) return;
    progress.aeRoleplayNotes ??= {};
    progress.aeRoleplayNotes[note.dataset.roleplayNote] = note.value;
    clearTimeout(roleplaySaveTimer);
    roleplaySaveTimer = setTimeout(() => {
      roleplaySaveTimer = undefined;
      void persist();
    }, 500);
  });
  const form = $('academy-ae-evidence-form');
  form.addEventListener('input', event => {
    if (event.target.matches('[data-ae-field]')) aeEvidenceDraft[event.target.dataset.aeField] = event.target.value;
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    progress.aeOnboardingEvidence = Object.fromEntries(AE_ONBOARDING_EVIDENCE.map(({id}) => [id, (aeEvidenceDraft[id] ?? '').trim()]));
    void persist();
  });
}

function render() {
  $('academy-dashboard').innerHTML = `
    <header class="academy-panel academy-onboarding-head">
      <div>
        <h2>Onboarding</h2>
        <div class="academy-sync-note" data-academy-save role="status"></div>
      </div>
      <div class="academy-controls"><label>Rol<select id="academy-role" ${!ready?'disabled':''}>${Object.entries(ROLES).map(([id,r])=>`<option value="${id}" ${id===progress.role?'selected':''}>${r.name}</option>`).join('')}</select></label></div>
      <div class="academy-actions academy-recovery"><button class="academy-btn" id="academy-retry">${!ready?'Reintentar carga':'Reintentar guardado'}</button><button class="academy-btn" id="academy-reload">Cargar avance guardado</button></div>
      ${hasLegacy()?'<button class="academy-btn" id="academy-import">Recuperar mi avance anterior de este navegador</button>':''}
    </header>
    ${hasAeRoute() ? aeRoute() : `<section class="academy-panel">
      <div class="academy-section-head"><h3>Tu recorrido · ${escape(role().name)}</h3></div>
      <p class="academy-muted">${escape(role().goal)}</p>
      <div class="academy-mission-grid">${role().missions.map(mission).map(missionCard).join('')}</div>
      ${tasks.map((task,i)=>`<label class="academy-check"><input type="checkbox" data-task="${progress.role}-${i}" ${progress.tasks[progress.role+'-'+i]?'checked':''} ${!ready?'disabled':''}>${task}</label>`).join('')}
    </section>`}`;
  wireAeRoute();
  $('academy-role').onchange = event => { progress.role=event.target.value; void persist(); render(); };
  $('academy-retry').onclick = () => {
    if(!ready) void load();
    else if(conflict) saveNote('Carga el avance guardado para conciliar la otra pestaña. Tu práctica pendiente sigue visible aquí.',true);
    else { blocked=false; void persist(); }
  };
  $('academy-reload').onclick = () => {
    if((dirty||roleplaySaveTimer!==undefined)&&!confirm('Hay cambios pendientes en esta pestaña. ¿Descartarlos y cargar el avance guardado?')) return;
    dirty=false; void load();
  };
  if($('academy-import'))$('academy-import').onclick=()=>{
    if(!confirm('¿Confirmas que el avance anterior de este navegador es tuyo? Lo copiaremos a tu cuenta sin borrar el original.'))return;
    try{const previous=JSON.parse(localStorage.getItem('adereso_academy'));if(!previous||JSON.stringify(previous).length>70000)throw Error();state={...state,...previous};progress.legacy=clone(state);progress.legacyImported=true;void persist();renderHome();updateHeader();renderProductAcademies();renderAchievements();render();}
    catch{saveNote('No se pudo recuperar el avance anterior de este navegador.',true);}
  };
  $('academy-dashboard').querySelectorAll('[data-task]').forEach(input=>input.onchange=()=>{progress.tasks[input.dataset.task]=input.checked;void persist();});
  $('academy-training-core').innerHTML = `<section><div class="academy-section-head"><h3 tabindex="-1">Misiones comerciales</h3></div><div class="academy-mission-grid">${MISSIONS.filter(m=>!m.demo&&!m.advice&&!m.playbook).map(missionCard).join('')}</div></section>`;
  $('academy-playbook').innerHTML=playbookChallenges();
  $('academy-advisory').innerHTML=advisoryChallenges();
  $('academy-demo').innerHTML=demoChallenges();
  const review = $('academy-training-review');
  review.disabled = !ready;
  review.textContent = reviewKeys().length ? 'Repasar ' + reviewKeys().length + ' decisiones' : 'Practicar un caso';
  const resumeButton = $('academy-training-resume');
  resumeButton.hidden = !ready || !resume();
  resumeButton.dataset.start = resume()?.id ?? '';
  saveNote(lastStatus.text,lastStatus.error);
  accessible();
}
function hasLegacy(){try{return ready&&!progress.legacyImported&&!progress.legacy?.completedLessons?.length&&Boolean(localStorage.getItem('adereso_academy'));}catch{return false;}}
function openMission(id, reviewQuestions) {
  const m=mission(id);
  if(!ready||!m)return;
  const saved=!reviewQuestions&&resume()?.id===id?resume():null;
  active={id,edition:missionRevision(m),review:Boolean(reviewQuestions),questions:reviewQuestions||m.questions,
    answers:saved?.answers||[],index:saved?.index||0};
  const opened=(m.advice||m.playbook)&&markCaseOpened(id);
  if(!reviewQuestions&&!saved)saveResume();
  else if(opened)void persist();
  activateMissionView();
  showStep();
}
function activateMissionView() {
  originTab=document.querySelector('.nav-item.active')?.dataset.academyTab ?? 'home';
  document.querySelectorAll('.tab-content,.lesson-view,.quiz-view').forEach(el=>el.style.display='none');
  const view=$('academy-mission-view');
  view.style.display='block';
  view.classList.add('active');
}
function openHypothesis() {
  if(!ready)return;
  if(markCaseOpened(HYPOTHESIS_MISSION.id))void persist();
  activateMissionView();
  showHypothesis();
}

function showHypothesis() {
  const mission=HYPOTHESIS_MISSION;
  const view=$('academy-mission-view');
  const practice=progress.hypothesis;
  const answers=practice?.answers||{};
  const submitted=Boolean(practice?.submittedAt);
  view.innerHTML=`<div class="lesson-header"><button class="back-btn" type="button" data-exit aria-label="Volver a desafíos">←</button><h2>${escape(mission.title)}</h2></div>
    <div class="mission-layout"><aside class="academy-panel mission-story"><h3>El contexto</h3><p>${escape(mission.story)}</p>
    <div class="mission-consequence"><p>${escape(mission.reply)}</p></div></aside>
    <section class="mission-stage"><h3 id="mission-prompt" tabindex="-1">${submitted?'Revisa tu razonamiento':'Interpreta la respuesta del cliente'}</h3>
    ${submitted?`<div class="academy-panel"><h3>Tu respuesta</h3><dl class="academy-hypothesis-summary">${mission.fields.map(({name,label})=>`<dt>${escape(label)}</dt><dd>${escape(answers[name]||'')}</dd>`).join('')}</dl></div>
    <details class="academy-panel academy-hypothesis-review"><summary>Comparar con un ejemplo</summary><ul class="mission-review-list">${mission.example.map(point=>`<li>${escape(point)}</li>`).join('')}</ul></details>
    <h3>Pauta de revisión</h3><ul class="mission-review-list">${mission.criteria.map(point=>`<li>${escape(point)}</li>`).join('')}</ul>
    <p class="academy-muted">${escape(mission.reference.section)}</p><div class="academy-actions">${playbookLink(mission)}</div>`:`
    <form data-hypothesis-form>${mission.fields.map(({name,label})=>`<label class="academy-reflection">${escape(label)}<textarea name="${name}" required maxlength="600" rows="2">${escape(answers[name]||'')}</textarea></label>`).join('')}
    <div class="academy-actions"><button class="academy-btn primary" type="submit">Registrar mi respuesta →</button></div></form>`}
    <div class="academy-sync-note" data-academy-save role="status"></div></section></div>`;
  view.querySelector('[data-exit]').onclick=exit;
  const form=view.querySelector('[data-hypothesis-form]');
  if(form) {
    form.oninput=event=>{
      const field=event.target;
      field.setCustomValidity('');
      progress.hypothesis={answers:{...progress.hypothesis?.answers,[field.name]:field.value}};
      void persist();
    };
    form.onsubmit=event=>{
      event.preventDefault();
      const draft=Object.fromEntries(Array.from(new FormData(form),([name,value])=>[name,String(value).trim()]));
      const empty=mission.fields.find(({name})=>!draft[name]);
      if(empty) {
        const field=form.elements.namedItem(empty.name);
        field.setCustomValidity('Escribe tu respuesta para continuar.');
        field.reportValidity();
        return;
      }
      progress.hypothesis={answers:draft,submittedAt:new Date().toISOString()};
      showHypothesis();
      void persist();
    };
  }
  saveNote(lastStatus.text,lastStatus.error);
  $('mission-prompt').focus({preventScroll:true});
  window.scrollTo(0,0);
}

function saveResume(){
  progress.resume={id:active.id,edition:active.edition,index:active.index,answers:[...active.answers]};
  void persist();
}
function showStep() {
  const m=mission(active.id),q=active.questions[active.index];
  if(!q) {showResult();return;}
  const answer=active.answers[active.index],answered=Number.isInteger(answer);
  $('academy-mission-view').innerHTML=`<div class="lesson-header"><button class="back-btn" data-exit aria-label="Volver a desafíos">←</button><h2>${escape(active.review?'Repaso de decisiones':m.title)}</h2></div>
    <div class="mission-layout"><aside class="academy-panel mission-story"><div class="academy-kicker">${escape(m.skill)} · ${m.minutes} min</div><h3>El contexto</h3><p>${escape(m.story)}</p>
    ${m.advice?`<h3 style="margin-top:20px">Flujo que propone el cliente</h3><ol class="academy-path">${m.advice.flow.map(step=>`<li>${escape(step)}</li>`).join('')}</ol>`:''}
    <p class="academy-muted" style="margin-top:20px">Puedes salir y retomar una misión. Cada decisión se guarda después de tu respuesta.</p>
    ${m.reference?`<p class="academy-muted">${escape(m.reference.section)}</p>`:''}<div class="academy-actions">${m.playbook?playbookLink(m):`<button class="academy-btn" data-source>${m.reference?'Buscar esta fuente en la biblioteca':'Consultar referencias'} ↗</button>`}</div></aside>
    <section class="mission-stage"><div class="mission-progress">${active.review?'Repaso':'Decisión'} ${active.index+1}/${active.questions.length}</div><h3 tabindex="-1" id="mission-prompt">${escape(q.prompt)}</h3>
    ${q.options.map((option,i)=>`<button class="mission-option ${answered&&i===q.correct?'correct':answered&&i===answer?'wrong':''}" data-answer="${i}" ${answered?'disabled':''}>${answered&&i===q.correct?'✓ ':answered&&i===answer?'Por revisar · ':String.fromCharCode(65+i)+' · '}${escape(option)}</button>`).join('')}
    ${answered?`<div class="mission-consequence"><span class="academy-kicker">En esta simulación</span><p>${escape(CONSEQUENCES[q.id]?.[answer===q.correct?0:1] || 'Revisa cómo esta decisión afecta el siguiente paso.')}</p></div><div class="mission-feedback" role="status"><strong>${answer===q.correct?'Buena decisión.':q.critical?'Hay un punto importante por reforzar.':'Veamos qué cambia.'}</strong><p>${escape(q.explanation)}</p>${q.critical&&answer!==q.correct?'<p>Esta decisión debe corregirse para aprobar la práctica.</p>':''}</div><div class="academy-actions"><button class="academy-btn primary" data-next>${active.index===active.questions.length-1?'Ver mi resultado':'Continuar'} →</button></div>`:''}
    <div class="academy-sync-note" data-academy-save role="status"></div></section></div>`;
  $('academy-mission-view').querySelector('[data-exit]').onclick=exit;
  const source=$('academy-mission-view').querySelector('[data-source]');
  if(source)source.onclick=()=>library(m.reference?.query);
  $('academy-mission-view').querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{
    if(Number.isInteger(active.answers[active.index]))return;
    const choice=Number(button.dataset.answer);active.answers[active.index]=choice;
    const key=active.id+':'+q.id;
    const previous=currentMissionReview(m,progress.reviews[key]);
    progress.reviews[key]={...nextReview(previous,choice===q.correct),edition:active.edition};
    if(!active.review)saveResume();else void persist();
    showStep();
  });
  const next=$('academy-mission-view').querySelector('[data-next]');
  if(next)next.onclick=()=>{active.index++;if(!active.review)saveResume();showStep();};
  $('mission-prompt').focus({preventScroll:true});window.scrollTo(0,0);
}
function playbookLink(m) {
  return `<a class="academy-btn" href="${escape(m.reference.url)}" target="_blank" rel="noopener noreferrer">Abrir Playbook ↗</a>`;
}
function showResult() {
  const m=mission(active.id);
  const result=active.review?{correct:active.questions.filter((q,i)=>active.answers[i]===q.correct).length,total:active.questions.length,passed:true,criticalMiss:false}:skillResult(m,active.answers);
  if(!active.review) {
    const previous=record(active.id);
    if(result.passed&&!previous?.passed)state.xp+=60;
    const today=new Date().toDateString();if(state.lastDate!==today){state.streak++;state.lastDate=today;}
    progress.legacy=clone(state);updateHeader();
    progress.attempts[active.id]={edition:active.edition,passed:result.passed||Boolean(previous?.passed),lastPassed:result.passed,correct:result.correct,total:result.total,at:new Date().toISOString()};
    progress.resume=null;
    void persist();
  }
  const misses=active.questions.filter((q,i)=>active.answers[i]!==q.correct);
  $('academy-mission-view').innerHTML=`<div class="mission-stage"><div class="academy-kicker">${active.review?'Repaso completado':result.passed?'Práctica aprobada':'Una nueva oportunidad para mejorar'}</div><h2>${result.correct}/${result.total} decisiones acertadas</h2><p style="margin:16px 0">${result.criticalMiss?'Hay una decisión crítica por reforzar. Revísala y vuelve a intentar.':misses.length?'Ya tienes feedback concreto para el siguiente intento.':'Resolviste el caso. Ahora prueba aplicar el criterio en una conversación de práctica.'}</p>
    ${misses.length?`<ul class="mission-review-list">${misses.map(q=>`<li>${escape(q.explanation)}</li>`).join('')}</ul>`:'<p class="academy-muted">El siguiente paso es practicar con tu referente. Este resultado no es una certificación comercial.</p>'}
    ${!active.review&&m.demo?`<section class="academy-panel" style="margin-top:24px"><h3>Ensayo con tu equipo · 3 min</h3><p>Una persona interpreta al cliente, otra hace la demo y otra devuelve feedback.</p><ol class="academy-path">${m.demo.steps.map(step=>`<li>${escape(step)}</li>`).join('')}</ol><h3>Qué revisar juntos</h3><ul class="mission-review-list">${m.demo.rubric.map(item=>`<li>${escape(item)}</li>`).join('')}</ul><div class="academy-actions"><button class="academy-btn" data-demo-source>Buscar esta fuente en la biblioteca ↗</button><a class="academy-btn" href="${escape(m.reference.url)}" target="_blank" rel="noopener noreferrer">${escape(m.reference.url.startsWith('https://help.adereso.ai/')?'Abrir guía de producto':'Abrir Wiki comercial')} ↗</a></div></section>`:''}
    <p class="academy-muted" style="margin-top:16px">Tus decisiones volverán en repasos espaciados. Revisión ${escape(active.edition)}.</p><div class="academy-actions"><button class="academy-btn primary" data-exit>Volver a mi ruta →</button><button class="academy-btn" data-retry>Practicar de nuevo</button>${m.playbook?playbookLink(m):'<button class="academy-btn" data-lesson>Consultar la lección</button>'}</div><div class="academy-sync-note" data-academy-save role="status"></div></div>`;
  const reflection=document.createElement('label');reflection.className='academy-reflection';
  const playbook = active.review ? null : m.playbook;
  const advice = active.review ? null : m.advice;
  reflection.textContent=playbook?.prompt ?? (advice
    ? '¿Cómo le responderías al cliente? Escribe dos alternativas, cuál recomendarías primero y qué queda por validar.'
    : 'Llévalo a la práctica: ¿qué preguntarías o harías en tu próxima reunión?');
  const note=document.createElement('textarea');note.maxLength=1000;note.rows=3;note.placeholder=advice||playbook?'Escribe tu respuesta al cliente…':'Escribe tu próximo paso (opcional)…';note.value=progress.reflections?.[m.id]||'';
  note.oninput=()=>{progress.reflections||={};progress.reflections[m.id]=note.value;void persist();};reflection.append(note);$('academy-mission-view').querySelector('.mission-stage').append(reflection);
  $('academy-mission-view').querySelector('[data-exit]').onclick=exit;
  $('academy-mission-view').querySelector('[data-retry]').onclick=()=>openMission(active.id);
  const lesson=$('academy-mission-view').querySelector('[data-lesson]');
  if(lesson)lesson.onclick=()=>{exit();openLesson(m.lesson);};
  if(advice||playbook) {
    const example=document.createElement('details');
    example.className='academy-panel';
    example.style.marginTop='16px';
    example.innerHTML=`<summary>Ver una respuesta posible</summary><p style="margin-top:12px">${escape((advice||playbook).model)}</p>${advice?'<div class="academy-actions"><button class="academy-btn" data-advice-source>Consultar la fuente en la biblioteca ↗</button></div>':''}`;
    reflection.after(example);
    const adviceSource=example.querySelector('[data-advice-source]');
    if(adviceSource)adviceSource.onclick=()=>library(m.reference.query);
  }
  const source=$('academy-mission-view').querySelector('[data-demo-source]');
  if(source)source.onclick=()=>library(m.reference.query);
  window.scrollTo(0,0);
}
function exit() {$('academy-mission-view').classList.remove('active');$('academy-mission-view').style.display='none';switchTab(originTab);active=null;restoreOnboardingFocus();}
function library(query) {
  if(active)exit();
  switchTab('products');$('academy-sources').open=true;
  const input=$('academy-source-search');
  if(query){
    $('academy-sources').querySelector('[data-academy-source="all"]')?.click();
    input.value=query;input.dispatchEvent(new Event('input'));
  }
  input.focus();
}
function startReview() {
  const keys=reviewKeys(),groups=new Map();
  for(const key of keys){const [id,qid]=key.split(':');const m=mission(id),q=m?.questions.find(q=>q.id===qid);if(q){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(q);}}
  if(groups.size){const [id,questions]=groups.entries().next().value;openMission(id,questions);}
  else {const current=pending();const alternative=MISSIONS.find(m=>m.id!==current&&!passed(m.id))||MISSIONS.find(m=>m.id!==current);openMission(alternative.id);}
}
function renderSkills() {
  const node=$('academy-skills');
  const onboarding = `<section class="academy-panel academy-progress-route"><h3>Avance de onboarding · AE + People</h3><p class="academy-muted">${progressLabel(allOnboardingEntries())}</p><button class="academy-btn" type="button" data-open-onboarding>Ir al onboarding →</button></section>`;
  node.innerHTML=onboarding+`<div class="section-title">Tus habilidades en práctica</div><p class="academy-muted" style="margin-bottom:16px">Resultados de desafíos · una práctica aprobada no equivale a certificación.</p><div class="academy-evidence-grid">${MISSIONS.map(m=>{const r=record(m.id);return `<div class="academy-evidence"><h3>${escape(m.skill)}</h3><p class="academy-muted">${!r?'Aún sin práctica':r.lastPassed?'Último caso aprobado':r.passed?'Aprobada antes · último intento por reforzar':'Por reforzar'}${r?' · '+r.correct+'/'+r.total:''}</p><div class="academy-actions"><button class="academy-btn" data-start="${m.id}">Practicar →</button></div></div>`;}).join('')}</div>`;
}
document.addEventListener('click',event=>{
  const entry = event.target.closest('[id^="academy-entry-"]');
  const start=event.target.closest('[data-start]');
  if (start) {
    aeReturnEntry = entry?.id.slice('academy-entry-'.length) ?? null;
    openMission(start.dataset.start);
  }
  if(event.target.closest('[data-hypothesis]'))openHypothesis();
  if(event.target.closest('[data-review]'))startReview();
  if(event.target.closest('[data-library]'))library();
  const section=event.target.closest('[data-case-section]');
  if(section)scrollToCaseSection(section.dataset.caseSection);
  if(event.target.closest('[data-ae-evidence]'))scrollToCaseSection('ae-evidence');
  const lesson=event.target.closest('[data-ae-lesson]');
  if(lesson) {
    aeReturnEntry = entry?.id.slice('academy-entry-'.length) ?? null;
    openLesson(Number(lesson.dataset.aeLesson));
  }
  const resume = event.target.closest('[data-ae-resume]');
  if (resume) focusAeEntry(resume.dataset.aeResume);
  if (event.target.closest('[data-open-onboarding]')) {
    progress.role='AE';
    switchTab('home');
  }
});
document.addEventListener('academy:sources-checked', () => {
  $('academy-mission-source-status').textContent = wikiChanged()
    ? 'La wiki tiene novedades posteriores a las misiones base. Consulta la referencia del caso.'
    : 'Misiones base · edición ' + LEGACY_MISSION_REVISION;
});
const view=document.createElement('div');view.id='academy-mission-view';view.className='main mission-view';$('app').insertBefore(view,document.querySelector('.nav'));
const banner=document.createElement('p');banner.id='academy-save-banner';banner.setAttribute('role','status');banner.hidden=true;document.querySelector('.header').append(banner);
const dashboard=document.createElement('div');dashboard.id='academy-dashboard';dashboard.className='academy-home';$('tab-home').prepend(dashboard);
const skills=document.createElement('div');skills.id='academy-skills';$('tab-progress').prepend(skills);
const practice=document.createElement('section');
practice.className='academy-training';
practice.innerHTML=`<header class="academy-panel">
  <h2>Entrenamiento</h2>
  <div class="academy-actions">
    <button class="academy-btn primary" type="button" id="academy-training-resume" hidden>Retomar mi práctica →</button>
    <button class="academy-btn" type="button" id="academy-training-review" data-review>Practicar un caso</button>
    <button class="academy-btn" type="button" data-case-section="playbook">Roleplays del Playbook ↓</button>
    <button class="academy-btn" type="button" data-case-section="advisory">Asesoría ↓</button>
    <button class="academy-btn" type="button" data-case-section="demo">Demos ↓</button>
    <button class="academy-btn" type="button" data-case-section="quizzes">Quizzes y juegos ↓</button>
  </div>
  <p id="academy-mission-source-status" class="academy-muted academy-edition">Misiones base · edición ${LEGACY_MISSION_REVISION}</p>
</header>
<div id="academy-playbook"></div><div id="academy-training-core"></div><div id="academy-advisory"></div><div id="academy-demo"></div>`;
$('tab-games').prepend(practice);
const legacy=document.querySelector('.academy-legacy');
const products=$('tab-products');
const progressTab=$('tab-progress');
const practiceTools=document.createElement('section');
practiceTools.id='academy-quizzes';
practiceTools.innerHTML='<h3 tabindex="-1">Quizzes y juegos</h3>';
for (const child of [...$('tab-games').children].slice(1)) {
  if (child.classList.contains('section-title') && child.textContent.includes('Entrenamiento')) child.remove();
  else practiceTools.append(child);
}
const quizInfo=practiceTools.querySelector('div');
if (quizInfo) quizInfo.textContent='Practica a tu ritmo. Los exámenes de nivel están en Progreso.';
$('tab-games').append(practiceTools);
const lessons = document.createElement('section');
lessons.className='academy-panel academy-lesson-library';
const lessonHeading = $('lessons-list').previousElementSibling;
lessonHeading.firstChild.textContent = 'Biblioteca de lecciones ';
lessons.append(lessonHeading, $('lessons-list'));
products.append(document.querySelector('.academy-source-intro'), lessons);
progressTab.prepend(legacy.querySelector('.welcome-card'), $('exam-section'));
const legacyReview = document.createElement('div');
legacyReview.hidden = true;
legacyReview.append($('srs-card'));
practice.append(legacyReview);
legacy.remove();
// Lucide icons rendered from the project's existing lucide-react package.
installAcademyNavigation({"home": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-house\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"></path><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"></path></svg>", "games": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-dumbbell\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\"></path><path d=\"m2.5 21.5 1.4-1.4\"></path><path d=\"m20.1 3.9 1.4-1.4\"></path><path d=\"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z\"></path><path d=\"m9.6 14.4 4.8-4.8\"></path></svg>", "products": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-graduation-cap\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\"></path><path d=\"M22 10v6\"></path><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\"></path></svg>", "progress": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chart-no-axes-combined\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 16v5\"></path><path d=\"M16 14v7\"></path><path d=\"M20 10v11\"></path><path d=\"m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15\"></path><path d=\"M4 18v3\"></path><path d=\"M8 14v7\"></path></svg>", "open": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-panel-left-open\" aria-hidden=\"true\" focusable=\"false\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"></rect><path d=\"M9 3v18\"></path><path d=\"m14 9 3 3-3 3\"></path></svg>", "close": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-panel-left-close\" aria-hidden=\"true\" focusable=\"false\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"></rect><path d=\"M9 3v18\"></path><path d=\"m16 15-3-3 3-3\"></path></svg>"});
document.body.classList.add('academy-pending');
loadOnboardingCalendar();
render();
const academySearch = location.href === 'about:srcdoc' ? parent.location.search : location.search;
void load().then(()=>{
  const section=new URLSearchParams(academySearch).get('academySection');
  if(section==='ae-route'){
    progress.role='AE';
    switchTab('home');
    scrollToCaseSection(section);
  }
  if(section==='advisory'||section==='playbook'){switchTab('games');scrollToCaseSection(section);}
});
