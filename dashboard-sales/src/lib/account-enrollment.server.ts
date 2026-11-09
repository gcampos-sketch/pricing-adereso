import { verifiedCorporateUser } from './account-enrollment';

/** Read authoritative Auth state, never user-editable metadata or browser flags. */
export async function hasRegisteredPasskey(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.auth.admin.passkey.listPasskeys({ userId });
  if (error || !Array.isArray(data)) throw new Error('No se pudo comprobar la passkey. Intenta de nuevo.');
  return data.length > 0;
}

export async function hasVerifiedIdentity(auth: {
  getUser: (jwt: string) => Promise<{ data: { user: import('@supabase/supabase-js').User | null }; error: unknown }>;
}, token: string, userId: string, email: string) {
  const { data, error } = await auth.getUser(token);
  return !error && data.user?.id === userId && data.user.email?.toLowerCase() === email.toLowerCase() && verifiedCorporateUser(data.user);
}
