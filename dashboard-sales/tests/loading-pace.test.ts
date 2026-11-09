import { expect, test } from 'bun:test';
import { LoadingPace, loadingLightLevels } from '../src/lib/loading-pace';

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

test('whole sections illuminate in order with a continuous overlapping wave', () => {
  expect(loadingLightLevels(0)[1]).toBeCloseTo(1);
  expect(loadingLightLevels(1 / 3)[0]).toBeCloseTo(1);
  expect(loadingLightLevels(2 / 3)[2]).toBeCloseTo(1);
  const middle = loadingLightLevels(1 / 6);
  expect(middle[0]).toBeGreaterThan(.6); expect(middle[1]).toBeGreaterThan(.6);
});

test('section brightness and its rate of change have no jump at the loop seam', () => {
  let previous = loadingLightLevels(0);
  for (let i = 1; i <= 1000; i++) {
    const next = loadingLightLevels(i / 1000);
    expect(Math.max(...next.map((v, j) => Math.abs(v - previous[j]!)))).toBeLessThan(.02);
    previous = next;
  }
  const before = loadingLightLevels(1 - .0001), seam = loadingLightLevels(0), after = loadingLightLevels(.0001);
  for(let i=0;i<3;i++)expect(seam[i]! - before[i]!).toBeCloseTo(after[i]! - seam[i]!, 5);
});
