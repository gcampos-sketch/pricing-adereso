import { createHash } from 'node:crypto';
import { gateway, HubSpotRequestError, COMMERCIAL_PIPELINE } from './hubspot.server';
import { markdownToHubspotHtml } from './markdown';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

// New private table is intentionally not part of generated browser Database types.
const receipts = () => (supabaseAdmin as any).from('sales_note_receipts');
type Receipt={user_id:string;operation_id:string;deal_id:string;body_hash:string;occurred_at:string;status:string;note_id:string|null};
export type NoteResult = {ok:true;id:string} | {ok:false;error:string};
const sameNote=(note:{properties:Record<string,string|null>;associations?:{deals?:{results:{id:string}[]}}},dealId:string,html:string,at:string)=>
  note.properties['hs_note_body']===html && Date.parse(note.properties['hs_timestamp']??'')===Date.parse(at) && !!note.associations?.deals?.results.some(d=>d.id===dealId);

export async function createDealNote(dealId:string,body:string,userId:string,operationId:string,deps={receipts,gateway}):Promise<NoteResult> {
  const request=deps.gateway, store=deps.receipts;
  try { const deal=await request<{properties:Record<string,string|null>}>(`/crm/v3/objects/deals/${dealId}?properties=pipeline`); if(deal.properties['pipeline']!==COMMERCIAL_PIPELINE) return {ok:false,error:'Solo se permiten notas del pipeline Comercial Adereso.'}; } catch { return {ok:false,error:'No pudimos verificar el negocio en Comercial Adereso. La nota no se envió.'}; }
  const html=markdownToHubspotHtml(body), hash=createHash('sha256').update(html).digest('hex');
  const key={user_id:userId,operation_id:operationId,deal_id:dealId};
  const at=new Date().toISOString();
  const inserted=await store().insert({...key,body_hash:hash,occurred_at:at,status:'pending'}).select('*').maybeSingle();
  if(inserted.error && inserted.error.code!=='23505') return {ok:false,error:'No pudimos reservar el guardado. La nota no se envió; conserva el borrador e intenta nuevamente.'};
  let row:Receipt=inserted.data;
  let owns=!!row;
  if(!row) {
    const read=await store().select('*').match(key).single();
    if(read.error || !read.data) return {ok:false,error:'No pudimos consultar el estado del guardado. Conserva el borrador.'};
    row=read.data;
  }
  if(row.body_hash!==hash) return {ok:false,error:'El contenido cambió respecto del intento original. Reabre el formulario para preparar otra nota.'};
  const confirm=async(id:string)=>{
    const note=await request<{properties:Record<string,string|null>;associations?:{deals?:{results:{id:string}[]}}}>(`/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp&associations=deals`);
    if(!sameNote(note,dealId,html,row.occurred_at)) throw new Error('readback');
    const saved=await store().update({status:'confirmed',note_id:id}).match(key);
    if(saved.error) throw new Error('receipt');
    return {ok:true as const,id};
  };
  if(row.note_id) { try{return await confirm(row.note_id);}catch{return {ok:false,error:'La nota tiene un recibo, pero no pudimos confirmar su asociación. No la duplicamos; vuelve a consultar.'};} }
  if(!owns && row.status!=='rejected') {
    // Reconcile the exact occurrence and associated deal; never recreate an uncertain POST.
    try {
      let after:string|undefined;const seen=new Set<string>();
      do {
        const page=await request<{results:{id:string}[];paging?:{next?:{after?:string}}}>(`/crm/v3/objects/deals/${dealId}/associations/notes?limit=100${after?`&after=${encodeURIComponent(after)}`:''}`);
        for(const note of page.results) {
          const value=await request<{properties:Record<string,string|null>;associations?:{deals?:{results:{id:string}[]}}}>(`/crm/v3/objects/notes/${note.id}?properties=hs_note_body,hs_timestamp&associations=deals`);
          if(sameNote(value,dealId,html,row.occurred_at)) return await confirm(note.id);
        }
        after=page.paging?.next?.after;
        if(after && seen.has(after)) throw new Error('paging');
        if(after) seen.add(after);
      } while(after);
    } catch { /* state remains uncertain */ }
    return {ok:false,error:'El intento anterior sigue pendiente de confirmación en HubSpot. Conservamos el texto y no enviamos otra nota para evitar duplicados. Reintentar vuelve a consultar el resultado.'};
  }
  if(!owns) {
    const claim=await store().update({status:'pending'}).match({...key,status:'rejected'}).select('*');
    owns=!claim.error && claim.data?.length===1;
    if(!owns) return {ok:false,error:'Otro intento está comprobando el guardado. Espera y vuelve a consultar.'};
  }
  try {
    const created=await request<{id:string}>('/crm/v3/objects/notes',{method:'POST',body:JSON.stringify({properties:{hs_timestamp:row.occurred_at,hs_note_body:html},associations:[{to:{id:dealId},types:[{associationCategory:'HUBSPOT_DEFINED',associationTypeId:214}]}]})});
    const saved=await store().update({note_id:created.id}).match(key);
    if(saved.error) throw new Error('receipt');
    return await confirm(created.id);
  } catch(error) {
    const rejected=error instanceof HubSpotRequestError && [400,401,403,404,422,429].includes(error.status);
    await store().update({status:rejected?'rejected':'uncertain'}).match(key);
    return {ok:false,error:rejected?`HubSpot rechazó el guardado (${error.status}). ${error.status===403?'Revisar permiso de escritura de notas. ':''}El texto está conservado; puedes reintentar.`:'No pudimos confirmar el guardado. Conservamos el borrador y el recibo para reconciliar el intento sin duplicarlo.'};
  }
}
