import { expect, test } from 'bun:test';
import { completeLoading } from '../src/lib/loading-completion';

function fixture(reduced = false) {
  const timers = new Map<number, () => void>();
  const transitions: any[] = [];
  let canceled = 0;
  const lobes = [0, 1, 2].map(index => ({ index, style: { animation: '', opacity: '', filter: '' },
    animate: (frames: unknown, options: unknown) => { transitions.push({ frames, options }); return { cancel() { canceled++; } }; },
  }));
  const page = {
    matchMedia: () => ({ matches: reduced }),
    getComputedStyle: (lobe: typeof lobes[number]) => ({ opacity: String(.2 + lobe.index * .3), filter: 'none' }),
    setTimeout: (fn: () => void, delay: number) => { timers.set(delay, fn); return delay; },
    clearTimeout: (id: number) => timers.delete(id),
  };
  return { root: { ownerDocument: { defaultView: page }, querySelectorAll: () => lobes } as unknown as HTMLElement, timers, lobes, transitions, canceled: () => canceled };
}

test('completion lights all sections from their current brightness before revealing content', () => {
  const f = fixture(); let revealed = false;
  completeLoading(f.root, () => { revealed = true; });
  expect(revealed).toBe(false);
  expect(f.transitions.map(t => t.frames[0].opacity)).toEqual(['0.2', '0.5', '0.8']);
  expect(f.transitions.every(t => t.frames[1].opacity === .22 && t.frames[2].opacity === .22 && t.frames[3].opacity === 1)).toBe(true);
  expect(f.transitions.every(t => t.frames[1].offset === .25 && t.frames[2].offset === .32 && t.options.duration === 1700)).toBe(true);
  expect(f.lobes.every(lobe => lobe.style.opacity === '1' && lobe.style.animation === 'none')).toBe(true);
  f.timers.get(1900)!();
  expect(revealed).toBe(true);
});

test('unmount cancels the reveal callback and leaves no finishing animations', () => {
  const f = fixture(); const cleanup = completeLoading(f.root, () => { throw Error('Unexpected reveal'); });
  cleanup();
  expect(f.timers.size).toBe(0);
  expect(f.canceled()).toBe(3);
});

test('reduced motion completes without animating the sections', () => {
  const f = fixture(true); let done = false;
  completeLoading(f.root, () => { done = true; });
  expect(f.transitions).toHaveLength(0);
  f.timers.get(150)!(); expect(done).toBe(true);
});
