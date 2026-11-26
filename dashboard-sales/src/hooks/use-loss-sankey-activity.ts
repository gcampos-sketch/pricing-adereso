import { useQuery } from '@tanstack/react-query';
import type { InsightDeal } from '@/lib/insights-types';
import { LOSS_ACTIVITY_BATCH_SIZE, type LossActivityEvidence } from '@/lib/loss-sankey-activity';
import { getLossSankeyActivity } from '@/lib/loss-sankey-activity.functions';

export function useLossSankeyActivity(deals: readonly InsightDeal[], readAt: string, enabled: boolean) {
  const ids = [...new Set(deals.map(deal => deal.id))].sort();
  return useQuery({
    queryKey: ['loss-sankey-activity', readAt, ids],
    enabled: enabled && ids.length > 0,
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const evidence: Record<string, LossActivityEvidence> = {};
      let incomplete = false;
      for (let index = 0; index < ids.length; index += LOSS_ACTIVITY_BATCH_SIZE) {
        signal.throwIfAborted();
        try {
          Object.assign(evidence, await getLossSankeyActivity({
            data: { ids: ids.slice(index, index + LOSS_ACTIVITY_BATCH_SIZE) }, signal,
          }));
        } catch {
          signal.throwIfAborted();
          incomplete = true;
        }
      }
      if (incomplete && !Object.keys(evidence).length) throw new Error('No se pudo consultar la actividad');
      return { evidence, incomplete };
    },
  });
}
