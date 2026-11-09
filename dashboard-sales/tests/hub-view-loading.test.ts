import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const start = html.indexOf('/* One top-level loader owns actual frame/content work.');
const script = html.slice(start, html.indexOf('function renderAppRail()', start));
function fixture() {
  const messages: any[] = [], frames = new Map<string, any>(); let seq = 0;
  const top = { location: { origin: 'https://hub.example' }, document: { documentElement: { dataset: { hubLoadingHost: 'true' } } }, postMessage: (message: unknown) => messages.push(message) };
  const ctx: any = { top, window: {}, location: { origin: 'https://hub.example' }, crypto: { randomUUID: () => 'task-' + (++seq) },
    document: { getElementById: (id: string) => frames.get(id) }, ALL_TOOLS: [{ k: 'dashboard', view: 'embed', name: 'Dashboard' }, { k: 'playbook', view: 'playbook', name: 'Playbook' }], requestAnimationFrame: (fn: () => void) => fn() };
  runInNewContext(script, ctx);
  const frame = (id: string, ready?: Promise<boolean>) => {
    const listeners = new Map<string, () => void>();
    const value = { dataset: { hubNavigating: 'true' } as Record<string, string>, contentDocument: { fonts: { ready: Promise.resolve() } }, contentWindow: { aderesoContentReady: ready },
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn), removeEventListener: (type: string) => listeners.delete(type) };
    frames.set(id, value); return { value, load: () => listeners.get('load')?.() };
  };
  return { messages, frame, enter: (view: string, tool?: string) => ctx.trackHubViewLoad(view, tool) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('Pricing, Home and already-ready frames never request a loader', () => {
  const f = fixture(); f.enter('pricing'); f.enter('home');
  f.frame('pbFrame').value.dataset.hubReady = 'true'; f.enter('playbook');
  expect(f.messages.filter(x => x.action === 'start')).toHaveLength(0);
});

test('a guide finishes only after its real content is available, not at iframe load', async () => {
  const f = fixture(); let resolve!: (value: boolean) => void;
  const guide = f.frame('pbFrame', new Promise(done => { resolve = done; }));
  f.enter('playbook'); guide.load(); await flush();
  expect(f.messages.some(x => x.action === 'end')).toBe(false);
  resolve(true); await flush();
  expect(f.messages.find(x => x.action === 'end')?.success).toBe(true);
});

test('changing views cancels old work and a failed guide never announces success', async () => {
  const f = fixture(), old = f.frame('evFrame'); f.enter('embed', 'dashboard'); f.enter('pricing'); old.load(); await flush();
  expect(f.messages.some(x => x.action === 'cancel')).toBe(true);
  expect(f.messages.some(x => x.action === 'end')).toBe(false);
  const guide = f.frame('pbFrame', Promise.resolve(false)); f.enter('playbook'); guide.load(); await flush();
  expect(f.messages.find(x => x.action === 'end')?.success).toBe(false);
});
