import { expect, test } from 'bun:test';
import { createPulseStream, decodeReportStream } from '../src/lib/report-stream';
import type { ReportPhase } from '../src/lib/report-phases';
const origin = 'https://hub.example';
const request = (body: unknown = {}, headers: Record<string,string> = {}) => new Request(origin + '/api/reports/pulse-stream', {
  method: 'POST', headers: { origin, Authorization: 'Bearer fixture-token', ...headers }, body: JSON.stringify(body),
});

test('real phases arrive before the report is ready, in the producer order', async () => {
  let finish!: () => void;
  const handler = createPulseStream({ authorize: async () => ({ expiresAt: Date.now() + 60000 }),
    load: async (_, phase) => { phase('records'); await new Promise<void>(resolve => { finish = resolve; }); phase('tasks'); return { total: 7 }; },
  });
  const response = (await handler(request()))!;
  expect(response.headers.get('cache-control')).toContain('no-store');
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('records');
  finish();
  const rest = await new Response(new ReadableStream({ async start(controller) { while(true) { const chunk = await reader.read(); if(chunk.done)break;controller.enqueue(chunk.value); } controller.close(); } })).text();
  expect(rest.indexOf('tasks')).toBeLessThan(rest.indexOf('result'));
  expect(rest).toContain('"total":7');
});

test('authorization, exact origin and bounded validated input precede any report read', async () => {
  let reads = 0;
  const handler = createPulseStream({ authorize: async token => token === 'fixture-token' ? { expiresAt: Date.now() + 60000 } : null, load: async () => { reads++; return {}; } });
  for (const [req, status] of [[request({}, { origin: 'https://foreign.example' }),403], [request({}, { Authorization: 'Bearer forged' }),401], [request({role:'admin'}),400], [request({role:'AE', fresh:true}),400], [request({x:'a'.repeat(200)}),400]] as const) expect((await handler(req))!.status).toBe(status);
  expect(reads).toBe(0);
  const expired = createPulseStream({ authorize: async () => ({ expiresAt: 1 }), load: async () => { reads++; return {}; } });
  expect((await expired(request()))!.status).toBe(401);
  expect(reads).toBe(0);
});

test('concurrent requests retain separate roles, streams and failure outcomes', async () => {
  const handler = createPulseStream({ authorize: async () => ({ expiresAt: Date.now()+60000 }), load: async (role, phase) => { phase('records'); if(role==='KAM')throw Error('private backend details'); return { role }; } });
  const [a,b] = await Promise.all([handler(request({role:'AE'})),handler(request({role:'KAM'}))]);
  expect(await decodeReportStream(a!,()=>{})).toEqual({ role:'AE' });
  await expect(decodeReportStream(b!,()=>{})).rejects.toThrow('No pudimos leer');
});

test('network fragments preserve Unicode and accept only known phase labels', async () => {
  const text = JSON.stringify({type:'phase',phase:'tasks'})+'\n'+JSON.stringify({type:'phase',phase:'invented'})+'\n'+JSON.stringify({type:'result',report:{name:'José 🧉'}})+'\n';
  const bytes = new TextEncoder().encode(text), phases: ReportPhase[] = [];
  const response = new Response(new ReadableStream({ start(controller) { for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close(); } }));
  expect(await decodeReportStream(response,phase=>phases.push(phase))).toEqual({name:'José 🧉'});
  expect(phases).toEqual(['tasks']);
});

test('a truncated or invalid result never becomes a successful load', async () => {
  await expect(decodeReportStream(new Response('{"type":"phase","phase":"records"}\n'),()=>{})).rejects.toThrow('sin entregar');
  await expect(decodeReportStream(new Response('{"type":"result"}\n'),()=>{})).rejects.toThrow('inválido');
});
