import { z } from 'zod';

const amount = z.number().finite().min(0).max(1e9);
export const walletContext = z.object({
 existing: z.boolean(), country: z.enum(['CL','AR','BR','CO','MX','PE','ES','XL']),
 wallet: z.enum(['no_recurrente','recurrente']), fee: amount.max(20).nullable(),
 conversations: amount.int(), messagesPerConversation: amount.min(1).max(20),
 quantities: z.object({ service: amount, marketing: amount, utility: amount, authentication: amount, minutes: amount }).strict(),
 amount, manual: z.boolean(),
}).strict();
export const walletShareInput = z.object({ requestId: z.string().uuid(), dealId: z.string().regex(/^\d{1,20}$/), context: walletContext }).strict();
export const walletToken = z.string().regex(/^[a-f0-9]{64}$/);
// These are observed browser scenarios, not invoices or verified purchases.
const total = z.number().finite().min(0).max(1e12).nullable();
export const walletScenario = z.object({ context: walletContext, meta: total, fee: total, estimated: total }).strict();
export const walletEventInput = z.object({ token: walletToken, sessionId: z.string().uuid(), sequence: z.number().int().min(0).max(500), kind: z.enum(['open','scenario']), scenario: walletScenario.nullable() }).strict().refine(v => v.kind === 'scenario' ? v.scenario !== null && v.sequence > 0 : v.scenario === null && v.sequence === 0);
export type WalletContext = z.infer<typeof walletContext>;
export type WalletShareInput = z.infer<typeof walletShareInput>;
export type WalletEvent = z.infer<typeof walletEventInput>;
export type WalletDeal = { id: string; name: string };
export type WalletContact = { id: string; name: string; email: string };
export class WalletError extends Error {
 constructor(public status: number, public code: string) { super(code); }
}
export function walletLink(origin: string, token: string, context: WalletContext) {
 const url = new URL('/billetera-meta/', origin);
 url.searchParams.set('w', walletToken.parse(token));
 url.searchParams.set('c', JSON.stringify(walletContext.parse(context)));
 return url.href;
}
