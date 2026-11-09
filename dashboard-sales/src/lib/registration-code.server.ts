import type { SupabaseClient } from '@supabase/supabase-js';
import { corporateEmail } from './email-auth';
import type { CorporateAccessResult } from './sign-in-journey';

export function registrationSettingsAllowConfirmation(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const value = settings as { external?: { email?: unknown }; disable_signup?: unknown; mailer_autoconfirm?: unknown };
  return value.external?.email === true && value.disable_signup === false && value.mailer_autoconfirm === false;
}

/** Signup, never signInWithOtp: a confirmed account cannot use this as email login. */
export async function sendRegistrationCode(auth: Pick<SupabaseClient['auth'], 'signUp'>, value: string): Promise<CorporateAccessResult> {
  const email = corporateEmail(value);
  if (!email) throw new Error('Usa tu correo @adere.so.');
  // Native signup requires a password. Generate and discard it server-side;
  // nobody receives it and there is no password form in the Hub.
  const password = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('') + 'aA1!';
  const { data, error } = await auth.signUp({ email, password });
  if (error) {
    if (error.code === 'user_already_exists') return { next: 'passkey' };
    throw error;
  }
  // Fail closed if email confirmation was accidentally disabled in Auth.
  if (data.session) throw new Error('La confirmación de correo debe estar habilitada para crear cuentas.');
  // Auth deliberately returns an obfuscated user with empty identities for an
  // existing confirmed account. It has not sent a new signup confirmation.
  // Route to WebAuthn without returning user IDs or creating an email session.
  if (Array.isArray(data.user?.identities)) {
    return { next: data.user.identities.length === 0 ? 'passkey' : 'email-code' };
  }
  throw new Error('No se pudo determinar el siguiente paso de acceso.');
}
