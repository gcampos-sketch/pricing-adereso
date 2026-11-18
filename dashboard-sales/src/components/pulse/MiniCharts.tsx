import { MetricTrend } from './MetricTrend';
import { trendPoints, type TrendUnit } from '@/lib/chart-trend';

/** Retains period drilldowns while sharing the smooth curve presentation with metric cards. */
export function MiniBars({ data, onSelect, unit = 'money', label = 'MRR ganado', caption, detailLabel = 'deals' }: {
  data: { period: string; amount: number; deals: number }[];
  onSelect?: (period: string) => void; unit?: TrendUnit; label?: string; caption?: string; detailLabel?: string;
}) {
  return <MetricTrend data={data.map(item => ({ label: item.period, value: item.amount, detail: `${item.deals} ${detailLabel}` }))}
    label={label} unit={unit} {...(caption ? { caption } : {})}
    {...(onSelect ? { onSelect: (index: number) => onSelect(data[index]!.period) } : {})} compact />;
}

export function TrendLine({ labels, values, compact = false }: { labels: string[]; values: number[]; compact?: boolean }) {
  return <MetricTrend data={trendPoints(values, labels)} label="Pipeline mensual" unit="money" compact={compact} />;
}

export function MiniLine({ data, reference, label = "Win rate" }: { data: { period: string; rate: number }[]; reference?: number | null; label?: string }) {
  return <MetricTrend data={data.map(item => ({ label: item.period, value: item.rate }))}
    label={label} unit="percent" {...(reference !== undefined ? { reference } : {})} referenceLabel="WR histórico" compact />;
}
