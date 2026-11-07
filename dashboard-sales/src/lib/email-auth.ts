import type { SupabaseClient } from '@supabase/supabase-js';

export const EMAIL_OTP_LENGTH = 8;
export function emailSendErrorMessage(error: unknown): string {
  const info = error && typeof error === 'object' ? error as { status?: unknown; code?: unknown } : {};
  if (info.status === 429 || info.code === 'over_email_send_rate_limit' || info.code === 'over_request_rate_limit') {
    return 'El servicio de correo alcanzó su límite temporal de envíos. No se envió un correo nuevo. Espera antes de volver a solicitarlo; si persiste, el administrador debe revisar el servicio de correo.';
  }
  return 'No pudimos enviar el correo de acceso. Intenta más tarde o contacta al administrador.';
}
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
