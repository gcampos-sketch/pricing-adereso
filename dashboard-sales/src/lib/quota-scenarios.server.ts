import {supabaseAdmin} from '@/integrations/supabase/client.server';
import {buildQuotaScenario,type QuotaScenario,type ScenarioRequest} from './quota-scenarios';
// Server-only immutable snapshots. The authenticated user is never supplied by the client.
const table=()=>supabaseAdmin.from('quota_scenarios' as never);
export async function listScenarios(userId:string):Promise<QuotaScenario[]> {
 const result:QuotaScenario[]=[];
 for(let start=0;;start+=200){
  const {data,error}=await table().select('payload').eq('user_id',userId).order('created_at',{ascending:false}).order('id').range(start,start+199);
  if(error)throw Error('No se pudo leer el historial de escenarios.');
  const rows=data as unknown as {payload:QuotaScenario}[];result.push(...rows.map(r=>r.payload));if(rows.length<200)return result;
 }
}
export async function saveScenario(userId:string,input:ScenarioRequest):Promise<QuotaScenario> {
 const {data:existing,error:readError}=await table().select('payload').eq('user_id',userId).eq('id',input.requestId).maybeSingle();
 if(readError)throw Error('No se pudo comprobar el guardado.');
 if(existing)return (existing as unknown as {payload:QuotaScenario}).payload;
 const {readPulseReport}=await import('./pulse-loader.server');
 const report=await readPulseReport(false,input.scope.role==='all'?undefined:input.scope.role);
 const snapshot=buildQuotaScenario(report,input,new Date().toISOString());
 const {data,error}=await table().insert({id:snapshot.id,user_id:userId,payload:snapshot} as never).select('payload').single();
 if(error){
  if(error.code==='23505'){const {data:retry}=await table().select('payload').eq('user_id',userId).eq('id',snapshot.id).single();if(retry)return (retry as unknown as {payload:QuotaScenario}).payload;}
  throw Error('No se pudo guardar el escenario. Puedes reintentar sin duplicarlo.');
 }
 return (data as unknown as {payload:QuotaScenario}).payload;
}
