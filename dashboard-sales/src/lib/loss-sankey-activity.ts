import { activityChannels, type ActivityChannel } from './deal-activity-analysis';
import type { InsightDeal } from './insights-types';

export const LOSS_ACTIVITY_BATCH_SIZE = 40;
export type LossActivityChannel = 'all' | ActivityChannel;
export type LossActivityEvidence = {
  enteredAt: number;
  previousStage: string | null;
  counts: Record<ActivityChannel, number | null>;
};

export function lossActivityFor(deal: InsightDeal, evidence?: Readonly<Record<string, LossActivityEvidence>>) {
  const row = evidence?.[deal.id];
  return row?.enteredAt === Date.parse(deal.lostEnteredAt ?? '') ? row : undefined;
}

export function lossActivityBucket(row: LossActivityEvidence | undefined, channel: LossActivityChannel) {
  const values = channel === 'all' ? activityChannels.map(key => row?.counts[key]) : [row?.counts[channel]];
  if (values.some(value => value == null)) return 'Actividad sin verificar';
  const count = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (count === 0) return '0 actividades';
  if (count <= 2) return '1–2 actividades';
  if (count <= 5) return '3–5 actividades';
  if (count <= 10) return '6–10 actividades';
  return '11+ actividades';
}

export function lossActivityTotals(deals: readonly InsightDeal[], evidence: Readonly<Record<string, LossActivityEvidence>>) {
  return activityChannels.map(channel => {
    let total = 0;
    let covered = 0;
    for (const deal of deals) {
      const count = lossActivityFor(deal, evidence)?.counts[channel];
      if (count == null) continue;
      total += count;
      covered++;
    }
    return { channel, total, covered };
  });
}
