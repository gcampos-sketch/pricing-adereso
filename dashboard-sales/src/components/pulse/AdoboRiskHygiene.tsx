import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useAccountEmail} from '@/components/AuthGate';
import {getSalesNotifications} from '@/lib/sales-notifications.functions';
import {attestation,riskScoreCross,crmUrl,RISK_LABELS,santiago,SYNC_INTERVAL_MS,type NoticeScope} from '@/lib/sales-notifications';
import {roleOfOwner} from '@/lib/owner-roles';
import {useLiveNow} from './AdoboIntelligence';

const states:Record<string,string>={alertas_activas:'Alertas registradas',sin_riesgo_verificado:'Sin riesgo en las señales evaluadas',pausa_acordada:'Pausa registrada',cobertura_insuficiente:'Cobertura insuficiente'};
export function AdoboRiskHygiene({scope}:{scope:NoticeScope}) {
  const account=useAccountEmail(),[open,setOpen]=useState(false),[category,setCategory]=useState('all');
  const now=useLiveNow(Date.now());
  const query=useQuery({queryKey:['sales-risk-hygiene',account],enabled:open&&!!account,queryFn:()=>getSalesNotifications(),refetchInterval:open?SYNC_INTERVAL_MS:false});
  const repo=query.data;
  const records=[...new Map((repo?.records??[]).filter(r=>r.inScope && r.ownerId===repo?.ownerId && (scope.owner==='team'||scope.owner===r.ownerId) && (scope.role==='all'||roleOfOwner(r.ownerId)===scope.role) && (scope.type==='all'||({inbound:'Inbound',outbound:'Outbound',upsell:'Upsell',crossSell:'Cross sell'} as Record<string,string>)[scope.type]===r.segment) && (!scope.stages.length||scope.stages.includes(r.stage))).map(r=>[r.id,r])).values()];
  const active=records.filter(r=>r.state==='alertas_activas'&&r.risks.length);
  const high=active.filter(riskScoreCross);
  return <details className="risk-hygiene" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Alertas Adobo · higiene de pipeline</summary>
    <p>Pipeline Comercial Adereso · alcance personal autorizado · sin filtro de año/trimestre. El estado del CRM se muestra separado de su vigencia corroborada.</p>
    {query.isFetching?<p role="status">Actualizando lectura…</p>:null}
    {query.error||repo?.error?<p role="alert">Lectura incompleta. Se conserva la última información disponible; no confirma ausencia ni resolución de riesgos.</p>:null}
    {repo?<><p>Corte: {santiago(repo.syncedAt)} · {records.length} negocios leídos · {active.length} con alerta registrada · {high.length} además con score ≥76 o probabilidad &gt;70%.</p>
      <p>Adobo Score es orientativo y no sustituye la probabilidad CRM. El repositorio privado corresponde solo a tu owner; esta lectura no acredita cobertura del resto del equipo.</p>
      <label>Categoría <select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Todas</option>{Object.entries(RISK_LABELS).map(([k,label])=><option key={k} value={k}>{label} · {active.filter(r=>r.risks.includes(k)).length}</option>)}</select></label>
      <small>Conteos por categoría solapables; cada negocio aparece una sola vez.</small>
      <div className="risk-hygiene-list">{records.filter(r=>category==='all'||r.risks.includes(category)).map(r=>{const proof=attestation(r,now);return <article key={r.id}><a href={crmUrl(r.id)} target="_blank" rel="noreferrer">{r.name}</a><p>{r.owner} · {r.stage} · {states[r.state]??'Sin evaluación registrada'}</p><p>{r.risks.map(k=>RISK_LABELS[k]??k).join(' · ')||'Sin categorías registradas'}</p><p>Score: {r.score??'s/d'} · Probabilidad CRM: {r.probability===null?'s/d':`${r.probability}%`}{high.some(d=>d.id===r.id)?` · Cruce: ${[r.score!==null&&r.score>=76?'score ≥76':null,r.probability!==null&&r.probability>70?'probabilidad >70%':null].filter(Boolean).join(' y ')}`:''}</p><small>Revisión: {santiago(r.reviewedAt)} · {proof?'Cobertura y vigencia corroboradas':'Cobertura o vigencia sin corroborar'}</small><details><summary>Evidencia y decisión</summary><p className="whitespace-pre-wrap">{proof?proof.sources.map(s=>`${s.summary} · ${s.id} · ${s.at}`).join('\n'):r.evidence||'Sin evidencia registrada'}</p><p>{proof&&r.state==='pausa_acordada'?'Respetar la pausa corroborada.':'Revisar fuentes y acordar el siguiente paso; no hay acción automática.'}</p>{proof?.sources.map(s=><a key={s.id} href={s.url} target="_blank" rel="noreferrer">Fuente {s.id}</a>)}</details></article>;})}</div>
      {!records.length?<p>No hay registros en este alcance personal. Esto no prueba ausencia de riesgos del equipo.</p>:null}</>:!query.isFetching?<p>Abre o actualiza la lectura para consultar los riesgos.</p>:null}
  </details>;
}
