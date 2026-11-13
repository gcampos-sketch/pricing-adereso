/** Exposure belongs to the exact widget's deduplicated deal population. */
export function dealExposure(deals: readonly { id: string; amountValue: number }[]) {
  const unique = [...new Map(deals.map(deal => [deal.id, deal])).values()];
  return {
    mrr: unique.reduce((total, deal) => total + (Number.isFinite(deal.amountValue) && deal.amountValue > 0 ? deal.amountValue : 0), 0),
    unvalued: unique.filter(deal => !Number.isFinite(deal.amountValue) || deal.amountValue <= 0).length,
  };
}
