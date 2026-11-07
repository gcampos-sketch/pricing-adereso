import type { DealDTO } from './pulse-types';
import { validPropertyHistory } from './adobo-intelligence';

/** A conservative same-stage window proves the comparison did not cross a reopened cycle. */
export function adoboScoreComparison(deal:DealDTO,now:number) {
  const recorded=deal.adobo?.scoreTrend??null;
  const h=validPropertyHistory(deal,now), scores=h?.properties.adobo_closing_score, stages=h?.properties.dealstage;
  const missing={label:'Sin comparación',detail:`Tendencia registrada: ${recorded??'sin dato'}. Falta un valor anterior trazable del mismo ciclo.`,delta:null as number|null};
  if(!h || h.complete===false || !scores || !stages || scores.malformed || stages.malformed || stages.truncated) return missing;
  const [current,previous]=scores.versions, stage=stages.versions[0];
  const number=(s:string|null|undefined)=>s?.trim() && Number.isFinite(Number(s)) && Number(s)>=0 && Number(s)<=100 ? Number(s):null;
  const to=number(current?.value),from=number(previous?.value);
  if(!current || !previous || !stage || stage.value!==deal.stageId || to===null || from===null || to!==deal.adoboScoreValue || Date.parse(previous.at)<Date.parse(stage.at) || Date.parse(previous.at)>=Date.parse(current.at)) return missing;
  if(scores.versions.some(v=>v.at===current.at&&v.value!==current.value) || scores.versions.some(v=>v.at===previous.at&&v.value!==previous.value) || stages.versions.some(v=>v.at===stage.at&&v.value!==stage.value)) return missing;
  const delta=to-from;
  if(recorded!==(delta>0?'subiendo':delta<0?'bajando':'estable')) return missing;
  return {label:delta>0?'↑ Subiendo':delta<0?'↓ Bajando':'→ Neutro',delta,
    detail:`Antes ${from} → ${to} (${delta>0?'+':''}${delta}) · cambio ${current.at} · anterior ${previous.at}. Mismo negocio y etapa actual verificados en HubSpot.`};
}

/** CRM probability is a fraction; unknown, edited snapshots and reopened intervals never imply a trend. */
export function closingProbabilityComparison(deal:DealDTO,now:number) {
  const missing={delta:null as number|null,detail:'Sin comparación verificable del % de cierre en la etapa actual.'};
  const h=validPropertyHistory(deal,now), values=h?.properties.hs_deal_stage_probability,stages=h?.properties.dealstage;
  if(!h || h.complete===false || !values || !stages || values.malformed || stages.malformed || stages.truncated) return missing;
  const [current,previous]=values.versions,stage=stages.versions[0];
  const number=(raw:string|null|undefined)=>raw?.trim() && Number.isFinite(Number(raw)) && Number(raw)>=0 && Number(raw)<=1 ? Number(raw):null;
  const to=number(current?.value),from=number(previous?.value);
  if(!current || !previous || !stage || stage.value!==deal.stageId || to===null || from===null || !Number.isFinite(deal.probabilityValue) || Math.abs(to-deal.probabilityValue)>1e-9 || Date.parse(previous.at)<Date.parse(stage.at) || Date.parse(previous.at)>=Date.parse(current.at)) return missing;
  if(values.versions.some(v=>v.at===current.at&&v.value!==current.value) || values.versions.some(v=>v.at===previous.at&&v.value!==previous.value) || stages.versions.some(v=>v.at===stage.at&&v.value!==stage.value)) return missing;
  const delta=Math.round((to-from)*1000)/10;
  return {delta,detail:`Probabilidad CRM: antes ${Math.round(from*1000)/10}% → ${Math.round(to*1000)/10}% (${delta>0?'+':''}${delta} pp) · cambio ${current.at} · anterior ${previous.at}. Mismo negocio y etapa actual verificados; no es Adobo Score.`};
}
