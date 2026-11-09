import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { roiEventInput } from '../src/lib/roi-sharing';

const source = readFileSync(new URL('../../roi-standalone.js', import.meta.url), 'utf8');
function calculator(search: string, visible = true) {
 const listeners: Record<string, (event?: unknown) => void> = {}, captures: Record<string,boolean> = {}, tasks = new Map<number, () => void>(), requests: unknown[] = [], store = new Map<string,string>();
 let next = 0;
 const document = { visibilityState: visible ? 'visible' : 'hidden', addEventListener: (kind: string, callback: () => void, capture=false) => { listeners[kind] = callback; captures[kind] = capture; } };
 const sandbox = createContext({
  URLSearchParams, location: { search }, crypto, document,
  window: { addEventListener: (kind: string, callback: () => void) => { listeners[kind] = callback; } },
  sessionStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key,value) },
  fetch: async (url: string, init: RequestInit) => { expect(url).toBe('/api/roi/events'); expect(init.credentials).toBe('omit'); requests.push(JSON.parse(String(init.body))); },
  setTimeout: (callback: () => void) => { tasks.set(++next, callback); return next; }, clearTimeout: (id: number) => tasks.delete(id),
  ROI_ORDER: ['atencion'], ROI_CASES: { atencion: { fields: [{ id:'consultas' },{ id:'costoEmpresa' }] } },
  roiPending: () => false, roiVals: () => ({ consultas:2000, costoEmpresa:800 }), roiTot: { gain:2400,cost:558 },
 });
 runInContext(source + '\nstartRoiActivity();', sandbox);
 const tick = () => { const callbacks = [...tasks.values()]; tasks.clear(); callbacks.forEach(callback => callback()); };
 const input = (trusted = true) => listeners.input?.({ isTrusted: trusted, target: { closest: () => ({}) } });
 const rerenderCard = () => {
  let attached = true;
  const event = { isTrusted:true,target:{closest:()=>attached?{}:null} };
  if(captures.click) listeners.click?.(event);
  runInContext('state.roiActive.atencion=true',sandbox); attached=false;
  if(!captures.click) listeners.click?.(event);
 };
 return { sandbox, document, tick, input, listeners, requests, tasks, rerenderCard };
}
const query = '?r=' + 'a'.repeat(64) + '&mensualidad=558';
test('generic and internal preview links emit no activity', () => {
 for (const search of ['', '?r=bad', query + '&preview=1']) {
  const calc = calculator(search); calc.tick(); calc.input(); calc.tick(); expect(calc.requests).toHaveLength(0);
 }
});
test('mail fetches and hidden documents do not count as opens', () => {
 const calc = calculator(query,false); calc.tick(); expect(calc.requests).toHaveLength(0);
 calc.document.visibilityState = 'visible'; calc.listeners.visibilitychange?.();
 expect(calc.requests).toHaveLength(1); expect(calc.requests[0]).toMatchObject({kind:'open',sequence:0,scenario:null});
 calc.listeners.visibilitychange?.(); expect(calc.requests).toHaveLength(1);
});
test('first quick interaction is retained, repeated inputs debounce and text never enters events', () => {
 const calc = calculator(query);
 runInContext('state.roiActive.atencion=true',calc.sandbox);
 for (let i=0;i<10;i++) calc.input(); calc.tick();
 expect(calc.requests).toHaveLength(2);
 expect(calc.requests[1]).toMatchObject({ kind:'scenario', sequence:1, scenario:{ cases:[{id:'atencion',values:{consultas:2000,costoEmpresa:800}}] } });
 for (const request of calc.requests) expect(roiEventInput.safeParse(request).success).toBe(true);
 calc.input(); calc.tick(); expect(calc.requests).toHaveLength(2);
 runInContext('state.externalCost=600',calc.sandbox); calc.input(false); calc.tick(); expect(calc.requests).toHaveLength(2);
 calc.input(); calc.tick(); expect(calc.requests).toHaveLength(3);
 expect(JSON.stringify(calc.requests)).not.toContain('email');
});
test('case toggles remain observable when the calculator replaces the clicked card', () => {
 const calc=calculator(query); calc.tick(); calc.rerenderCard(); calc.tick();
 expect(calc.requests).toHaveLength(2);
 expect(calc.requests[1]).toMatchObject({kind:'scenario',scenario:{cases:[{id:'atencion'}]}});
});
