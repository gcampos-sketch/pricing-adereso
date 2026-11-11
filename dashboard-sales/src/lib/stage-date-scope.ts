import type { StageJourney } from './pulse-types';
export type FlowDateBasis = 'entry' | 'close';
export function flowQuarter(raw: string | undefined) {
  const date = new Date(raw ?? '');
  return Number.isFinite(date.getTime()) ? `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth()/3)+1}` : '';
}
export function flowStageDate(journey: StageJourney, stage: string) {
  if (stage === 'Perdido') return journey.outcomeEntered?.[journey.deal.stageId] || journey.entered['LOST'] || '';
  if (stage === 'Perdido desarrollo') return journey.outcomeEntered?.[journey.deal.stageId] || '';
  return journey.entered[stage] || '';
}
export function stageInPeriods(journey: StageJourney, stage: string, periods: Set<string>, basis: FlowDateBasis) {
  return periods.has(flowQuarter(basis === 'close' ? journey.deal.closeDateValue : flowStageDate(journey,stage)));
}
export function journeyInPeriods(journey: StageJourney, periods: Set<string>, basis: FlowDateBasis) {
  return basis === 'close' ? periods.has(flowQuarter(journey.deal.closeDateValue)) : [...Object.values(journey.entered), ...Object.values(journey.outcomeEntered ?? {})].some(date=>periods.has(flowQuarter(date)));
}
