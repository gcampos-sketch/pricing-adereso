import {useRef,useState} from 'react';
import {CalendarPlus,Check} from 'lucide-react';
import {saveQuotaScenario} from '@/lib/quota-scenarios.functions';
import {scenarioMonths,scenarioMonthLabel,type ScenarioScope} from '@/lib/quota-scenarios';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
export function ScenarioSaveButton({scope,ids,expected,simulationMonth,onSaved}:{scope:ScenarioScope;ids:string[];simulationMonth:string;onSaved?:()=>void;expected:{target:number;baseline:number;quota:number}}) {
 const [state,setState]=useState<'idle'|'saving'|'saved'|'error'>('idle');
 const [open,setOpen]=useState(false),[chosenMonth,setChosenMonth]=useState(simulationMonth);
 const months=scenarioMonths(scope.periods),month=months.includes(chosenMonth)?chosenMonth:simulationMonth;
 const [message,setMessage]=useState('');
 const selectedMonth=useRef<HTMLButtonElement>(null);
 const attempt=useRef<{key:string;id:string}|null>(null);
 const key=JSON.stringify({scope,ids:[...ids].sort(),expected,simulationMonth:month});
 const [savedKey,setSavedKey]=useState('');
 const saved=state==='saved'&&savedKey===key;
 const confirm=async()=>{
  if(state==='saving'||saved)return;
  if(!attempt.current||attempt.current.key!==key)attempt.current={key,id:crypto.randomUUID()};
  setState('saving');setMessage('');
  try{const result=await saveQuotaScenario({data:{requestId:attempt.current.id,scope,ids,expected,simulationMonth:month}});setSavedKey(key);setState('saved');onSaved?.();setOpen(false);setMessage(`Guardado · ${new Date(result.createdAt).toLocaleString('es-CL')}`);}
  catch(error){setState('error');setMessage(error instanceof Error?error.message:'No se pudo guardar. Reintenta.');}
 };
 return <div className="scenario-save"><Popover open={open} onOpenChange={value=>{if(state==='saving')return;setOpen(value);if(value&&savedKey!==key){setChosenMonth(simulationMonth);setMessage('');}}}>
  <PopoverTrigger asChild><button className="pill scenario-create-trigger" type="button" disabled={state==='saving'}>{saved?<Check size={15}/>:<CalendarPlus size={15}/>} {saved?'Escenario guardado':'Crear escenario'}</button></PopoverTrigger>
  <PopoverContent className="scenario-confirm-popover scenario-month-popover" aria-label="Crear escenario" align="start" sideOffset={8} data-scenario-confirm="" onOpenAutoFocus={event=>{event.preventDefault();selectedMonth.current?.focus();}} onEscapeKeyDown={event=>event.stopPropagation()}>
   <h4>{ids.length===1?'¿Cuándo cerraría?':'¿Cuándo cerrarían?'}</h4>
   <p className="scenario-month-hint">Elige el mes de cierre para {ids.length===1?'el negocio seleccionado':`los ${ids.length} negocios seleccionados`}.</p>
   <div className="scenario-month-grid" role="group" aria-label="Mes de cierre del escenario">
    {months.map(m=><button key={m} ref={month===m?selectedMonth:undefined} type="button" aria-label={scenarioMonthLabel(m)} aria-pressed={month===m} disabled={state==='saving'} onClick={()=>setChosenMonth(m)}><span>{new Date(`${m}-01T12:00:00Z`).toLocaleDateString('es-CL',{month:'long',timeZone:'UTC'})}</span><small>{m.slice(0,4)}</small></button>)}
   </div>
   {state==='error'&&message?<p role="alert">{message}</p>:null}
   <div className="scenario-confirm-actions"><button type="button" disabled={state==='saving'} onClick={()=>setOpen(false)}>Cancelar</button><button type="button" disabled={state==='saving'||saved||!months.includes(month)} onClick={()=>void confirm()}>{state==='saving'?'Creando…':saved?'Creado':'Crear escenario'}</button></div>
  </PopoverContent>
 </Popover><span role="status">{savedKey===key&&state==='saved'?message:''}</span></div>;
}
