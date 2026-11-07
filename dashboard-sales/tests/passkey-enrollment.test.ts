import { expect, test } from 'bun:test';
import { preparePasskeyEnrollment, passkeyErrorMessage } from '../src/lib/passkeys';

function auth(level: string | null, factors = [{ id: 'totp-verified', status: 'verified' }], error: unknown = null) {
  return { mfa: {
    getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: level }, error }),
    listFactors: async () => ({ data: { totp: factors }, error: null }),
  } };
}
test('a remembered AAL1 session needs its verified TOTP before enrollment', async () => {
  expect(await preparePasskeyEnrollment(auth('aal1'))).toEqual({ kind: 'verify', factorId: 'totp-verified' });
  expect(await preparePasskeyEnrollment(auth('aal2'))).toEqual({ kind: 'ready' });
});
test('missing assurance, read failures and unverified factors cannot enable registration', async () => {
  await expect(preparePasskeyEnrollment(auth(null))).rejects.toThrow();
  await expect(preparePasskeyEnrollment(auth('aal2', [], new Error('offline')))).rejects.toThrow();
  await expect(preparePasskeyEnrollment(auth('aal1', [{ id: 'not-ready', status: 'unverified' }]))).rejects.toThrow();
  const failing = auth('aal1');
  failing.mfa.listFactors = async () => ({ data: { totp: [] }, error: new Error('offline') });
  await expect(preparePasskeyEnrollment(failing)).rejects.toThrow();
});
test('Supabase step-up failures explain the required action', () => {
  expect(passkeyErrorMessage({ code: 'insufficient_aal' })).toContain('Authenticator');
});
