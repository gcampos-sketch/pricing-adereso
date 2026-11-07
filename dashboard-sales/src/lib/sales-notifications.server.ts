import { gateway, COMMERCIAL_PIPELINE, type RawDeal } from './hubspot.server';
import { RISK_PROPERTIES, corroboratedOwner, emptyRepository, reconcile, type Repository, type RiskRecord } from './sales-notifications';

const VERSION = '2026-09';
const paths = { owners: `/crm/owners/${VERSION}`, stages: `/crm/pipelines/${VERSION}/deals/${COMMERCIAL_PIPELINE}/stages`,
  search: `/crm/objects/${VERSION}/deals/search`, batch: `/crm/objects/${VERSION}/deals/batch/read` };
const props = ['dealname','pipeline','dealstage','hubspot_owner_id','dealtype','adobo_closing_score','hs_deal_stage_probability',
  'hs_mrr','amount','otf','deal_currency_code', ...RISK_PROPERTIES];
const number = (s: string | null | undefined) => s?.trim() && Number.isFinite(Number(s)) ? Number(s) : null;
const date = (s: string | null | undefined) => {
  if (!s?.trim()) return null;
  const t = /^\d+$/.test(s) ? Number(s) : Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
export async function syncSalesNotifications(userId: string, email: string): Promise<Repository> {
  // Owner identity is corroborated on every read; no client owner IDs or team access fallback.
  const owners: {id: string; email?: string; firstName?: string; lastName?: string; archived?: boolean}[] = [];
  let cursor: string | undefined;
  do {
    const page = await gateway<{results: typeof owners; paging?: {next?: {after?: string}}}>(`${paths.owners}?limit=500${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`);
    owners.push(...page.results); cursor = page.paging?.next?.after;
  } while (cursor);
  const ownerId = corroboratedOwner(email, owners);
  if (!ownerId) return { ...emptyRepository(userId, ''), error: 'Tu cuenta no tiene un owner comercial único corroborado. Acceso a alertas bloqueado; no se asigna por nombre.' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const {data: stored, error: readError} = await supabaseAdmin.from('sales_notification_repositories').select('payload,revision').eq('user_id',userId).maybeSingle();
  if (readError) throw new Error('No se pudo leer el repositorio personal de alertas.');
  const parsed = stored?.payload as unknown as Repository | undefined;
  const previous = parsed?.version === 'sales-notifications/v1' && parsed.account === userId && parsed.ownerId === ownerId ? parsed : emptyRepository(userId,ownerId);
  const at = new Date().toISOString();
  let complete = true, failure: string | null = null;
  const raw: RawDeal[] = [];
  const stages = await gateway<{results: {id:string;label:string;metadata:{isClosed:string}}[]}>(paths.stages);
  // SALES-89: genuine open buying opportunities E1–E5.1. Expansion/prospecting E0 excluded.
  const openStages = stages.results.filter(s => s.metadata.isClosed === 'false' && /^[1-5](?:\.|\s)/.test(s.label));
  const stageNames = new Map(stages.results.map(s => [s.id,s.label]));
  try {
    let after: string | undefined;
    const seenCursors = new Set<string>();
    do {
      const page = await gateway<{results: RawDeal[];total?:number;paging?:{next?:{after?:string}}}>(paths.search, {method:'POST',body:JSON.stringify({
        filterGroups:[{filters:[{propertyName:'pipeline',operator:'EQ',value:COMMERCIAL_PIPELINE},
          {propertyName:'hubspot_owner_id',operator:'EQ',value:ownerId}]}], properties:props, limit:100, ...(after ? {after} : {}) })});
      raw.push(...page.results); after = page.paging?.next?.after;
      if (after && (seenCursors.has(after) || raw.length >= 10000)) {complete=false; break;}
      if (after) seenCursors.add(after);
      if (!after && typeof page.total === 'number' && new Set(raw.map(d=>d.id)).size < page.total) complete=false;
    } while (after);
    // Missing records never imply resolution. Read exact old IDs solely to corroborate handoff/revoked visibility.
    const found = new Set(raw.map(d=>d.id));
    const missing = previous.active.map(n=>n.record.id).filter(id=>!found.has(id));
    for(let i=0;i<missing.length;i+=50) {
      const batch = await gateway<{results:RawDeal[];errors?:unknown[];numErrors?:number}>(paths.batch,{method:'POST',body:JSON.stringify({properties:props,inputs:missing.slice(i,i+50).map(id=>({id}))})});
      raw.push(...batch.results);
      if(batch.errors?.length || batch.numErrors || batch.results.length < missing.slice(i,i+50).length) complete=false;
    }
  } catch { complete=false; failure='HubSpot no completó la lectura. Se conserva el último estado conocido; fuente desactualizada.'; }
  const records: RiskRecord[] = raw.map(d=> {
    const p=d.properties, owner=p['hubspot_owner_id'] ?? '', knownOwner=owners.find(o=>o.id===owner);
    const currency=p['deal_currency_code']?.trim();
    const money: RiskRecord['money']=[];
    if(currency && /^[A-Z]{3}$/.test(currency)) for(const [property,unit] of [['hs_mrr','MRR'],['amount','total CRM (periodicidad sin corroborar)'],['otf','setup']] as const) {
      const value=number(p[property]); if(value!==null) money.push({value,currency,unit});
    }
    const score=number(p['adobo_closing_score']), prob=number(p['hs_deal_stage_probability']);
    return {id:d.id,name:p['dealname'] || `Deal ${d.id}`,ownerId:owner,owner:knownOwner ? `${knownOwner.firstName ?? ''} ${knownOwner.lastName ?? ''}`.trim() : 'Sin owner confirmado',
      inScope:p['pipeline']===COMMERCIAL_PIPELINE && openStages.some(s=>s.id===p['dealstage']), stage:stageNames.get(p['dealstage'] ?? '') ?? 'sin etapa corroborada',
      segment:p['dealtype'] ?? '',state:p['adobo_alertas_estado'] ?? '',risks:(p['adobo_alertas_riesgo'] ?? '').split(';').map(x=>x.trim()).filter(Boolean),
      evidence:p['adobo_alertas_evidencia'] ?? '',reviewedAt:date(p['adobo_alertas_ultima_revision']),score:score!==null && score>=0 && score<=100 ? score : null,
      probability:prob!==null && prob>=0 && prob<=1 ? prob*100 : null,money};
  });
  let next = reconcile(previous,{account:userId,ownerId,records,complete,error:failure || (!complete ? 'Lectura parcial; sin retiro de alertas.' : null),at},Date.now());
  // CAS protects concurrent tabs/read recovery. A loser never overwrites a newer repository.
  const {data:saved,error:saveError}=await supabaseAdmin.rpc('save_sales_notifications',{p_user:userId,p_revision:stored?.revision ?? 0,p_payload:JSON.parse(JSON.stringify(next))});
  if(saveError) return {...next,complete:false,error:'No se pudo guardar la trazabilidad; lectura disponible, sincronización incompleta.'};
  if(!saved) {
    const {data:latest,error}=await supabaseAdmin.from('sales_notification_repositories').select('payload').eq('user_id',userId).single();
    if(!error) next=latest.payload as unknown as Repository;
  }
  return next;
}