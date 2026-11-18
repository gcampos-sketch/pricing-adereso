export type LossHistoryVersion = { value?: string | null; timestamp?: string };
export type PriorValue = { value: number | null; at: string | null };
export type LossPriorScore = { id: string; eligible: boolean; stageId: string; enteredAt: string | null; adobo: PriorValue; probability: PriorValue };
const unknown = (): PriorValue => ({ value: null, at: null });
const date = (raw?: string | null) => raw && /^\d{4}-\d{2}-\d{2}T/.test(raw) && Number.isFinite(Date.parse(raw)) ? Date.parse(raw) : NaN;
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
  const empty: LossPriorScore = { id, eligible, stageId, enteredAt: null, adobo: unknown(), probability: unknown() };
  if (!eligible) return empty;
  const now = date(readAt), cutoff = date(properties[`hs_v2_date_entered_${stageId}`]);
  const stages = history['dealstage'];
  if (!Number.isFinite(cutoff) || cutoff > now || !stages?.length || stages.some(v => !v.value || !Number.isFinite(date(v.timestamp)) || date(v.timestamp) > now)) return empty;
  const ordered = [...stages].sort((a,b) => date(b.timestamp) - date(a.timestamp));
  if (ordered[0]?.value !== stageId) return empty;
  const sameRun: LossHistoryVersion[] = [];
  for (const version of ordered) { if (version.value !== stageId) break; sameRun.push(version); }
  const entered = sameRun[sameRun.length - 1];
  // Native entry and exact current-stage chronology must corroborate one another.
  if (!entered || date(entered.timestamp) !== cutoff || stages.some(v => date(v.timestamp) === cutoff && v.value !== stageId)) return empty;
  return { ...empty, enteredAt: new Date(cutoff).toISOString(),
    adobo: valueBeforeLoss(history['adobo_closing_score'], cutoff, now),
    probability: valueBeforeLoss(history['hs_deal_stage_probability'], cutoff, now, true) };
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
