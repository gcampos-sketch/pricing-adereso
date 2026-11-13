import {useRef,useState} from 'react';
import {CalendarPlus,Check} from 'lucide-react';
import {saveQuotaScenario} from '@/lib/quota-scenarios.functions';
import {scenarioMonths,scenarioMonthLabel,scenarioQuarterLabel,type ScenarioScope} from '@/lib/quota-scenarios';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
export function ScenarioSaveButton({scope,ids,expected,simulationMonth,onSaved}:{scope:ScenarioScope;ids:string[];simulationMonth:string;onSaved?:()=>void;expected:{target:number;baseline:number;quota:number}}) {
 const [state,setState]=useState<'idle'|'saving'|'saved'|'error'>('idle');
 const [open,setOpen]=useState(false),[chosenMonth,setChosenMonth]=useState(simulationMonth);
 const [timing,setTiming]=useState<'month'|'quarter'>('month'),[chosenQuarter,setChosenQuarter]=useState(scope.periods[0]??'');
 const quarter=scope.periods.includes(chosenQuarter)?chosenQuarter:scope.periods[0]??'';
 const months=scenarioMonths(scope.periods),month=months.includes(chosenMonth)?chosenMonth:simulationMonth;
 const timingData=timing==='quarter'?{simulationQuarter:quarter}:{simulationMonth:month};
 const [message,setMessage]=useState('');
 const selectedMonth=useRef<HTMLButtonElement>(null);
 const attempt=useRef<{key:string;id:string}|null>(null);
 const key=JSON.stringify({scope,ids:[...ids].sort(),expected,...timingData});
 const [savedKey,setSavedKey]=useState('');
 const saved=state==='saved'&&savedKey===key;
 const confirm=async()=>{
  if(state==='saving'||saved)return;
  if(!attempt.current||attempt.current.key!==key)attempt.current={key,id:crypto.randomUUID()};
  setState('saving');setMessage('');
  try{const result=await saveQuotaScenario({data:{requestId:attempt.current.id,scope,ids,expected,...timingData}});setSavedKey(key);setState('saved');onSaved?.();setOpen(false);setMessage(`Guardado · ${new Date(result.createdAt).toLocaleString('es-CL')}`);}
  catch(error){setState('error');setMessage(error instanceof Error?error.message:'No se pudo guardar. Reintenta.');}
 };
 return <div className="scenario-save"><Popover open={open} onOpenChange={value=>{if(state==='saving')return;setOpen(value);if(value&&savedKey!==key){setChosenMonth(simulationMonth);setChosenQuarter(scope.periods[0]??'');setMessage('');}}}>
  <PopoverTrigger asChild><button className="pill scenario-create-trigger" type="button" disabled={state==='saving'}>{saved?<Check size={15}/>:<CalendarPlus size={15}/>} {saved?'Escenario guardado':'Crear escenario'}</button></PopoverTrigger>
  <PopoverContent className="scenario-confirm-popover scenario-month-popover" aria-label="Crear escenario" align="start" sideOffset={8} data-scenario-confirm="" onOpenAutoFocus={event=>{event.preventDefault();selectedMonth.current?.focus();}} onEscapeKeyDown={event=>event.stopPropagation()}>
   <h4>¿Para cuándo?</h4>
   <div className="scenario-timing-toggle" role="group" aria-label="Alcance del escenario">
    <button type="button" aria-pressed={timing==='month'} disabled={state==='saving'} onClick={()=>setTiming('month')}>Mes</button>
    <button type="button" aria-pressed={timing==='quarter'} disabled={state==='saving'} onClick={()=>setTiming('quarter')}>Trimestre</button>
   </div>
   <p className="scenario-month-hint">{timing==='month'?'Cierre en el mes elegido.':'Cierre durante el trimestre, sin fijar un mes.'}</p>
   <div className={`scenario-month-grid ${timing==='quarter'?'scenario-quarter-grid':''}`} role="group" aria-label={timing==='month'?'Mes de cierre del escenario':'Trimestre de cierre del escenario'}>
    {timing==='month'?months.map(m=><button key={m} ref={month===m?selectedMonth:undefined} type="button" aria-label={scenarioMonthLabel(m)} aria-pressed={month===m} disabled={state==='saving'} onClick={()=>setChosenMonth(m)}><span>{new Date(`${m}-01T12:00:00Z`).toLocaleDateString('es-CL',{month:'long',timeZone:'UTC'})}</span><small>{m.slice(0,4)}</small></button>):scope.periods.map(q=><button key={q} ref={quarter===q?selectedMonth:undefined} type="button" aria-label={scenarioQuarterLabel(q)} aria-pressed={quarter===q} disabled={state==='saving'} onClick={()=>setChosenQuarter(q)}><span>{scenarioQuarterLabel(q)}</span><small>Trimestre completo</small></button>)}
   </div>
   {state==='error'&&message?<p role="alert">{message}</p>:null}
   <div className="scenario-confirm-actions"><button type="button" disabled={state==='saving'} onClick={()=>setOpen(false)}>Cancelar</button><button type="button" disabled={state==='saving'||saved||(timing==='month'?!months.includes(month):!scope.periods.includes(quarter))} onClick={()=>void confirm()}>{state==='saving'?'Creando…':saved?'Creado':'Crear escenario'}</button></div>
  </PopoverContent>
 </Popover><span role="status">{savedKey===key&&state==='saved'?message:''}</span></div>;
}
