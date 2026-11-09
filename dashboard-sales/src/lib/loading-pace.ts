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

/** Change playback speed without restarting the three staggered animations. */
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
  let animations: Animation[] = [];
  const collectAnimations = () => { animations = [...root.querySelectorAll('.hub-loading-lobe')].flatMap(lobe => lobe.getAnimations()); };
  collectAnimations();
  const reduced = page.matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change', collectAnimations);
  let speed = 1;
  let previous = page.performance.now();
  let frame = 0;
  const tick = (now: number) => {
    // Slow acceleration and continuous frame timing prevent a jerky tempo change.
    speed += (pace.rate(now) - speed) * (1 - Math.exp(-Math.min(64, now - previous) / 1100));
    previous = now;
    for (const animation of animations) animation.updatePlaybackRate(speed);
    frame = page.requestAnimationFrame(tick);
  };
  frame = page.requestAnimationFrame(tick);
  return () => {
    page.cancelAnimationFrame(frame);
    reduced.removeEventListener('change', collectAnimations);
    observers.forEach(observer => observer.disconnect());
    cleanups.forEach(cleanup => cleanup());
  };
}
