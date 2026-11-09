import { expect, test } from 'bun:test';
import { isActiveHubSource } from '../src/lib/hub-loading-channel';

function child(win: any, visible = true) { return { contentWindow: win, getBoundingClientRect: () => ({ width: visible ? 800 : 0, height: visible ? 600 : 0 }) }; }
function windowWith(frames: any[] = []) { return { document: { querySelectorAll: () => frames } }; }

test('the shared host accepts its own descendants but not unrelated windows', () => {
  const dashboard = windowWith(), hidden = windowWith(), root = windowWith([child(dashboard), child(hidden, false)]);
  const frame = child(root) as unknown as HTMLIFrameElement;
  expect(isActiveHubSource(frame, dashboard as any)).toBe(true);
  expect(isActiveHubSource(frame, hidden as any)).toBe(false);
  expect(isActiveHubSource(frame, hidden as any, false)).toBe(true);
  expect(isActiveHubSource(frame, windowWith() as any, false)).toBe(false);
});
