import { isRenewalDeal } from './quota-eligibility';

export const SERVICE_MRR_CALCULATION = 'service-mrr/exclude-renewals-v1';

/** Keep service MRR global; exclude renewals without applying other quota exclusions. */
export function serviceMrrDeals<T extends { properties: Record<string, string | null | undefined> }>(deals: T[], serviceStage: string): T[] {
  return deals.filter(deal => deal.properties['dealstage'] === serviceStage &&
    !isRenewalDeal({ dealType: deal.properties['dealtype'] ?? null }));
}
