import { useCallback, useLayoutEffect, useRef, type RefObject, type UIEvent } from 'react';

const TRAVEL = 220;

/** Scroll-linked chrome, shared by every DealModal; never rerenders the deal rows. */
export function useDealHeaderScroll(modal: RefObject<HTMLElement | null>, key: string | null) {
  const motion = useRef({ top: 0, target: 0, value: 0, frame: 0, time: 0 });

  const animate = useCallback(function tick(time: number) {
    const state = motion.current;
    const element = modal.current;
    if (!element) { state.frame = 0; return; }
    const dt = state.time ? Math.min(64, time - state.time) : 16;
    state.time = time;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.value += (state.target - state.value) * (reduced ? 1 : 1 - Math.exp(-dt / 55));
    if (Math.abs(state.target - state.value) < .0005) state.value = state.target;
    element.style.setProperty('--deal-collapse', String(state.value));
    const secondary = element.querySelector<HTMLElement>('.deal-modal-secondary');
    if (secondary) secondary.inert = state.value > .98;
    // A growing viewport can clamp scrollTop at the bottom. Do not interpret that
    // geometry correction as an upward user gesture on the next scroll event.
    const list = element.querySelector<HTMLElement>('.deal-list');
    if (list) state.top = Math.max(0, list.scrollTop);
    state.frame = state.value === state.target ? 0 : requestAnimationFrame(tick);
  }, [modal]);

  useLayoutEffect(() => {
    const element = modal.current;
    if (!element || !key) return;
    cancelAnimationFrame(motion.current.frame);
    motion.current = { top: 0, target: 0, value: 0, frame: 0, time: 0 };
    element.style.setProperty('--deal-collapse', '0');
    const intro = element.querySelector<HTMLElement>('.deal-modal-intro-content');
    const secondary = element.querySelector<HTMLElement>('.deal-modal-secondary-content');
    const measure = () => {
      if (intro) element.style.setProperty('--deal-intro-height', `${intro.scrollHeight}px`);
      if (secondary) element.style.setProperty('--deal-secondary-width', `${secondary.scrollWidth}px`);
    };
    const observer = new ResizeObserver(measure);
    if (intro) observer.observe(intro);
    if (secondary) observer.observe(secondary);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(motion.current.frame); motion.current.frame = 0; };
  }, [modal, key]);

  return useCallback((event: UIEvent<HTMLDivElement>) => {
    const state = motion.current;
    const top = Math.max(0, event.currentTarget.scrollTop);
    const delta = top - state.top;
    state.top = top;
    if (!delta) return; // Horizontal scrolling is independent.
    state.target = top < 1 ? 0 : Math.max(0, Math.min(1, state.target + delta / TRAVEL));
    if (!state.frame) { state.time = 0; state.frame = requestAnimationFrame(animate); }
  }, [animate]);
}
