export type LossHistoryVersion = { value?: string | null; timestamp?: string };
export type PriorValue = { value: number | null; at: string | null };
export type LossPriorScore = { id: string; eligible: boolean; stageId: string; enteredAt: string | null; adobo: PriorValue; probability: PriorValue; icpVersion?: "native-icp/v1"; icpScore?: PriorValue; icpFit?: {value:string|null;at:string|null}; currentIcp?: {score:number|null;fit:string|null} };
const unknown = (): PriorValue => ({ value: null, at: null });
const date = (raw?: string | null) => raw && /^\d{4}-\d{2}-\d{2}T/.test(raw) && Number.isFinite(Date.parse(raw)) ? Date.parse(raw) : NaN;

export function corroboratedLossTransition(stageId: string, entry: string | null | undefined, stages: LossHistoryVersion[] | undefined, now: number) {
  const cutoff = date(entry);
  if (!Number.isFinite(now) || !Number.isFinite(cutoff) || cutoff > now || !stages?.length ||
    stages.some(v => !v.value || !Number.isFinite(date(v.timestamp)) || date(v.timestamp) > now)) return null;
  const ordered = [...stages].sort((a, b) => date(b.timestamp) - date(a.timestamp));
  const previousIndex = ordered.findIndex(version => version.value !== stageId);
  const entered = previousIndex === -1 ? ordered.at(-1) : ordered[previousIndex - 1];
  if (!entered || date(entered.timestamp) !== cutoff || ordered.some(v => date(v.timestamp) === cutoff && v.value !== stageId)) return null;
  const previous = ordered[previousIndex];
  const ambiguous = previous && ordered.some(v => date(v.timestamp) === date(previous.timestamp) && v.value !== previous.value);
  return { cutoff, previousStageId: ambiguous ? null : previous?.value ?? null };
}
/** Never bridge an undated or conflicting latest version, nor replace a cleared value with an older one. */
export function valueBeforeLoss(versions: LossHistoryVersion[] | undefined, cutoff: number, readAt: number, probability = false): PriorValue {
  if (!versions?.length || versions.some(v => !Number.isFinite(date(v.timestamp)) || date(v.timestamp) > readAt)) return unknown();
  const prior = versions.filter(v => date(v.timestamp) < cutoff).sort((a,b) => date(b.timestamp) - date(a.timestamp));
  const latest = prior[0];
  if (!latest) return unknown();
  const tied = prior.filter(v => date(v.timestamp) === date(latest.timestamp));
  const parse = (v: LossHistoryVersion) => {
    const raw = v.value?.trim();
    if (!raw || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
    const n = Number(raw);
    return n >= 0 && n <= (probability ? 1 : 100) ? n * (probability ? 100 : 1) : null;
  };
  const value = parse(latest);
  if (value === null || tied.some(v => parse(v) !== value)) return unknown();
  return { value, at: new Date(date(latest.timestamp)).toISOString() };
}
export function lossPriorScore(id: string, properties: Record<string, string | null>, history: Record<string, LossHistoryVersion[]>, lostStages: ReadonlySet<string>, pipeline: string, readAt: string): LossPriorScore {
  const stageId = properties['dealstage'] ?? '';
  const eligible = properties['pipeline'] === pipeline && lostStages.has(stageId);
  const empty: LossPriorScore = { id, eligible, stageId, enteredAt: null, adobo: unknown(), probability: unknown(), icpVersion: "native-icp/v1", icpScore: unknown(), icpFit: {value:null,at:null}, currentIcp: eligible ? {score:icpScoreValue(properties["adobo_icp_score"]),fit:Object.hasOwn(ICP_FIT_LABELS,properties["adobo_icp_fit"] ?? "") ? properties["adobo_icp_fit"]! : null} : {score:null,fit:null} };
  if (!eligible) return empty;
  const now = date(readAt);
  const transition = corroboratedLossTransition(stageId, properties[`hs_v2_date_entered_${stageId}`], history['dealstage'], now);
  if (!transition) return empty;
  const { cutoff } = transition;
  return { ...empty, enteredAt: new Date(cutoff).toISOString(),
    adobo: valueBeforeLoss(history['adobo_closing_score'], cutoff, now),
    probability: valueBeforeLoss(history['hs_deal_stage_probability'], cutoff, now, true),
    icpScore:valueBeforeLoss(history['adobo_icp_score'],cutoff,now), icpFit:icpFitBeforeLoss(history['adobo_icp_fit'],cutoff,now) };
}
export type PriorMetric = 'adobo' | 'probability';
export function priorScoreBuckets<T extends { id: string }>(deals: T[], evidence: Record<string, LossPriorScore>, metric: PriorMetric) {
  const buckets = Array.from({ length: 5 }, (_,i) => ({ key: String(i), label: `${i * 20}–${i === 4 ? "" : "<"}${(i + 1) * 20}${metric === 'probability' ? '%' : ''}`, deals: [] as T[] }));
  const missing = { key: 'unknown', label: 'Sin dato previo', deals: [] as T[] };
  for (const deal of new Map(deals.map(d => [d.id,d])).values()) {
    const row = evidence[deal.id];
    if (!row?.eligible) continue;
    const value = row[metric].value;
    if (value === null) missing.deals.push(deal);
    else buckets[Math.min(4, Math.floor(value / 20))]!.deals.push(deal);
  }
  return [...buckets, missing];
}

export const ICP_FIT_LABELS: Record<string,string> = { alto:'Alto', medio:'Medio', bajo:'Bajo', no_validado:'No validado' };
export function icpScoreValue(raw: string | null | undefined): number | null {
  const text=raw?.trim();
  if (!text || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const value=Number(text);return value>=0 && value<=100 ? value : null;
}
export function icpFitBeforeLoss(versions: LossHistoryVersion[] | undefined, cutoff: number, readAt: number): {value:string|null;at:string|null} {
  const empty={value:null,at:null};
  if (!versions?.length || versions.some(v=>!Number.isFinite(date(v.timestamp)) || date(v.timestamp)>readAt))return empty;
  const prior=versions.filter(v=>date(v.timestamp)<cutoff).sort((a,b)=>date(b.timestamp)-date(a.timestamp));
  const latest=prior[0];const value=latest?.value?.trim();
  if (!latest || !value || !Object.hasOwn(ICP_FIT_LABELS,value) || prior.some(v=>date(v.timestamp)===date(latest.timestamp) && v.value?.trim()!==value))return empty;
  return {value,at:new Date(date(latest.timestamp)).toISOString()};
}
export type IcpMetric='score'|'fit';
export type IcpBasis='prior'|'current';
export function lossIcpBuckets<T extends {id:string}>(deals:T[], evidence:Record<string,LossPriorScore>, metric:IcpMetric,basis:IcpBasis) {
  const groups: {key:string;label:string;deals:T[]}[]=metric==='score'
    ? Array.from({length:5},(_,i)=>({key:String(i),label:`${i*20}–${i===4?'':'<'}${(i+1)*20}`,deals:[]}))
    : Object.entries(ICP_FIT_LABELS).map(([key,label])=>({key,label,deals:[]}));
  groups.push({key:'unknown',label:basis==='prior'?'Sin dato previo':'Sin dato',deals:[]});
  for(const deal of new Map(deals.map(d=>[d.id,d])).values()) {
    const row=evidence[deal.id];if(!row?.eligible)continue;
    const value=metric==='score' ? (basis==='prior'?row.icpScore?.value:row.currentIcp?.score) : (basis==='prior'?row.icpFit?.value:row.currentIcp?.fit);
    const key=metric==='score' && typeof value==='number' && Number.isFinite(value) && value>=0 && value<=100 ? String(Math.min(4,Math.floor(value/20))) : metric==='fit' && typeof value==='string' && Object.hasOwn(ICP_FIT_LABELS,value) ? value : 'unknown';
    groups.find(g=>g.key===key)!.deals.push(deal);
  }
  return groups;
}
