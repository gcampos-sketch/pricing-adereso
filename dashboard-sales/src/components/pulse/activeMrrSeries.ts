/**
 * Series de MRR incorporado a Inicio de servicio, agrupadas por año, trimestre,
 * mes o semana ISO a partir de las fechas reales de entrada a la etapa.
 */
import type { ActiveMrrEntry } from "@/contexts/RefreshContext";

export type Granularity = "year" | "quarter" | "month" | "week";

export type MrrBucket = {
  key: string;
  label: string;
  value: number;
  /** MRR acumulado en servicio al cierre del periodo (suma de todo lo incorporado hasta aquí) */
  cumulative: number;
  count: number;
  entries: ActiveMrrEntry[];
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 0, m: (m ?? 1) - 1, d: d ?? 1 };
};

/** Lunes de la semana ISO en formato YYYY-MM-DD. */
const isoWeekStart = (iso: string) => {
  const { y, m, d } = parse(iso);
  const date = new Date(Date.UTC(y, m, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
};

const bucketOf = (iso: string, granularity: Granularity): { key: string; label: string } => {
  const { y, m, d } = parse(iso);
  if (granularity === "year") return { key: `${y}`, label: `${y}` };
  if (granularity === "quarter") {
    const q = Math.floor(m / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${String(y).slice(-2)}` };
  }
  if (granularity === "month") return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${MONTHS[m]} ${String(y).slice(-2)}` };
  const start = isoWeekStart(iso);
  const sd = parse(start);
  return { key: start, label: `${sd.d} ${MONTHS[sd.m]}` };
};

export function buildBuckets(entries: ActiveMrrEntry[], granularity: Granularity): MrrBucket[] {
  const map = new Map<string, MrrBucket>();
  for (const entry of entries) {
    if (!entry.date) continue;
    const { key, label } = bucketOf(entry.date, granularity);
    const bucket = map.get(key) ?? { key, label, value: 0, cumulative: 0, count: 0, entries: [] as ActiveMrrEntry[] };
    bucket.value += entry.mrr;
    bucket.count += 1;
    bucket.entries.push(entry);
    map.set(key, bucket);
  }
  const sorted = [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  let running = 0;
  for (const bucket of sorted) {
    running += bucket.value;
    bucket.cumulative = running;
  }
  return sorted;
}

/** Clave del periodo actualmente filtrado (Q o año completo). */
export function periodKey(year: string, quarter: string) {
  return quarter === "all" ? { granularity: "year" as Granularity, key: year } : { granularity: "quarter" as Granularity, key: `${year}-Q${quarter}` };
}

export function compareFiltered(entries: ActiveMrrEntry[], year: string, quarter: string) {
  const { granularity, key } = periodKey(year, quarter);
  const buckets = buildBuckets(entries, granularity);
  const index = buckets.findIndex((bucket) => bucket.key === key);
  const current = index >= 0 ? buckets[index]! : { key, label: key, value: 0, cumulative: 0, count: 0, entries: [] };
  const previous = index > 0 ? buckets[index - 1] : buckets.filter((bucket) => bucket.key < key).slice(-1)[0];
  const delta = current.value - (previous?.value ?? 0);
  const changePct = previous?.value ? (delta / previous.value) * 100 : null;
  const series = (granularity === "quarter" ? buckets.slice(-8) : buckets.slice(-12));
  return {
    granularity,
    current,
    previous: previous ?? null,
    delta,
    changePct,
    series,
    label: granularity === "quarter" ? "vs Q anterior" : "vs año anterior",
  };
}

export const shortDate = (iso: string) => {
  const { m, d } = parse(iso);
  return `${d} ${MONTHS[m]}`;
};

/**
 * Último trimestre con incorporaciones a servicio y su variación contra el
 * trimestre anterior. Independiente de los filtros del tablero.
 */
export function lastQuarterSummary(entries: ActiveMrrEntry[]) {
  const buckets = buildBuckets(entries, "quarter");
  if (!buckets.length) return null;
  const current = buckets[buckets.length - 1]!;
  const previous = buckets[buckets.length - 2] ?? null;
  const changePct = previous?.value ? ((current.value - previous.value) / previous.value) * 100 : null;
  return { current, previous, changePct, series: buckets.slice(-8), label: "QoQ" };
}

/** Últimos meses consecutivos, incluyendo meses sin incorporaciones como cero. */
export function monthlyTrend(entries: ActiveMrrEntry[], length = 12): MrrBucket[] {
  const monthly = new Map(buildBuckets(entries, "month").map((bucket) => [bucket.key, bucket]));
  const latest = [...monthly.keys()].sort().at(-1);
  if (!latest) return [];

  const [latestYear, latestMonth] = latest.split("-").map(Number);
  const result: MrrBucket[] = [];
  for (let offset = length - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(latestYear ?? 0, (latestMonth ?? 1) - 1 - offset, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const found = monthly.get(key);
    const carry = result[result.length - 1]?.cumulative ?? 0;
    result.push(found ?? {
      key,
      label: `${MONTHS[month]} ${String(year).slice(-2)}`,
      value: 0,
      cumulative: carry,
      count: 0,
      entries: [],
    });
  }
  return result;
}
