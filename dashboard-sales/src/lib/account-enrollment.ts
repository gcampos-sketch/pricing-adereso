import type { SupabaseClient, User } from '@supabase/supabase-js';
import { corporateEmail, EMAIL_OTP_LENGTH } from './email-auth';

export function verifiedCorporateUser(user: Pick<User, 'email' | 'email_confirmed_at'> | null | undefined): boolean {
  return Boolean(user?.email && corporateEmail(user.email) && user.email_confirmed_at &&
    Number.isFinite(Date.parse(user.email_confirmed_at)));
}

export async function confirmRegistrationCode(auth: Pick<SupabaseClient['auth'], 'verifyOtp'>, value: string, code: string) {
  const email = corporateEmail(value);
  if (!email || !new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`).test(code.trim())) throw new Error('Correo o código inválido.');
  const { data, error } = await auth.verifyOtp({ email, token: code.trim(), type: 'signup' });
  if (error) throw error;
  if (!data.session || !verifiedCorporateUser(data.user) || data.user?.email?.toLowerCase() !== email) {
    throw new Error('No se pudo confirmar tu correo corporativo.');
  }
}
