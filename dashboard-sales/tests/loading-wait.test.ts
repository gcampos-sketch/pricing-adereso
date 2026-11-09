import { afterEach, expect, test, mock, spyOn } from 'bun:test';
import { scheduleLoadingWait } from '../src/components/useLoadingWait';

afterEach(() => mock.restore());

test('reassures after a real wait and cancels obsolete task notices', () => {
  const timers = new Map<number, () => void>();
  const cleared: number[] = [];
  spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, delay: number) => {
    timers.set(delay, fn); return delay;
  }) as typeof setTimeout);
  spyOn(globalThis, 'clearTimeout').mockImplementation(((id: number) => { cleared.push(id); timers.delete(id); }) as typeof clearTimeout);
  const messages: string[] = [];
  const stop = scheduleLoadingWait(message => messages.push(message));
  expect(messages).toEqual([]);
  timers.get(8_000)!();
  expect(messages).toEqual(['Un momentito…']);
  timers.get(20_000)!();
  expect(messages.at(-1)).toBe('Está tomando más tiempo de lo habitual…');
  stop();
  expect(cleared).toEqual([8_000, 20_000]);
  expect(timers.size).toBe(0);
});
