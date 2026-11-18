export type TrendUnit = 'money' | 'number' | 'percent' | 'days';
export type TrendPoint = { label: string; value: number | null; detail?: string; partial?: boolean };
export function formatTrendValue(value: number | null, unit: TrendUnit): string {
  if (value === null || !Number.isFinite(value)) return 'Sin dato';
  if (unit === 'money') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  const number = new Intl.NumberFormat('es-CL', { maximumFractionDigits: unit === 'number' ? 0 : 1 }).format(value);
  return unit === 'percent' ? `${number}%` : unit === 'days' ? `${number} días` : number;
}
export function trendPoints(values: (number | null)[], labels: string[] = []): TrendPoint[] {
  return values.map((value, index) => ({ label: labels[index] || `Período ${index + 1}`, value: value !== null && Number.isFinite(value) ? value : null }));
}
