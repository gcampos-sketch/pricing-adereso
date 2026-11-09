import { z } from 'zod';

const amount = z.number().finite().min(0).max(1e9);
export const roiContext = z.object({ mensualidad: amount, volumen: amount.int(), plantilla: amount.max(100).nullable() }).strict();
export const roiShareInput = z.object({ requestId: z.string().uuid(), dealId: z.string().regex(/^\d{1,20}$/), context: roiContext }).strict();
export const roiToken = z.string().regex(/^[a-f0-9]{64}$/);
const fieldsByCase: Record<string, readonly string[]> = {
 ventaautonoma: ['convs','conv','ticket'], carrito: ['carritos','recup','ticket'],
 calificacion: ['leads','calif','cierre','ticket','atribucion'], cassper: ['perdidas','recup','ticket'],
 outbound: ['mensajes','conv','ticket'], atencion: ['consultas','auto','minutos','ejecutivos','costoEmpresa'],
 sla: ['interacciones','fuga','valor'], retencion: ['riesgo','retenidos','ltv'],
 escalamiento: ['agentes','sueldo'], cobranza: ['mora','recup'],
};
// Keys are validated against the calculator's allowlist in the browser; arbitrary
// text, contact information and page URLs never enter an activity payload.
export const roiScenario = z.object({
 context: roiContext,
 cases: z.array(z.object({ id: z.string().refine(id => Object.hasOwn(fieldsByCase,id)), values: z.record(z.string().max(24), amount) }).strict().refine(c => Object.keys(c.values).every(key => fieldsByCase[c.id]?.includes(key)))).max(10).refine(cases => new Set(cases.map(c => c.id)).size === cases.length),
 gain: amount.max(1e15), cost: amount.max(1e15),
}).strict();
export const roiEventInput = z.object({ token: roiToken, sessionId: z.string().uuid(), sequence: z.number().int().min(0).max(500), kind: z.enum(['open', 'scenario']), scenario: roiScenario.nullable() }).strict().refine(v => v.kind === 'scenario' ? v.scenario !== null && v.sequence > 0 : v.scenario === null && v.sequence === 0);
export type RoiContext = z.infer<typeof roiContext>;
export type RoiShareInput = z.infer<typeof roiShareInput>;
export type RoiEvent = z.infer<typeof roiEventInput>;
export type RoiDeal = { id: string; name: string };
export type RoiContact = { id: string; name: string; email: string };
export class RoiError extends Error {
 constructor(public status: number, public code: string) { super(code); }
}
export function roiLink(origin: string, token: string, context: RoiContext) {
 const url = new URL('/roi/', origin);
 url.searchParams.set('r', roiToken.parse(token));
 url.searchParams.set('mensualidad', String(context.mensualidad));
 url.searchParams.set('volumen', String(context.volumen));
 if (context.plantilla !== null) url.searchParams.set('plantilla', String(context.plantilla));
 return url.href;
}
