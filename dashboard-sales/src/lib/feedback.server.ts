import {supabaseAdmin} from '@/integrations/supabase/client.server';
const table=()=> (supabaseAdmin as any).from('dashboard_feedback');
/** Persist first; the authorized feedback-to-Linear worker owns delivery and its receipt. */
export async function saveDashboardFeedback(userId:string,email:string,input:{id:string;body:string;view:string},deps={table}) {
  const store=deps.table;
  const inserted=await store().insert({id:input.id,user_id:userId,author_email:email,body:input.body,view_name:input.view}).select('*').maybeSingle();
  if(inserted.error && inserted.error.code!=='23505') return {ok:false,message:'No pudimos guardar. Tu texto sigue disponible.'};
  let row=inserted.data;
  if(!row) {const read=await store().select('*').eq('id',input.id).eq('user_id',userId).single();if(read.error)return {ok:false,message:'No pudimos consultar el recibo.'};row=read.data;}
  if(row.body!==input.body||row.view_name!==input.view)return {ok:false,message:'El comentario cambió respecto del intento anterior. Prepara un envío nuevo.'};
  return {ok:true,message:row.linear_issue_id?'Feedback recibido y registrado en Linear.':'Feedback guardado. Su issue de Dashboard comercial está en cola para Linear.'};
}
