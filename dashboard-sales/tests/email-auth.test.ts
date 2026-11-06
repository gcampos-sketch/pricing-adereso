import { expect, test } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { corporateEmail, emailSendErrorMessage, sendEmailCode, verifyEmailCode } from '../src/lib/email-auth';
type Auth = Pick<SupabaseClient['auth'], 'signInWithOtp' | 'verifyOtp'>;
test('email limits explain that no new message was sent', () => {
 for (const error of [{ status: 429 }, { code: 'over_email_send_rate_limit' }, { code: 'over_request_rate_limit' }]) {
  expect(emailSendErrorMessage(error)).toContain('límite temporal');
  expect(emailSendErrorMessage(error)).toContain('No se envió un correo nuevo');
 }
});
test('other failures do not invent a rate limit or display provider payloads', () => {
 for (const error of [undefined, null, new Error('private provider details'), { status: 500 }]) {
  expect(emailSendErrorMessage(error)).not.toContain('límite');
  expect(emailSendErrorMessage(error)).not.toContain('private provider details');
 }
});
function fakeAuth() {
 const calls: unknown[] = [];
 const auth = { signInWithOtp: async (input: unknown) => { calls.push(input); return { error: null }; }, verifyOtp: async (input: unknown) => { calls.push(input); return { error: null, data: { session: { user: { email: 'persona@adere.so' } } } }; } } as unknown as Auth;
 return { auth, calls };
}
test('only exact corporate email is accepted, with normalized whitespace and case', () => {
 expect(corporateEmail(' Persona@ADERE.SO ')).toBe('persona@adere.so');
 for (const value of ['@adere.so', 'persona@adere.so.evil.test', 'persona@sub.adere.so', 'persona@gmail.com', 'Name <persona@adere.so>', 'one@two@adere.so']) expect(corporateEmail(value)).toBeNull();
});
test('invalid email is rejected before any code can be sent', async () => {
 const { auth, calls } = fakeAuth(); await expect(sendEmailCode(auth, 'other@example.com')).rejects.toThrow(); expect(calls).toHaveLength(0);
});
test('code request uses the normalized corporate email without a redirect link', async () => {
 const { auth, calls } = fakeAuth(); expect(await sendEmailCode(auth, ' PERSONA@adere.so ')).toBe('persona@adere.so');
 expect(calls).toEqual([{ email: 'persona@adere.so', options: { shouldCreateUser: true } }]);
});
test('verification rejects malformed codes or an outside email before contacting Auth', async () => {
 const { auth, calls } = fakeAuth();
 for (const token of ['123456', '1234567x', '123456789']) await expect(verifyEmailCode(auth, 'persona@adere.so', token)).rejects.toThrow();
 await expect(verifyEmailCode(auth, 'persona@other.test', '12345678')).rejects.toThrow(); expect(calls).toHaveLength(0);
});
test('valid email code is verified as email without elevating its MFA level', async () => {
 const { auth, calls } = fakeAuth(); await verifyEmailCode(auth, 'persona@adere.so', ' 12345678 ');
 expect(calls).toEqual([{ email: 'persona@adere.so', token: '12345678', type: 'email' }]);
});
test('a verification response without a session is not treated as a login', async () => {
 const { auth } = fakeAuth(); auth.verifyOtp = (async () => ({ error: null, data: { session: null } })) as unknown as Auth['verifyOtp'];
 await expect(verifyEmailCode(auth, 'persona@adere.so', '12345678')).rejects.toThrow();
});
