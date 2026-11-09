import { createServerFn } from '@tanstack/react-start';
import { corporateEmail, emailSendErrorMessage } from './email-auth';

/** Public signup action. Native Auth enforces send/verify rate limits and single-use expiry. */
export const continueWithCorporateEmail = createServerFn({ method: 'POST' })
  .inputValidator((input: { email: string }) => {
    const email = corporateEmail(String(input?.email ?? ''));
    if (!email) throw new Error('Usa tu correo @adere.so.');
    return { email };
  })
  .handler(async ({ data }) => {
    const { createClient } = await import('@supabase/supabase-js');
    const { sendRegistrationCode, registrationSettingsAllowConfirmation } = await import('./registration-code.server');
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!url || !key) throw new Error('El registro no está disponible. Contacta al administrador.');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    try {
      const settings = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
        headers: { apikey: key }, signal: AbortSignal.timeout(5000), cache: 'no-store',
      });
      if (!settings.ok || !registrationSettingsAllowConfirmation(await settings.json())) {
        throw new Error('El registro requiere confirmación de correo y no está disponible con la configuración actual.');
      }
      return await sendRegistrationCode(client.auth, data.email);
    } catch (error) {
      // Return only a next step, never user records, provider payloads or tokens.
      throw new Error(emailSendErrorMessage(error));
    }
  });
