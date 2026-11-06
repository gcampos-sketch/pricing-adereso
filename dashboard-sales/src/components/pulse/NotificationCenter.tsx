import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Check, Bell, Copy, RefreshCw, ExternalLink, ChevronLeft, ChevronRight, Mail, NotebookPen, CircleSlash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useAccountEmail } from '@/components/AuthGate';
import { getSalesNotifications } from '@/lib/sales-notifications.functions';
import { attestation, copyNotices, crmUrl, emptyRepository, RISK_LABELS, santiago, suggestion, SYNC_INTERVAL_MS, taskState, visibleNotices, writeClipboard, type NoticeScope, type Repository } from '@/lib/sales-notifications';

export function NotificationCenter({scope}: {scope:NoticeScope}) {
  const account=useAccountEmail();
  // A separate keyed lifecycle prevents even one frame of the previous account's repository.
  return account ? <NotificationLoader key={account} account={account} scope={scope}/> : null;
}
function NotificationLoader({account,scope}: {account:string;scope:NoticeScope}) {
  const load=useServerFn(getSalesNotifications);
  const [repo,setRepo]=useState<Repository>(()=>emptyRepository(account,''));
  const [busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=> {
    let disposed=false, timer:ReturnType<typeof setTimeout>;
    const sync=async()=> {
      setBusy(true);
      try { const next=await load(); if(!disposed) setRepo(next); }
      catch { if(!disposed) setRepo(p=>({...p,complete:false,error:'No se pudo sincronizar. Se conservan las alertas conocidas; revisa tu acceso y la fuente.'})); }
      finally { if(!disposed) {setBusy(false);timer=setTimeout(()=>void sync(),SYNC_INTERVAL_MS);} }
    };
    void sync();
    return ()=>{disposed=true;clearTimeout(timer);};
  },[load,refresh]);
  return <NotificationCenterView repo={repo} scope={scope} busy={busy} onRefresh={()=>setRefresh(n=>n+1)}/>;
}

/** Production view exported for fixture-only UI verification, without bypassing the live MFA gate. */
export function NotificationCenterView({repo,scope,busy=false,onRefresh}: {repo:Repository;scope:NoticeScope;busy?:boolean;onRefresh:()=>void}) {
  const [open,setOpen]=useState(false), [page,setPage]=useState(0), [feedback,setFeedback]=useState(''), [manual,setManual]=useState('');
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(t);},[]);
  const all=useMemo(()=>visibleNotices(repo,scope),[repo,scope]);
  // Personal browser-local task checks; a check never resolves the CRM alert.
  const storeKey=`sales-tasks/v1:${repo.account}`;
  const [done,setDone]=useState<Record<string,string>>({});
  useEffect(()=>{try{const v=JSON.parse(localStorage.getItem(storeKey)||'{}');setDone(v&&typeof v==='object'&&!Array.isArray(v)?v:{});}catch{setDone({});}},[storeKey]);
  const toggle=(k:string)=>setDone(p=>{const n={...p};if(n[k])delete n[k];else n[k]=new Date().toISOString();try{localStorage.setItem(storeKey,JSON.stringify(n));}catch{}return n;});
  const active=useMemo(()=>[...all].sort((a,b)=>Number(!!done[a.key])-Number(!!done[b.key])),[all,done]);
  const pending=active.filter(n=>!done[n.key]).length;
  const status=useMemo(()=>taskState(repo,scope,now,busy),[repo,scope,now,busy]);
  useEffect(()=>{setPage(0);setManual('');setFeedback('');},[scope.owner,scope.role,scope.type,scope.stages.join(','),repo.account]);
  const pages=Math.max(1,Math.ceil(active.length/6)), current=Math.min(page,pages-1);
  const copy=async()=> {
    const result=copyNotices(repo,scope,Date.now());
    const ok=await writeClipboard(result.text,navigator.clipboard);
    if(ok) {setFeedback(result.count ? `${result.count} copiadas${result.complete?'':' (parcial)'}` : 'Nada que copiar.');setManual('');}
    else {setFeedback('Tu navegador bloqueó el portapapeles. Copia desde el cuadro.');setManual(result.text);}
  };
  const heading=status.state==='syncing'?'Revisando…':status.state==='error'?'⚠️ No pudimos actualizar.':status.state==='clear'?'🌤️ Nada que alertar. Sigue con tu día.':'🔍 Sin alertas registradas';
  const short=status.state==='clear'?'Todo al día':status.state==='error'?'Sin conexión':status.state==='syncing'?'…':'Sin alertas';
  return <TooltipProvider><Popover open={open} onOpenChange={setOpen}>
    <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><Button variant="outline" size="icon" aria-label={`Tareas comerciales: ${pending} por hacer`} className="notification-bell">
      <Bell aria-hidden="true" className="size-5"/><span className="notification-count">{repo.syncedAt ? pending : '…'}</span>
    </Button></PopoverTrigger></TooltipTrigger><TooltipContent>Tareas comerciales</TooltipContent></Tooltip>
    <PopoverContent align="end" className="notification-popup" role="dialog" aria-label="Tareas comerciales">
      <header className="flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-lg text-foreground">Tareas</h2>
        <p className="text-xs text-body" aria-live="polite">{pending ? `${pending} por hacer` : active.length ? 'Sin pendientes' : short}</p></div>
        <div className="flex gap-1"><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Copiar todas las tareas" disabled={!active.length} onClick={()=>void copy()}><Copy aria-hidden="true" className="size-4"/></Button></TooltipTrigger><TooltipContent>Copiar todas las tareas</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Actualizar tareas" disabled={busy} onClick={onRefresh}><RefreshCw aria-hidden="true" className={`size-4 ${busy?'animate-spin':''}`}/></Button></TooltipTrigger><TooltipContent>Actualizar ahora</TooltipContent></Tooltip></div></header>
      {status.state==='unknown' && active.length ? <p role="status" className="text-xs text-warning">Falta corroborar la fuente; el conteo puede estar incompleto.</p>:null}
      {feedback ? <p role="status" className="text-xs text-body">{feedback}</p>:null}
      {manual ? <textarea aria-label="Tareas para copiar manualmente" readOnly value={manual} className="w-full h-36 rounded-md border border-border bg-background p-2 text-xs" onFocus={e=>e.currentTarget.select()}/>:null}
      {!active.length ? <div className="notification-empty" role="status">
        <p className="text-base text-foreground">{heading}</p>
        {status.state==='unknown' ? <p className="text-xs text-warning">{status.note}</p>:null}
        {status.state==='error' ? <p className="text-xs text-body">Mostramos lo último conocido. <button type="button" className="text-brand underline" onClick={onRefresh}>Reintentar</button></p>:null}
      </div>:null}
      <div className="notification-list">
        {active.slice(current*6,current*6+6).map(n=>{const r=n.record,proof=attestation(r,now);const checked=!!done[n.key];return <article className={`notification-item notification-task ${checked?'is-done':''}`} key={n.key}>
          <div className="flex justify-between items-start gap-2"><button type="button" role="checkbox" aria-checked={checked} aria-label={`Marcar tarea ${r.name} como ${checked?'pendiente':'hecha'}`} onClick={()=>toggle(n.key)} className="task-check"><Check aria-hidden="true" className="size-3"/></button><a href={crmUrl(r.id)} target="_blank" rel="noreferrer" className="font-semibold text-foreground break-words">{r.name}<ExternalLink aria-hidden="true" className="inline size-3 ml-1"/></a><span className="text-xs text-warning shrink-0">{checked?'Hecha':n.status==='nueva'?'Nueva':''}</span></div>
          <p className="text-xs text-body">{r.stage} · {r.risks.map(k=>RISK_LABELS[k]??'Categoría no corroborada').join(' · ')}{!proof||n.blocked?' · sin corroborar':''}</p>
          <p className="text-xs text-body">{suggestion(n)}</p>
          <details><summary className="text-xs text-brand cursor-pointer">Evidencia y acciones</summary>
            <p className="text-xs text-body">Deal {r.id} · revisión {santiago(r.reviewedAt)} · primera observación {santiago(n.firstObserved)} · última lectura {santiago(n.lastObserved)}</p>
            <p className="text-xs text-body whitespace-pre-wrap break-words">{r.evidence || 'Sin evidencia registrada'}</p>
            {proof?.sources.map(s=><a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="block text-xs text-brand">Fuente {s.id} · {santiago(s.at)}</a>)}
            <p className="text-xs text-body">Score Adobo: {r.score??'sin dato'} /100 · Probabilidad CRM: {r.probability==null?'sin dato':`${r.probability}%`} · medidas independientes</p>
            <p className="text-xs text-body">{r.money.length?r.money.map(m=>`${m.value} ${m.currency} · ${m.unit}`).join(' / '):'Monto: sin dato verificado'}</p>
            <p className="text-xs text-body">Responsable y fecha comprometida: por definir · {n.blocked || (proof?'Vigencia corroborada':'Revisión del productor vencida o no corroborada')}</p>
            <div className="flex flex-wrap gap-2 mt-2"><Button variant="outline" size="sm" disabled><Mail className="size-3"/>Preparar correo</Button><Button variant="outline" size="sm" disabled><NotebookPen className="size-3"/>Registrar nota</Button><Button variant="outline" size="sm" disabled><CircleSlash className="size-3"/>Pasar a perdido</Button></div>
            <p className="text-xs text-body">Correo propio no conectado. Nota y cambio de etapa bloqueados hasta validar permisos, destino, evidencia concurrente y auditoría de confirmación.</p>
          </details>
        </article>;})}
      </div>
      {pages>1?<nav aria-label="Páginas de tareas" className="flex items-center justify-between"><Button variant="ghost" size="icon" aria-label="Página anterior" disabled={current===0} onClick={()=>setPage(current-1)}><ChevronLeft className="size-4"/></Button><span className="text-xs">{current+1} / {pages} · copia incluye todas</span><Button variant="ghost" size="icon" aria-label="Página siguiente" disabled={current===pages-1} onClick={()=>setPage(current+1)}><ChevronRight className="size-4"/></Button></nav>:null}
      <details className="notification-meta"><summary className="text-xs text-body cursor-pointer">Detalles de la lectura</summary>
        <p className="text-xs text-body">Rol: {scope.role} · Comercial: {scope.owner==='team'?'mi alcance autorizado':scope.owner} · Tipo: {scope.type} · sin filtro de fechas</p>
        <p className="text-xs text-body">Owner {repo.ownerId || 'por corroborar'} · última sincronización {santiago(repo.syncedAt)} (America/Santiago) · lectura automática cada 2 min · {status.uncertain} registros sin corroborar.</p>
        <p className="text-xs text-body">Trazabilidad: {repo.history.length ? repo.history.filter(h=>h.notice.record.ownerId===repo.ownerId).map((h,i)=><span key={i} className="block">{h.notice.record.name} · {h.reason} · {santiago(h.at)}<span className="block break-words">{h.evidence}</span></span>) : 'sin cambios registrados'}</p>
      </details>
    </PopoverContent>
  </Popover></TooltipProvider>;
}
