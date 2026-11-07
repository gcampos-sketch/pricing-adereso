export const HUB_SIGN_IN_URL = 'https://adereso-hub-comercial.onrender.com/';
/** WebAuthn credentials stay bound to the production RP; never change it for local previews. */
export const officialPasskeyOrigin = (hostname: string) => hostname === 'adereso-hub-comercial.onrender.com';

/** Browser capability only; authorization always remains with Supabase and server MFA. */
export function supportsPasskeys() {
  return typeof window !== 'undefined' && window.isSecureContext &&
    typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;
}

export function passkeyErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (code === 'insufficient_aal') return 'Confirma tu código actual de Authenticator para activar una passkey.';
  if (name === 'NotAllowedError' || code === 'ERROR_CEREMONY_ABORTED' || code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY') {
    return 'No se completó la verificación. Intenta otra vez y elige tu dispositivo o Keeper.';
  }
  if (code === 'webauthn_challenge_expired') return 'La solicitud expiró. Intenta otra vez.';
  if (code === 'passkey_auth_disabled') return 'El acceso con passkey todavía no está habilitado. Contacta al administrador del Hub.';
  return 'No pudimos completar el acceso con passkey. Intenta otra vez y elige tu dispositivo o Keeper.';
}

type EnrollmentAuth = { mfa: {
  getAuthenticatorAssuranceLevel(): Promise<{ data: { currentLevel: string | null } | null; error: unknown }>;
  listFactors(): Promise<{ data: { totp: { id: string; status: string }[] } | null; error: unknown }>;
} };
export type PasskeyEnrollmentStep = { kind: 'ready' } | { kind: 'verify'; factorId: string };

/** Remembered Hub devices do not elevate the Supabase session to AAL2. */
export async function preparePasskeyEnrollment(auth: EnrollmentAuth): Promise<PasskeyEnrollmentStep> {
  const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data?.currentLevel) throw new Error('No pudimos comprobar tu sesión. Vuelve a ingresar al Hub.');
  if (data.currentLevel === 'aal2') return { kind: 'ready' };
  const factors = await auth.mfa.listFactors();
  if (factors.error) throw new Error('No pudimos comprobar tu segundo factor. Intenta otra vez.');
  const factor = factors.data?.totp.find(factor => factor.status === 'verified');
  if (!factor) throw new Error('Configura tu app de autenticación antes de activar una passkey. Vuelve a ingresar al Hub.');
  return { kind: 'verify', factorId: factor.id };
}
