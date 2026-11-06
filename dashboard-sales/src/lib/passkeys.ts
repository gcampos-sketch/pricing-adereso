/** Browser capability only; authorization always remains with Supabase and server MFA. */
export function supportsPasskeys() {
  return typeof window !== 'undefined' && window.isSecureContext &&
    typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials;
}

export function passkeyErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || code === 'ERROR_CEREMONY_ABORTED' || code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY') {
    return 'No se completó la verificación. Puedes intentarlo otra vez o usar tu correo.';
  }
  if (code === 'webauthn_challenge_expired') return 'La solicitud expiró. Intenta otra vez.';
  if (code === 'passkey_auth_disabled') return 'El acceso con passkey todavía no está habilitado. Usa tu correo por ahora.';
  return 'No pudimos completar el acceso con passkey. Intenta otra vez o usa tu correo.';
}
