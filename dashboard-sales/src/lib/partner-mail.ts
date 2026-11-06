import { z } from 'zod';
export const partnerSelection = z.object({ tipo: z.enum(['reseller', 'referido']), categoria: z.enum(['basic', 'advanced', 'gold']), rebase: z.boolean(), soporte: z.boolean() }).strict();
export const partnerMailInput = z.object({
 requestId: z.string().uuid(),
 to: z.string().trim().email().max(254).regex(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/),
 message: z.string().trim().min(1).max(4000),
 selection: partnerSelection,
}).strict();
export function partnerMailLink(selection: z.infer<typeof partnerSelection>) {
 const p = new URLSearchParams({ vista: 'partners', tipo: selection.tipo, categoria: selection.categoria, rebase: selection.rebase ? '1' : '0', soporte: selection.soporte ? '1' : '0' });
 return 'https://adereso-partners.onrender.com/partners/?' + p;
}

export function googleMailAccountMatches(claims: unknown, email: string, expected: { sub?: string; nonce?: string; hostedDomain?: boolean } = {}): boolean {
 if (!claims || typeof claims !== 'object') return false;
 const c = claims as Record<string, unknown>;
 return typeof c['sub'] === 'string' && !!c['sub'] && c['email_verified'] === true
  && typeof c['email'] === 'string' && c['email'].toLowerCase() === email && /^[^@\s]+@adere\.so$/.test(email)
  && (!expected.sub || c['sub'] === expected.sub) && (!expected.nonce || c['nonce'] === expected.nonce)
  && (!expected.hostedDomain || c['hd'] === 'adere.so');
}
