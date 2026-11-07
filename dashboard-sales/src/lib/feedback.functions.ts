import {createServerFn} from '@tanstack/react-start';
import {requireMfa} from './require-mfa';
const views=new Set(['comercial','proyectos','embudo','partners','calidad','equipo','crecimiento','simulador','perdidas']);
export const submitDashboardFeedback=createServerFn({method:'POST'}).middleware([requireMfa]).inputValidator((input:{id:string;body:string;view:string})=>{
  if(!/^[0-9a-f-]{36}$/i.test(input.id)||typeof input.body!=='string'||!input.body.trim()||input.body.length>4000)throw new Error('Escribe un comentario de hasta 4000 caracteres.');
  return {id:input.id,body:input.body.trim(),view:views.has(input.view)?input.view:'comercial'};
}).handler(async({data,context})=>{
  const {saveDashboardFeedback}=await import('./feedback.server');
  return saveDashboardFeedback(context.userId,String((context.claims as {email?:string}).email??''),data);
});

export const pendingDashboardFeedback=createServerFn({method:'GET'}).middleware([requireMfa]).handler(async({context})=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {data,error}=await (supabaseAdmin as any).from('dashboard_feedback').select('id,body,view_name,created_at,linear_attempt_state').eq('user_id',context.userId).is('linear_issue_id',null).order('created_at',{ascending:false}).limit(20);
  if(error)throw new Error('No pudimos consultar los avisos pendientes.');
  return (data??[]) as {id:string;body:string;view_name:string;created_at:string;linear_attempt_state:string}[];
});
