import { isRenewalDeal } from './quota-eligibility';

export const SERVICE_MRR_CALCULATION = 'service-mrr/verified-service-accounts-v2';

/** Keep service MRR global; exclude renewals without applying other quota exclusions. */
export function serviceMrrDeals<T extends { id: string; properties: Record<string, string | null | undefined> }>(deals: T[], serviceStage: string, verifiedAccountDeals?: ReadonlySet<string>): T[] {
  return deals.filter(deal => (!verifiedAccountDeals || verifiedAccountDeals.has(deal.id)) && deal.properties['dealstage'] === serviceStage &&
    !isRenewalDeal({ dealType: deal.properties['dealtype'] ?? null }));
}
