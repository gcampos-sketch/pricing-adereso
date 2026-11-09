/** A qualitative rhythm from completed resource timings, never a percent complete. */
export class LoadingPace {
  private duration: number | undefined;
  private lastProgress: number;

  constructor(now: number) { this.lastProgress = now; }

  record(duration: number, endedAt: number, now: number) {
    if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(endedAt) || endedAt > now || endedAt < now - 1500) return;
    this.duration = this.duration === undefined ? duration : this.duration * .65 + duration * .35;
    this.lastProgress = Math.max(this.lastProgress, endedAt);
  }

  rate(now: number) {
    const moving = this.duration === undefined ? 1 : Math.max(.6, Math.min(1.65, 650 / Math.max(350, this.duration)));
    const waiting = Math.max(0, Math.min(1, (now - this.lastProgress - 400) / 1800));
    return moving + (.6 - moving) * waiting;
  }
}

/** A shared, broad wave illuminates whole sections with overlapping fades. */
export function loadingLightLevels(phase: number): number[] {
  const cycle = (phase % 1 + 1) % 1;
  const order = [1, 0, 2];
  const levels = [.16, .16, .16];
  order.forEach((lobe, index) => {
    const weight = Math.exp(1.15 * (Math.cos(2 * Math.PI * (cycle - index / 3)) - 1));
    levels[lobe] = .16 + .84 * weight;
  });
  return levels;
}

/** Speed changes advance a single light clock, so the handoff cannot drift. */
export function mountLoadingPace(root: HTMLElement): () => void {
  const page = root.ownerDocument.defaultView;
  if (!page) return () => {};
  const pace = new LoadingPace(page.performance.now());
  const observers: PerformanceObserver[] = [];
  const observed = new WeakSet<Window>();
  const cleanups: (() => void)[] = [];
  const observe = (target: Window | null) => {
    if (!target || observed.has(target)) return;
    try {
      const win = target as Window & typeof globalThis;
      const offset = win.performance.timeOrigin - page.performance.timeOrigin;
      const record = (entries: PerformanceEntry[]) => {
        const now = page.performance.now();
        for (const entry of entries) pace.record(entry.duration, entry.startTime + entry.duration + offset, now);
      };
      record(win.performance.getEntriesByType('resource'));
      if (win.PerformanceObserver) {
        const observer = new win.PerformanceObserver(list => record(list.getEntries()));
        observer.observe({ type: 'resource', buffered: false });
        observers.push(observer);
      }
      observed.add(target);
    } catch { /* A cross-origin frame never grants timing access. */ }
  };
  observe(page);
  for (const frame of root.ownerDocument.querySelectorAll('iframe.hub-portal-frame')) {
    const iframe = frame as HTMLIFrameElement;
    const loaded = () => observe(iframe.contentWindow);
    // Subscribe after navigation so the observer belongs to the current document.
    iframe.addEventListener('load', loaded);
    cleanups.push(() => iframe.removeEventListener('load', loaded));
  }
  const lobes = [...root.querySelectorAll<SVGElement>('.hub-loading-lobe')];
  const reduced = page.matchMedia('(prefers-reduced-motion: reduce)');
  let phase = 0;
  const paint = () => {
    const levels = reduced.matches ? [1, 1, 1] : loadingLightLevels(phase);
    lobes.forEach((lobe, index) => {
      const level = levels[index]!;
      const light = (level - .16) / .84;
      lobe.style.opacity = level.toFixed(4);
      lobe.style.filter = `drop-shadow(0 0 ${(light * 5).toFixed(2)}px rgba(255,255,255,${(light * .3).toFixed(3)}))`;
    });
  };
  paint();
  reduced.addEventListener('change', paint);
  let speed = 1;
  let previous = page.performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const elapsed = Math.min(64, Math.max(0, now - previous));
    speed += (pace.rate(now) - speed) * (1 - Math.exp(-elapsed / 1100));
    previous = now;
    phase = (phase + elapsed * speed / 4800) % 1;
    paint();
    frame = page.requestAnimationFrame(tick);
  };
  frame = page.requestAnimationFrame(tick);
  return () => {
    page.cancelAnimationFrame(frame);
    reduced.removeEventListener('change', paint);
    observers.forEach(observer => observer.disconnect());
    cleanups.forEach(cleanup => cleanup());
    // Preserve the current brightness for the gradual completion fade.
  };
}
