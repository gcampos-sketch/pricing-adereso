import { expect, test } from 'bun:test';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { verifiedCorporateUser, confirmRegistrationCode } from '../src/lib/account-enrollment';
import { sendRegistrationCode, registrationSettingsAllowConfirmation } from '../src/lib/registration-code.server';
import { hasVerifiedIdentity } from '../src/lib/account-enrollment.server';

const user = { id: 'corporate-user', email: 'persona@adere.so', email_confirmed_at: '2026-11-08T12:00:00Z' } as User;

test('signup is unavailable when live confirmation settings are missing, unknown or disabled', () => {
  const settings = { external: { email: true }, disable_signup: false, mailer_autoconfirm: false };
  expect(registrationSettingsAllowConfirmation(settings)).toBe(true);
  for (const invalid of [null, {}, { ...settings, mailer_autoconfirm: true }, { ...settings, mailer_autoconfirm: undefined },
    { ...settings, external: { email: false } }, { ...settings, disable_signup: true }]) {
    expect(registrationSettingsAllowConfirmation(invalid)).toBe(false);
  }
});
type Auth = Pick<SupabaseClient['auth'], 'signUp' | 'verifyOtp'>;
function fakeAuth() {
  const calls: Record<string, unknown>[] = [];
  const auth = {
    signUp: async (input: Record<string, unknown>) => { calls.push(input); return { data: { user: { ...user, identities: [{ id: 'new-email-identity' }] }, session: null }, error: null }; },
    verifyOtp: async (input: Record<string, unknown>) => { calls.push(input); return { data: { user, session: { user } }, error: null }; },
  } as unknown as Auth;
  return { auth, calls };
}

test('a corporate suffix and user-editable verification flags never prove mailbox ownership', () => {
  expect(verifiedCorporateUser(user)).toBe(true);
  for (const invalid of [null, { ...user, email_confirmed_at: undefined }, { ...user, email_confirmed_at: 'invalid' },
    { ...user, email: 'persona@adere.so.evil.test' }, { ...user, email: 'persona@gmail.com' },
    { ...user, email_confirmed_at: undefined, user_metadata: { email_verified: true } }]) {
    expect(verifiedCorporateUser(invalid)).toBe(false);
  }
});

test('registration rejects non-corporate and lookalike domains before contacting Auth', async () => {
  const { auth, calls } = fakeAuth();
  for (const email of ['persona@gmail.com', 'a@sub.adere.so', 'a@adere.so.evil.test', 'a@b@adere.so']) {
    await expect(sendRegistrationCode(auth, email)).rejects.toThrow();
  }
  expect(calls).toHaveLength(0);
});

test('registration uses native signup, never routine email sign-in, and discards a fresh server password', async () => {
  const { auth, calls } = fakeAuth();
  expect(await sendRegistrationCode(auth, ' PERSONA@ADERE.SO ')).toEqual({ next: 'email-code' });
  await sendRegistrationCode(auth, 'persona@adere.so');
  expect(calls[0]?.email).toBe('persona@adere.so');
  expect(String(calls[0]?.password).length).toBeGreaterThanOrEqual(64);
  expect(String(calls[0]?.password).length).toBeLessThanOrEqual(72);
  expect(calls[0]?.password).not.toBe(calls[1]?.password);
  expect(Object.keys(calls[0]!)).toEqual(['email', 'password']);
});

test('an existing obfuscated account is routed to its passkey without an email login session', async () => {
  const { auth } = fakeAuth();
  auth.signUp = (async () => ({ data: { user: { ...user, identities: [] }, session: null }, error: null })) as unknown as Auth['signUp'];
  expect(await sendRegistrationCode(auth, user.email!)).toEqual({ next: 'passkey' });
});

test('the alternate already-registered Auth response also routes to WebAuthn', async () => {
  const { auth } = fakeAuth();
  auth.signUp = (async () => ({ data: { user: null, session: null }, error: { code: 'user_already_exists' } })) as unknown as Auth['signUp'];
  expect(await sendRegistrationCode(auth, user.email!)).toEqual({ next: 'passkey' });
});

test('ambiguous Auth responses cannot be announced as a code delivery or login', async () => {
  const { auth } = fakeAuth();
  for (const account of [null, { ...user, identities: undefined }]) {
    auth.signUp = (async () => ({ data: { user: account, session: null }, error: null })) as unknown as Auth['signUp'];
    await expect(sendRegistrationCode(auth, user.email!)).rejects.toThrow();
  }
});

test('accidentally enabled autoconfirm cannot expose a signup session to the caller', async () => {
  const { auth } = fakeAuth();
  auth.signUp = (async () => ({ data: { user, session: { access_token: 'never-returned' } }, error: null })) as unknown as Auth['signUp'];
  await expect(sendRegistrationCode(auth, user.email!)).rejects.toThrow('confirmación de correo');
});

test('mail send throttling and other provider errors are not reported as successful sends', async () => {
  const { auth } = fakeAuth();
  auth.signUp = (async () => ({ data: { user: null, session: null }, error: { status: 429 } })) as unknown as Auth['signUp'];
  await expect(sendRegistrationCode(auth, user.email!)).rejects.toBeDefined();
});

test('only the signup code type verifies registration, not a routine email login token', async () => {
  const { auth, calls } = fakeAuth();
  await confirmRegistrationCode(auth, ' PERSONA@ADERE.SO ', ' 12345678 ');
  expect(calls).toEqual([{ email: 'persona@adere.so', token: '12345678', type: 'signup' }]);
});

test('malformed registration codes and non-corporate emails never reach the provider', async () => {
  const { auth, calls } = fakeAuth();
  for (const code of ['123456', '1234567x', '123456789', '']) await expect(confirmRegistrationCode(auth, user.email!, code)).rejects.toThrow();
  await expect(confirmRegistrationCode(auth, 'a@adere.so.other.test', '12345678')).rejects.toThrow();
  expect(calls).toHaveLength(0);
});

test('expired and replayed codes cannot complete registration', async () => {
  const { auth } = fakeAuth();
  auth.verifyOtp = (async () => ({ data: { user: null, session: null }, error: new Error('otp_expired') })) as unknown as Auth['verifyOtp'];
  await expect(confirmRegistrationCode(auth, user.email!, '12345678')).rejects.toThrow();
});

test('missing session, unconfirmed identity and a code for another account all fail closed', async () => {
  const { auth } = fakeAuth();
  for (const data of [{ user, session: null }, { user: { ...user, email_confirmed_at: null }, session: {} },
    { user: { ...user, email: 'other@adere.so' }, session: {} }]) {
    auth.verifyOtp = (async () => ({ data, error: null })) as unknown as Auth['verifyOtp'];
    await expect(confirmRegistrationCode(auth, user.email!, '12345678')).rejects.toThrow();
  }
});

test('the server binds authoritative confirmed email to the signed session user and email', async () => {
  const auth = { getUser: async () => ({ data: { user }, error: null }) };
  expect(await hasVerifiedIdentity(auth, 'signed-token', user.id, user.email!)).toBe(true);
  expect(await hasVerifiedIdentity(auth, 'signed-token', 'other-user', user.email!)).toBe(false);
  expect(await hasVerifiedIdentity(auth, 'signed-token', user.id, 'other@adere.so')).toBe(false);
  expect(await hasVerifiedIdentity({ getUser: async () => ({ data: { user: { ...user, email_confirmed_at: undefined } }, error: null }) }, 'token', user.id, user.email!)).toBe(false);
  expect(await hasVerifiedIdentity({ getUser: async () => ({ data: { user: null }, error: new Error('revoked') }) }, 'token', user.id, user.email!)).toBe(false);
});
