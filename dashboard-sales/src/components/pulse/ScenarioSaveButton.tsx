import {useRef,useState} from 'react';
import {Save,Check} from 'lucide-react';
import {saveQuotaScenario} from '@/lib/quota-scenarios.functions';
import type {ScenarioScope} from '@/lib/quota-scenarios';
export function ScenarioSaveButton({scope,ids,expected,simulationMonth}:{scope:ScenarioScope;ids:string[];simulationMonth:string;expected:{target:number;baseline:number;quota:number}}) {
 const [state,setState]=useState<'idle'|'saving'|'saved'|'error'>('idle');
 const [message,setMessage]=useState('');
 const attempt=useRef<{key:string;id:string}|null>(null);
 const key=JSON.stringify({scope,ids:[...ids].sort(),expected,simulationMonth});
 const [savedKey,setSavedKey]=useState('');
 const saved=state==='saved'&&savedKey===key;
 return <div className="scenario-save"><button className="pill" type="button" disabled={state==='saving'||saved} onClick={async()=>{
  if(!attempt.current||attempt.current.key!==key)attempt.current={key,id:crypto.randomUUID()};
  setState('saving');setMessage('');
  try{const result=await saveQuotaScenario({data:{requestId:attempt.current.id,scope,ids,expected,simulationMonth}});setSavedKey(key);setState('saved');setMessage(`Guardado · ${new Date(result.createdAt).toLocaleString('es-CL')} · disponible en Escenarios`);}
  catch(error){setState('error');setMessage(error instanceof Error?error.message:'No se pudo guardar. Reintenta.');}
 }}>{saved?<Check size={15}/>:<Save size={15}/>} {state==='saving'?'Guardando…':saved?'Escenario guardado':'Guardar escenario'}</button><span role="status">{savedKey===key || (state==='error'&&attempt.current?.key===key) ? message : ''}</span></div>;
}
