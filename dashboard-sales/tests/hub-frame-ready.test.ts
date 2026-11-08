import { expect, test } from 'bun:test';
import { waitForHubFrame } from '../src/lib/hub-frame-ready';

test('iframe load does not reveal the Hub before visual preparation completes', async () => {
  let finish!: () => void;
  let revealed = false;
  const ready = new Promise<void>(resolve => { finish = resolve; });
  const frame = { contentDocument: { getElementById: () => ({}) }, contentWindow: { aderesoHubReady: ready } } as unknown as HTMLIFrameElement;
  const waiting = waitForHubFrame(frame).then(() => { revealed = true; });
  await Promise.resolve();
  expect(revealed).toBe(false);
  finish();
  await waiting;
  expect(revealed).toBe(true);
});

test('an error document cannot be mistaken for the initialized private Hub', async () => {
  const frame = { contentDocument: { getElementById: () => null }, contentWindow: {} } as unknown as HTMLIFrameElement;
  await expect(waitForHubFrame(frame)).rejects.toThrow('Hub document did not initialize');
});
