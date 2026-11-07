import {useEffect,useRef,useState} from 'react';
import {MessageSquare,X} from 'lucide-react';
import {submitDashboardFeedback,pendingDashboardFeedback} from '@/lib/feedback.functions';
export function FeedbackBubble({view}:{view:string}) {
  const [open,setOpen]=useState(false),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[saved,setSaved]=useState(false);
  const [pending,setPending]=useState<Awaited<ReturnType<typeof pendingDashboardFeedback>>>([]);
  useEffect(()=>{let cancelled=false;if(open)void pendingDashboardFeedback().then(rows=>{if(!cancelled)setPending(rows);}).catch(()=>{});return()=>{cancelled=true;};},[open,saved]);
  const retry=async(row:typeof pending[number])=>{if(lock.current)return;lock.current=true;setBusy(true);try{const result=await submitDashboardFeedback({data:{id:row.id,body:row.body,view:row.view_name}});setMessage(result.message);setPending(await pendingDashboardFeedback());}catch{setMessage('No pudimos comprobar el issue. El comentario sigue guardado.');}finally{lock.current=false;setBusy(false);}};
  const request=useRef({id:crypto.randomUUID(),body:'',view}),lock=useRef(false);
  const send=async()=>{
    if(lock.current||!body.trim())return;lock.current=true;setBusy(true);
    if(request.current.body!==body.trim())request.current={id:crypto.randomUUID(),body:body.trim(),view};
    try{const result=await submitDashboardFeedback({data:request.current});setMessage(result.message);setSaved(result.ok);}catch{setMessage('No pudimos guardar. Conservamos tu comentario para reintentar.');}finally{lock.current=false;setBusy(false);}
  };
  return <aside className="feedback-bubble"><button type="button" aria-label="Dejar feedback del dashboard" aria-expanded={open} onClick={()=>setOpen(!open)}><MessageSquare size={18}/></button>{open?<section role="dialog" aria-label="Feedback del dashboard"><header><strong>¿Qué mejorarías?</strong><button type="button" aria-label="Cerrar feedback" onClick={()=>setOpen(false)}><X size={16}/></button></header><p>Tu comentario se guarda con tu cuenta y entra a la cola de issues de Dashboard comercial en Linear. No se adjuntan datos de deals ni capturas.</p><textarea aria-label="Tu comentario" maxLength={4000} rows={5} value={body} onChange={e=>{setBody(e.target.value);setSaved(false);setMessage('');}}/><p role="status">{message}</p><button type="button" disabled={busy||!body.trim()} onClick={()=>void send()}>{busy?'Guardando…':saved?'Consultar estado':'Enviar feedback'}</button>{saved?<button type="button" onClick={()=>{setBody('');setMessage('');setSaved(false);}}>Nuevo comentario</button>:null}{pending.length?<details><summary>Mis issues en cola · {pending.length}</summary>{pending.map(row=><p key={row.id}>{row.body.slice(0,80)} <button type="button" disabled={busy} onClick={()=>void retry(row)}>Consultar estado</button></p>)}</details>:null}</section>:null}</aside>;
}
