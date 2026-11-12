/* One scroll-linked chapter index for pricing and each embedded/standalone guide. */
(()=>{
 function init(){
  const source=document.querySelector('#secnav,#toc,#steps');
  if(!source)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const nav=document.createElement('nav');nav.className='chapter-index';nav.setAttribute('aria-label','Índice de secciones');
  nav.innerHTML='<div class="chapter-track" aria-hidden="true"><span class="chapter-fill"></span></div><div class="chapter-items"></div><span class="chapter-cursor" aria-hidden="true"></span>';
  document.body.append(nav);document.body.classList.add('has-chapter-index');
  source.classList.add('chapter-source');
  const list=nav.querySelector('.chapter-items'),fill=nav.querySelector('.chapter-fill'),cursor=nav.querySelector('.chapter-cursor');
  let entries=[],frame=0,travel=0,lastTime=0,currentY=null,lastActive=-1,clickPending=0;
  const resources=document.createElement('details');resources.className='chapter-resources';
  const summary=document.createElement('summary');summary.textContent='Notas y opciones';resources.append(summary);
  const panel=document.createElement('div');panel.className='chapter-resource-panel';resources.append(panel);
  const side=source.closest('.side');
  if(side){
    side.querySelectorAll('.side-box').forEach(el=>panel.append(el));
    side.classList.add('chapter-old-side');
  }
  const reset=document.getElementById('resetBtn');
  if(reset){reset.classList.add('chapter-reset');reset.innerHTML='Reiniciar cotización';panel.append(reset);}
  if(panel.children.length){
    if(source.id==='secnav'){
      summary.setAttribute('aria-label','Notas y opciones');summary.title='Notas y opciones';
      summary.innerHTML='<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg>';
      nav.prepend(resources);
    }else document.body.append(resources);
  }
  function rebuild(){
    const screens=Array.from(document.querySelectorAll('.screen'));
    entries=Array.from(source.querySelectorAll('a,button')).map((el,i)=>{
      const id=el.dataset.goto||(el.getAttribute('href')||'').replace(/^#/, '');
      const target=source.id==='steps'?screens[i]:document.getElementById(id);
      const label=el.querySelector('.snav-t,span:not(.num):not(.rl)')?.textContent||el.getAttribute('aria-label')||el.title||target?.dataset.title||el.textContent;
      return {target,label:label.trim(),button:null};
    }).filter(e=>e.target);
    list.replaceChildren();
    entries.forEach((e,i)=>{
      const b=document.createElement('button');b.type='button';b.className='chapter-item';
      b.innerHTML='<span class="chapter-node" aria-hidden="true"></span><span class="chapter-label"></span>';
      b.querySelector('.chapter-label').textContent=e.label;b.setAttribute('aria-label',e.label);b.title=e.label;
      b.addEventListener('click',()=>go(e));list.append(b);e.button=b;
    });
    nav.style.setProperty('--chapter-count',Math.max(1,entries.length));lastActive=-1;currentY=null;schedule();
  }
  function go(entry){
    cancelAnimationFrame(travel);clearTimeout(clickPending);
    const el=entry.target;
    // Keep the guides' fold state and persistence in their existing controllers.
    if(typeof setFold==='function')setFold(el,true);
    if(typeof phOpen==='function')phOpen(el);
    // A live Notion heading can sit inside native details rather than a legacy fold.
    for(let p=el;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
    el.classList.add('seen');
    clickPending=setTimeout(()=>{
      const from=scrollY;
      const destination=()=>Math.max(0,Math.min(document.documentElement.scrollHeight-innerHeight,el.getBoundingClientRect().top+scrollY-Math.min(100,innerHeight*.13)));
      if(reduced.matches){scrollTo({top:destination(),behavior:'instant'});schedule();return;}
      const distance=Math.abs(destination()-from),duration=Math.min(1200,650+distance*.12),start=performance.now();
      const tick=t=>{
        const p=Math.min(1,(t-start)/duration),ease=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
        scrollTo({top:from+(destination()-from)*ease,behavior:'instant'});
        if(p<1)travel=requestAnimationFrame(tick);else{travel=0;schedule();}
      };
      travel=requestAnimationFrame(tick);
    },50);
  }
  function cancelTravel(){cancelAnimationFrame(travel);travel=0;clearTimeout(clickPending);}
  addEventListener('wheel',cancelTravel,{passive:true});addEventListener('touchstart',cancelTravel,{passive:true});
  addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End','Escape',' '].includes(e.key))cancelTravel();});
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  function update(now){
    frame=0;
    const visible=entries.filter(e=>e.target.getClientRects().length&&getComputedStyle(e.target).display!=='none');
    nav.hidden=visible.length<2;
    resources.hidden=nav.hidden;
    if(nav.hidden){currentY=null;return;}
    entries.forEach(e=>{e.button.hidden=!visible.includes(e);});
    nav.style.setProperty('--chapter-count',visible.length);
    const tops=visible.map(e=>e.target.getBoundingClientRect().top+scrollY);
    const anchor=scrollY+innerHeight*.32;
    let segment=0;
    while(segment<tops.length-1&&tops[segment+1]<=anchor)segment++;
    const next=Math.min(segment+1,tops.length-1);
    let fraction=next===segment?0:Math.max(0,Math.min(1,(anchor-tops[segment])/Math.max(1,tops[next]-tops[segment])));
    if(scrollY+innerHeight>=document.documentElement.scrollHeight-3){segment=visible.length-1;fraction=0;}
    const centers=visible.map(e=>list.offsetTop+e.button.offsetTop+e.button.offsetHeight/2);
    const end=Math.min(segment+1,visible.length-1);
    const targetY=centers[segment]+(centers[end]-centers[segment])*fraction;
    const dt=lastTime?Math.min(64,now-lastTime):16;lastTime=now;
    if(currentY===null||reduced.matches)currentY=targetY;
    else currentY+=(targetY-currentY)*(1-Math.exp(-dt/70));
    if(Math.abs(targetY-currentY)<.05)currentY=targetY;
    const first=centers[0],last=centers.at(-1);
    nav.style.setProperty('--chapter-start',first+'px');nav.style.setProperty('--chapter-end',last+'px');
    fill.style.height=Math.max(0,currentY-first)+'px';cursor.style.transform=`translateY(${currentY-5}px)`;
    visible.forEach((e,i)=>{
      e.button.classList.toggle('chapter-past',i<segment);
      e.button.classList.toggle('chapter-active',i===segment);
      if(i===segment)e.button.setAttribute('aria-current','location');else e.button.removeAttribute('aria-current');
    });
    lastActive=segment;
    if(currentY!==targetY)schedule();
  }
  new MutationObserver(rebuild).observe(source,{childList:true,subtree:true});
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  new ResizeObserver(schedule).observe(document.documentElement);
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
  document.addEventListener('click',schedule);document.addEventListener('transitionend',schedule);
  reduced.addEventListener('change',schedule);
  rebuild();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
