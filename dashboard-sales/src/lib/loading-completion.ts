/** Called only when the content is ready, never from an estimated percentage. */
export function completeLoading(root: HTMLElement, onDone: () => void): () => void {
  const page = root.ownerDocument.defaultView;
  if (!page) return () => {};
  const reduced = page.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lobes = [...root.querySelectorAll<SVGElement>('.hub-loading-lobe')];
  const current = lobes.map(lobe => { const style = page.getComputedStyle(lobe); return { opacity: style.opacity, filter: style.filter }; });
  const animations = lobes.map((lobe, index) => {
    const from = { opacity: current[index]!.opacity, filter: current[index]!.filter };
    lobe.style.animation = 'none';
    lobe.style.opacity = '1';
    lobe.style.filter = 'drop-shadow(0 0 5px rgba(255,255,255,.3))';
    const dim = { opacity: .22, filter: 'drop-shadow(0 0 0 rgba(255,255,255,0))' };
    return reduced ? null : lobe.animate([
      { ...from, offset: 0, easing: 'cubic-bezier(.37,0,.63,1)' },
      { ...dim, offset: .25 },
      { ...dim, offset: .32, easing: 'cubic-bezier(.37,0,.63,1)' },
      { opacity: 1, filter: lobe.style.filter, offset: 1 },
    ], { duration: 1700, easing: 'linear', fill: 'forwards' });
  });
  // The whole mark stays visible without glow, then brightens together.
  const timer = page.setTimeout(onDone, reduced ? 150 : 1900);
  return () => {
    page.clearTimeout(timer);
    animations.forEach(animation => animation?.cancel());
    lobes.forEach(lobe => { lobe.style.animation = ''; lobe.style.opacity = ''; lobe.style.filter = ''; });
  };
}
