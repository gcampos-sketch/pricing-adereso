import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Check, Bell, Copy, RefreshCw, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useAccountEmail } from '@/components/AuthGate';
import { useRefreshMenu } from '@/contexts/RefreshContext';
import { getSalesNotifications } from '@/lib/sales-notifications.functions';
import { attestation, emptyRepository, santiago, SYNC_INTERVAL_MS, taskState, visibleNotices, writeClipboard, type NoticeScope, type Repository } from '@/lib/sales-notifications';
import { copyReviewTasks, reviewQueue, TASK_KINDS, type ReviewTask, type TaskKind } from '@/lib/dashboard-tasks';

const EMPTY_TASKS: ReviewTask[] = [];
type TaskProps = {scope:NoticeScope; tasks?:ReviewTask[]; generatedAt?:string; accountKey?:string};
export function NotificationCenter({scope,tasks=EMPTY_TASKS,generatedAt}: TaskProps) {
  const account=useAccountEmail();
  return account ? <NotificationLoader key={account} account={account} scope={scope} tasks={tasks} {...(generatedAt ? {generatedAt} : {})}/> : null;
}
function NotificationLoader({account,scope,tasks,generatedAt}: TaskProps & {account:string}) {
  const load=useServerFn(getSalesNotifications);
  const refreshMenu=useRefreshMenu();
  const [repo,setRepo]=useState<Repository>(()=>emptyRepository(account,''));
  const [busy,setBusy]=useState(false), [refresh,setRefresh]=useState(0);
  useEffect(()=> {
    let disposed=false, timer:ReturnType<typeof setTimeout>;
    const sync=async()=> {
      setBusy(true);
      try { const next=await load(); if(!disposed) setRepo(next); }
      catch { if(!disposed) setRepo(p=>({...p,complete:false,error:'No se pudieron actualizar los riesgos Adobo. Se conservan las alertas conocidas.'})); }
      finally { if(!disposed) {setBusy(false);timer=setTimeout(()=>void sync(),SYNC_INTERVAL_MS);} }
    };
    void sync();
    return ()=>{disposed=true;clearTimeout(timer);};
  },[load,refresh]);
  return <NotificationCenterView repo={repo} scope={scope} accountKey={account} {...(tasks ? {tasks} : {})} {...(generatedAt ? {generatedAt} : {})} busy={busy || refreshMenu.isRefreshing} onRefresh={()=>{setRefresh(n=>n+1);refreshMenu.onRefresh?.();}}/>;
}

/** The same production view is available for fixture verification, without an auth bypass. */
export function NotificationCenterView({repo,scope,tasks=EMPTY_TASKS,generatedAt,accountKey,busy=false,onRefresh}: TaskProps & {repo:Repository;busy?:boolean;onRefresh:()=>void}) {
  const [open,setOpen]=useState(false), [page,setPage]=useState(0), [feedback,setFeedback]=useState(''), [manual,setManual]=useState('');
  const [kind,setKind]=useState<'all'|TaskKind>('all');
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30_000);return()=>clearInterval(t);},[]);
  const queue=useMemo(()=>reviewQueue(tasks,visibleNotices(repo,scope)),[tasks,repo,scope]);
  // Reviewing a task never resolves its CRM signal. Changed evidence creates a new key.
  const storeKey=`sales-tasks/v2:${accountKey ?? repo.account}`;
  const [done,setDone]=useState<Record<string,string>>({});
  useEffect(()=>{try{const v=JSON.parse(localStorage.getItem(storeKey)||'{}');setDone(v&&typeof v==='object'&&!Array.isArray(v)?v:{});}catch{setDone({});}},[storeKey]);
  const toggle=(key:string)=>setDone(previous=>{const next={...previous};if(next[key])delete next[key];else next[key]=new Date().toISOString();try{localStorage.setItem(storeKey,JSON.stringify(next));}catch{}return next;});
  const active=useMemo(()=>queue.filter(t=>kind==='all'||t.reasons.some(r=>r.kind===kind)).sort((a,b)=>Number(!!done[a.key])-Number(!!done[b.key])),[queue,kind,done]);
  const pending=queue.filter(t=>!done[t.key]).length;
  const status=useMemo(()=>taskState(repo,scope,now,busy),[repo,scope,now,busy]);
  useEffect(()=>{setPage(0);setManual('');setFeedback('');setKind('all');},[scope.owner,scope.role,scope.type,scope.stages.join(','),repo.account]);
  const pages=Math.max(1,Math.ceil(active.length/6)), current=Math.min(page,pages-1);
  const copy=async()=> {
    const text=copyReviewTasks(queue,generatedAt ?? repo.syncedAt);
    const ok=await writeClipboard(text,navigator.clipboard);
    if(ok) {setFeedback(`${queue.length} tareas copiadas.`);setManual('');}
    else {setFeedback('Tu navegador bloqueó el portapapeles. Copia desde el cuadro.');setManual(text);}
  };
  return <TooltipProvider><Popover open={open} onOpenChange={setOpen}>
    <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><Button variant="outline" size="icon" aria-label={`Tareas comerciales: ${pending} por revisar`} className="notification-bell">
      <Bell aria-hidden="true" className="size-5"/><span className="notification-count">{generatedAt || repo.syncedAt ? pending : busy ? '…' : pending}</span>
    </Button></PopoverTrigger></TooltipTrigger><TooltipContent>Pendientes de revisión</TooltipContent></Tooltip>
    <PopoverContent align="end" className="notification-popup" role="dialog" aria-label="Tareas comerciales">
      <header className="flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-lg text-foreground">Pendientes de revisión</h2>
        <p className="text-xs text-body" aria-live="polite">{pending} por revisar · {queue.length} negocios</p></div>
        <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Copiar todas las tareas" disabled={!queue.length} onClick={()=>void copy()}><Copy aria-hidden="true" className="size-4"/></Button>
        <Button variant="ghost" size="icon" aria-label="Actualizar tareas y panel" disabled={busy} onClick={onRefresh}><RefreshCw aria-hidden="true" className={`size-4 ${busy?'animate-spin':''}`}/></Button></div></header>
      <p className="text-xs text-muted-foreground">Avisos actuales del panel y tus riesgos Adobo. Sin filtro de año/trimestre.</p>
      <div className="notification-filters" aria-label="Tipos de pendientes">
        <button type="button" aria-pressed={kind==='all'} onClick={()=>{setKind('all');setPage(0);}}>Todos · {queue.length}</button>
        {(Object.keys(TASK_KINDS) as TaskKind[]).map(k=><button type="button" key={k} aria-pressed={kind===k} onClick={()=>{setKind(k);setPage(0);}}>{TASK_KINDS[k]} · {queue.filter(t=>t.reasons.some(r=>r.kind===k)).length}</button>)}
      </div>
      {repo.error ? <p role="status" className="text-xs text-warning">No pudimos actualizar los riesgos Adobo. Los avisos del panel siguen disponibles.</p> : status.state==='unknown' ? <p role="status" className="text-xs text-muted-foreground">Algunas señales Adobo no tienen vigencia corroborada; se muestran para revisión.</p> : null}
      {feedback ? <p role="status" className="text-xs text-body">{feedback}</p>:null}
      {manual ? <textarea aria-label="Tareas para copiar manualmente" readOnly value={manual} className="w-full h-36 rounded-md border border-border bg-background p-2 text-xs" onFocus={e=>e.currentTarget.select()}/>:null}
      {!active.length ? <div className="notification-empty" role="status"><p className="text-foreground">{busy && !generatedAt ? 'Revisando pendientes…' : 'No hay pendientes registrados en este alcance.'}</p><p className="text-xs text-body">{kind==='all' && status.state!=='clear' ? 'La lectura de riesgos Adobo puede estar incompleta; cero registros no confirma ausencia de riesgo.' : 'Puedes cambiar los filtros o actualizar la lectura.'}</p></div>:null}
      <div className="notification-list">
        {active.slice(current*6,current*6+6).map(t=>{const checked=!!done[t.key], notice=t.notice, proof=notice ? attestation(notice.record,now) : null;return <article className={`notification-item notification-task ${checked?'is-done':''}`} key={t.key}>
          <div className="notification-task-heading"><button type="button" role="checkbox" aria-checked={checked} aria-label={`Marcar revisión de ${t.name} como ${checked?'pendiente':'revisada'}`} onClick={()=>toggle(t.key)} className="task-check"><Check aria-hidden="true" className="size-3"/></button><a href={t.url} target="_blank" rel="noreferrer" className="font-semibold text-foreground break-words">{t.name}<ExternalLink aria-hidden="true" className="inline size-3 ml-1"/></a>{checked ? <span className="text-xs text-muted-foreground">Revisada</span> : null}</div>
          <p className="text-xs text-muted-foreground">{t.owner || 'Sin responsable'} · {t.stage}</p>
          <div className="notification-task-reasons">{t.reasons.map((r,i)=><div key={`${r.kind}:${i}`}><strong>{TASK_KINDS[r.kind]}</strong><p>{r.action}</p></div>)}</div>
          <details><summary className="text-xs text-brand cursor-pointer">Ver evidencia</summary>
            {t.reasons.map((r,i)=><p key={i} className="text-xs text-body mt-2">{r.evidence}</p>)}
            {notice ? <><p className="text-xs text-body mt-2">Adobo: {proof && !notice.blocked ? 'evidencia vigente corroborada' : 'vigencia o cobertura sin corroborar'} · revisión {santiago(notice.record.reviewedAt)}</p><p className="text-xs text-body whitespace-pre-wrap break-words">{notice.record.evidence || 'Sin evidencia registrada'}</p>{proof?.sources.map(s=><a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="block text-xs text-brand">Fuente {s.id} · {santiago(s.at)}</a>)}</> : null}
          </details>
        </article>;})}
      </div>
      {pages>1?<nav aria-label="Páginas de tareas" className="flex items-center justify-between"><Button variant="ghost" size="icon" aria-label="Página anterior" disabled={current===0} onClick={()=>setPage(current-1)}><ChevronLeft className="size-4"/></Button><span className="text-xs">{current+1} / {pages} · copiar incluye todas</span><Button variant="ghost" size="icon" aria-label="Página siguiente" disabled={current===pages-1} onClick={()=>setPage(current+1)}><ChevronRight className="size-4"/></Button></nav>:null}
      <p className="text-xs text-muted-foreground">Marcar revisada solo afecta tu lista personal; no modifica ni resuelve el aviso en HubSpot. Si cambia la evidencia, vuelve a quedar pendiente.</p>
      <details className="notification-meta"><summary className="text-xs text-body cursor-pointer">Detalles de la lectura</summary>
        <p className="text-xs text-body">Panel: {santiago(generatedAt ?? null)} · Adobo personal: {santiago(repo.syncedAt)} · {scope.owner==='team'?'Equipo del panel autorizado':`Comercial ${scope.owner}`} · rol {scope.role} · tipo {scope.type} · etapas {scope.stages.join(', ') || 'todas'}.</p>
        <p className="text-xs text-body">Los checks son locales a esta cuenta. Los riesgos Adobo mantienen su repositorio y alcance personal; {status.uncertain} registros sin corroborar.</p>
      </details>
    </PopoverContent>
  </Popover></TooltipProvider>;
}
