import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

// Available during onboarding, before the content middleware requires a passkey.
export const getPasskeyStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasRegisteredPasskey } = await import('./account-enrollment.server');
    return { registered: await hasRegisteredPasskey(context.userId) };
  });
