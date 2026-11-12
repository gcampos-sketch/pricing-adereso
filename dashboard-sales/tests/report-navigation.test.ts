import { afterEach, expect, test } from 'bun:test';
import { readReportView, saveReportView } from '../src/lib/report-navigation';
const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
  else Reflect.deleteProperty(globalThis, 'sessionStorage');
});
test('new destinations and existing saved destinations survive a page refresh', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  }});
  for (const view of ['pipeline', 'forecast', 'conversion', 'comercial', 'proyectos', 'diagnostico'] as const) {
    saveReportView(view);
    expect(readReportView()).toBe(view);
  }
  values.set('adereso_report_view_v1', 'removed-or-malformed');
  expect(readReportView()).toBe('comercial');
});
test('unavailable browser storage never blocks navigation or the initial overview', () => {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw Error('blocked'); } });
  expect(() => saveReportView('pipeline')).not.toThrow();
  expect(readReportView()).toBe('comercial');
});
