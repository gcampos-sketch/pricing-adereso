import {useEffect,useRef,useState,type ReactNode} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {readTrustToken} from '@/lib/mfa-trust';
import {mountStarfield} from '../../../starfield.js';
import {mountWelcomeBurst} from '@/lib/welcome-burst';
import wordmark from '../../../logoadereso.webp';
import {HubLoading} from '@/components/HubLoading';

/** Presentation is exported for isolated visual QA, not a public replay route. */
export function HubWelcomeScene({onDone,name}:{onDone:()=>void;name?:string|undefined}){
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
  <h1 id="hub-welcome-title" className="hub-welcome-accessible-title">Bienvenido{name?`, ${name}`:''} al Hub comercial.</h1>
  <div className="hub-welcome-lockup" aria-hidden="true">
    <div className="hub-welcome-isotype"><img src={wordmark} width={566} height={113} alt="" /></div>
    <div className="hub-welcome-wordmask">
      <div className="hub-welcome-brandword"><img src={wordmark} width={566} height={113} alt="" /></div>
      <span className="hub-welcome-greeting" data-personalized={Boolean(name)}><span>Bienvenido</span>{name&&<span className="hub-welcome-name">{name}</span>}</span>
    </div>
  </div>
  <button className="hub-welcome-skip" type="button" onClick={()=>done.current()}>Entrar al Hub <span aria-hidden="true">↗</span></button>
 </section>;
}

/** Once per account, including across devices. StrictMode reuses its single in-flight claim. */
export function HubFirstAccess({userId,children}:{userId:string;children:ReactNode}){
 const embedded=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('embedded')==='hub';
 const [phase,setPhase]=useState<'checking'|'show'|'done'>(embedded?'done':'checking');
 const [name,setName]=useState<string>();
 const request=useRef<Promise<boolean>|null>(null);
 useEffect(()=>{
  if(embedded)return;let active=true;
  if(!request.current)request.current=(async()=>{
   const {data}=await supabase.auth.getSession();if(data.session?.user.id!==userId)return false;
   // Profile names personalize presentation only; never infer identity from an email alias.
   const metadata=data.session.user.user_metadata;
   const profileName=[metadata?.['given_name'],metadata?.['first_name'],metadata?.['full_name'],metadata?.['name']].find(value=>typeof value==='string'&&value.trim()&&!value.includes('@'));
   const firstName=typeof profileName==='string'?profileName.trim().split(/\s+/u)[0]:undefined;
   if(firstName&&/^[\p{L}\p{M}’'\-]{1,32}$/u.test(firstName))setName(firstName);
   const trust=readTrustToken();
   const response=await fetch('/api/hub/first-access',{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(6000),headers:{Authorization:'Bearer '+data.session.access_token,...(trust?{'x-mfa-trust':trust}:{})}});
   if(!response.ok)return false;const result=await response.json();return result.show===true;
  })().catch(()=>false);
  void request.current.then(show=>{if(active)setPhase(show?'show':'done');});
  return()=>{active=false;};
 },[userId,embedded]);
 return <><div className="hub-first-access-content" inert={phase!=='done'} aria-hidden={phase!=='done'?true:undefined}>{children}</div>
  {phase==='checking'&&<HubLoading />}
  {phase==='show'&&<HubWelcomeScene name={name} onDone={()=>setPhase('done')} />}
 </>;
}
