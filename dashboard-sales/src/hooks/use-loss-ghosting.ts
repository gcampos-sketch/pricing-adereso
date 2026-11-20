import { useQuery } from "@tanstack/react-query";
import type { InsightDeal } from "@/lib/insights-types";
import { GHOSTING_BATCH_SIZE, isGhostingLoss, type GhostingActivity } from "@/lib/loss-ghosting";
import { getLossGhostingActivity } from "@/lib/loss-ghosting.functions";

export function useLossGhosting(deals: readonly InsightDeal[]) {
  const ghostIds = [...new Set(deals.filter(deal => isGhostingLoss(deal.lostReason)).map(deal => deal.id))].sort();
  return useQuery({
    queryKey: ["loss-ghosting", "creation-to-loss", ghostIds],
    enabled: ghostIds.length > 0,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const evidence: Record<string, GhostingActivity> = {};
      let incomplete = false;
      for (let index = 0; index < ghostIds.length && !signal.aborted; index += GHOSTING_BATCH_SIZE) {
        const ids = ghostIds.slice(index, index + GHOSTING_BATCH_SIZE);
        try {
          Object.assign(evidence, await getLossGhostingActivity({ data: { ids }, signal }));
        } catch {
          incomplete = true;
        }
      }
      return { evidence, incomplete };
    },
  });
}
