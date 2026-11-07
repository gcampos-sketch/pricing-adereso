import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const start = source.indexOf('/* Fin de página:');
const end = source.indexOf('const POPS=', start);
const effect = source.slice(start, end);
function setup(view: string, modalOpen = false) {
  const listeners: Record<string, (event: any) => void> = {};
  const element = () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => modalOpen } });
  const wrap = element(), drop = element(), label = element();
  const cap = { ...element(), querySelector: () => label };
  runInNewContext(effect, { curView: view, prefersReduced: true,
    window: { scrollY: 0, innerHeight: 800, addEventListener: (type: string, fn: typeof listeners[string]) => { listeners[type] = fn; } },
    document: { documentElement: { scrollHeight: 800 }, querySelector: () => wrap,
      getElementById: (id: string) => id === 'endCap' ? cap : id === 'endDrop' ? drop : element() },
    setTimeout: () => 1, clearTimeout() {},
  });
  return listeners;
}
test('the Pricing overscroll effect never cancels home or other Hub view gestures', () => {
  for (const view of ['home', 'descuentos', 'embed', 'academy', 'playbook', 'argumentos', 'operativa', 'progpartners']) {
    const events = setup(view); let prevented = false;
    events.wheel!({ deltaY: 120, ctrlKey: false, preventDefault() { prevented = true; } });
    events.touchstart!({ touches: [{ clientY: 400 }] });
    events.touchmove!({ touches: [{ clientY: 200 }], cancelable: true, preventDefault() { prevented = true; } });
    expect(prevented).toBe(false);
  }
});
test('Pricing retains its end effect and leaves an open modal free to scroll', () => {
  for (const modal of [false, true]) {
    let prevented = false;
    setup('pricing', modal).wheel!({ deltaY: 120, ctrlKey: false, preventDefault() { prevented = true; } });
    expect(prevented).toBe(!modal);
  }
});
