import {useEffect,useRef,useState,type ReactNode} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {readTrustToken} from '@/lib/mfa-trust';
import {mountStarfield} from '../../../starfield.js';
import {mountWelcomeBurst} from '@/lib/welcome-burst';
import wordmark from '../../../logoadereso.webp';

/** Presentation is exported for isolated visual QA, not a public replay route. */
export function HubWelcomeScene({onDone}:{onDone:()=>void}){
 const root=useRef<HTMLElement>(null),sky=useRef<HTMLCanvasElement>(null),burst=useRef<HTMLCanvasElement>(null);
 const done=useRef(onDone);done.current=onDone;
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 useEffect(()=>sky.current?mountStarfield(sky.current,{animate:false}):undefined,[]);
 useEffect(()=>{
  if(reduced){const timer=setTimeout(()=>done.current(),900);return()=>clearTimeout(timer);}
  return burst.current?mountWelcomeBurst(burst.current,()=>done.current()):undefined;
 },[reduced]);
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';root.current?.focus();
  return()=>{document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
 },[]);
 return <section ref={root} tabIndex={-1} className="hub-welcome" data-reduced={reduced} role="dialog" aria-modal="true" aria-labelledby="hub-welcome-title" onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();done.current();}
  if(event.key==='Tab'){event.preventDefault();root.current?.querySelector<HTMLButtonElement>('button')?.focus();}
 }}>
  <canvas ref={sky} className="hub-welcome-sky" aria-hidden="true" />
  {!reduced&&<canvas ref={burst} className="hub-welcome-burst" aria-hidden="true" />}
  <div className="hub-welcome-mark"><img src={wordmark} width={566} height={113} alt="Adereso" /></div>
  <div className="hub-welcome-message"><span>UN NUEVO UNIVERSO COMERCIAL</span><h1 id="hub-welcome-title">Bienvenido al Hub comercial.</h1><p>Todo comienza aquí.</p></div>
  <button className="hub-welcome-skip" type="button" onClick={()=>done.current()}>Entrar al Hub <span aria-hidden="true">↗</span></button>
 </section>;
}

/** Once per account, including across devices. StrictMode reuses its single in-flight claim. */
export function HubFirstAccess({userId,children}:{userId:string;children:ReactNode}){
 const embedded=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('embedded')==='hub';
 const [phase,setPhase]=useState<'checking'|'show'|'done'>(embedded?'done':'checking');
 const request=useRef<Promise<boolean>|null>(null);
 useEffect(()=>{
  if(embedded)return;let active=true;
  if(!request.current)request.current=(async()=>{
   const {data}=await supabase.auth.getSession();if(data.session?.user.id!==userId)return false;
   const trust=readTrustToken();
   const response=await fetch('/api/hub/first-access',{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(6000),headers:{Authorization:'Bearer '+data.session.access_token,...(trust?{'x-mfa-trust':trust}:{})}});
   if(!response.ok)return false;const result=await response.json();return result.show===true;
  })().catch(()=>false);
  void request.current.then(show=>{if(active)setPhase(show?'show':'done');});
  return()=>{active=false;};
 },[userId,embedded]);
 return <><div className="hub-first-access-content" inert={phase!=='done'} aria-hidden={phase!=='done'?true:undefined}>{children}</div>
  {phase==='checking'&&<div className="hub-welcome-check" aria-hidden="true" />}
  {phase==='show'&&<HubWelcomeScene onDone={()=>setPhase('done')} />}
 </>;
}
