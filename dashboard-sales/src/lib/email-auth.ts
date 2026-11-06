import type { SupabaseClient } from '@supabase/supabase-js';

export const EMAIL_OTP_LENGTH = 8;
export function corporateEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return /^[^@\s]+@adere\.so$/.test(email) ? email : null;
}

type EmailAuth = Pick<SupabaseClient['auth'], 'signInWithOtp' | 'verifyOtp'>;
export async function sendEmailCode(auth: EmailAuth, value: string): Promise<string> {
  const email = corporateEmail(value);
  if (!email) throw new Error('Solo cuentas @adere.so.');
  const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  return email;
}
export async function verifyEmailCode(auth: EmailAuth, value: string, token: string): Promise<void> {
  const email = corporateEmail(value);
  if (!email || !/^\d{8}$/.test(token.trim())) throw new Error('Código o correo inválido.');
  const { data, error } = await auth.verifyOtp({ email, token: token.trim(), type: 'email' });
  if (error || !data.session) throw error ?? new Error('No se inició una sesión.');
}
