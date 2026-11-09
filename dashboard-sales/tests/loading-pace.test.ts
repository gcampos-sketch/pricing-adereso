import { expect, test } from 'bun:test';
import { LoadingPace } from '../src/lib/loading-pace';

test('fast and slow resource completions produce distinct bounded rhythms', () => {
  const fast = new LoadingPace(0), slow = new LoadingPace(0);
  fast.record(120, 1500, 1500); slow.record(1400, 1500, 1500);
  expect(fast.rate(1500)).toBe(1.65);
  expect(slow.rate(1500)).toBe(.6);
});

test('waiting slows the rhythm and new progress speeds it up again', () => {
  const pace = new LoadingPace(0);
  pace.record(100, 100, 100);
  expect(pace.rate(1200)).toBeLessThan(pace.rate(100));
  expect(pace.rate(2400)).toBeCloseTo(.6);
  pace.record(150, 2500, 2500);
  expect(pace.rate(2500)).toBe(1.65);
});

test('old, malformed and future timings cannot create artificial progress', () => {
  const pace = new LoadingPace(0);
  for (const [duration, end] of [[100, 50], [-1, 2000], [NaN, 2000], [100, 2100]]) pace.record(duration, end, 2000);
  expect(pace.rate(2200)).toBe(.6);
});
