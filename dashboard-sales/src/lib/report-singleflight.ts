/** Coalesce snapshot misses and simultaneous live reads without retaining full reports. */
export function createReportSingleflight() {
  const inflight = new Map<string, Promise<unknown>>();
  return function singleflight<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;
    const pending = Promise.resolve().then(load).finally(() => inflight.delete(key));
    inflight.set(key, pending);
    return pending;
  };
}