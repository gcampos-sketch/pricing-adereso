import type { DealDTO, PeriodStats, StageJourney } from './pulse-types';
import { CUSTOMER_WON_STAGES } from './customer-accounts';
import { calendarDate } from './service-overview';

export function wonByStage6Entry(journeys: StageJourney[], periods: string[]) {
  const selected = new Set(periods);
  return [...new Map(journeys.filter(row => {
    const date = calendarDate(row.entered['E6']);
    return CUSTOMER_WON_STAGES.has(row.deal.stageId) && date && selected.has(`${date.slice(0,4)}-Q${Math.ceil(Number(date.slice(5,7))/3)}`);
  }).map(row => [row.deal.id, row.deal])).values()];
}
export function withWonDeals(base: PeriodStats | undefined, deals: DealDTO[]): PeriodStats {
  return {...(base ?? {lost:0,lostAmount:0,lostDeals:[]}), won:deals.length,
    wonAmount:deals.reduce((sum,deal)=>sum+(deal.amountValue||0),0),
    wonOtf:deals.reduce((sum,deal)=>sum+(deal.otfValue||0),0), wonDeals:deals};
}

export function stage6AttributionDates(journeys: StageJourney[]) {
  return Object.fromEntries(journeys.map(row=>[row.deal.id,calendarDate(row.entered["E6"])]));
}
