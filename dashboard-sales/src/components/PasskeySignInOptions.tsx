import { Fingerprint, KeyRound } from 'lucide-react';

export type PasskeyProvider = 'device' | 'keeper';

/** Keeper participates through WebAuthn; the website cannot select an extension for the user. */
export function PasskeySignInOptions({ busy, onSignIn }: {
  busy: boolean;
  onSignIn: (provider: PasskeyProvider) => void;
}) {
  return <>
    <button className="pill auth-passkey-button" type="button" disabled={busy} onClick={() => onSignIn('device')}>
      <Fingerprint size={20} aria-hidden="true" />{busy ? 'Confirma tu acceso…' : 'Entrar con Touch ID, Face ID o PIN'}
    </button>
    <button className="pill auth-passkey-button" type="button" disabled={busy} onClick={() => onSignIn('keeper')}>
      <KeyRound size={20} aria-hidden="true" />Entrar con Keeper
    </button>
    <p className="eyebrow auth-passkey-hint">Para usar Keeper, su extensión debe estar desbloqueada en este navegador.</p>
  </>;
}
