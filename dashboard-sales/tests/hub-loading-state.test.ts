import { expect, test } from 'bun:test';
import { HubLoadingState, type LoadingSnapshot } from '../src/lib/hub-loading-state';

function fixture() {
  let now = 0, seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let latest: LoadingSnapshot = { visible: true, complete: false, revealed: false, message: '' };
  const state = new HubLoadingState(value => { latest = value; }, {
    set(fn, delay) { const id = ++seq; timers.set(id, { at: now + delay, fn }); return id as any; },
    clear(id) { timers.delete(id as any); },
  });
  const advance = (ms: number) => {
    const until = now + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = until;
  };
  const booted = () => { state.setBoot(false); advance(100); state.finished(); };
  return { state, advance, booted, get latest() { return latest; }, timers };
}

test('one loading sequence spans frame, authentication and report work without competing finishes', () => {
  const f = fixture(), source = {};
  f.state.start('auth', source, 'Abriendo Dashboard');
  f.state.setBoot(false); f.state.start('report', source, 'Consultando pipeline');
  f.state.end('auth', source); f.advance(500);
  expect(f.latest.complete).toBe(false); expect(f.latest.message).toBe('Consultando pipeline');
  f.state.end('report', source, true); f.advance(100);
  expect(f.latest.complete).toBe(true); f.state.finished(); expect(f.latest.visible).toBe(false);
});

test('inline/warm views and queries finishing before the delay never display or finish a loader', () => {
  const f = fixture(), source = {}; f.booted();
  f.state.start('fast', source, 'Consulta'); f.advance(80); f.state.end('fast', source, true); f.advance(500);
  expect(f.latest.visible).toBe(false); expect(f.latest.complete).toBe(false);
});

test('a slow query shows one loader and later work cancels an unfinished success transition', () => {
  const f = fixture(), source = {}; f.booted();
  f.state.start('a', source, 'Consulta'); f.advance(180); expect(f.latest.visible).toBe(true);
  f.state.end('a', source, true); f.advance(100); expect(f.latest.complete).toBe(true);
  f.state.start('b', source, 'Otra consulta'); f.state.finished();
  expect(f.latest.visible).toBe(true); expect(f.latest.complete).toBe(false);
});

test('leaving a loading frame opens ready pages immediately and returning resumes only pending work', () => {
  const f = fixture(), a = {}, b = {}; f.booted();
  f.state.start('a', a, 'Dashboard'); f.advance(180);
  f.state.activate(source => source === b); expect(f.latest.visible).toBe(false);
  f.state.activate(source => source === a); f.advance(180); expect(f.latest.visible).toBe(true);
  f.state.activate(source => source === b); f.state.end('a', a, true);
  f.state.activate(source => source === a); f.advance(500); expect(f.latest.visible).toBe(false);
});

test('errors, stale completions and destroyed hosts cannot announce success', () => {
  const f = fixture(), source = {}; f.booted();
  f.state.start('a', source, 'Consulta'); f.advance(180);
  f.state.end('a', {}, true); expect(f.latest.complete).toBe(false);
  f.state.end('a', source, false); f.advance(500); expect(f.latest.visible).toBe(false); expect(f.latest.complete).toBe(false);
  f.state.start('b', source, 'Consulta'); f.state.dispose(); expect(f.timers.size).toBe(0);
});

test('phase updates replace the caption without restarting or completing the current loader', () => {
  const f = fixture(), source = {}; f.booted();
  f.state.start('report', source, 'Consultando negocios'); f.advance(180);
  f.state.update('report', {}, 'Mensaje ajeno'); expect(f.latest.message).toBe('Consultando negocios');
  f.state.update('report', source, 'Revisando tareas'); expect(f.latest.message).toBe('Revisando tareas');
  expect(f.latest.visible).toBe(true); expect(f.latest.complete).toBe(false);
  f.state.end('report', source, true); f.advance(100); expect(f.latest.complete).toBe(true);
});
