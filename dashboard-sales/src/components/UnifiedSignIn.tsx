import { useRef, useState, type FormEvent } from 'react';
import { corporateEmail, EMAIL_OTP_LENGTH } from '@/lib/email-auth';
import type { CorporateAccessResult } from '@/lib/sign-in-journey';
import { PasskeySignInOptions, type PasskeyProvider } from './PasskeySignInOptions';

type Step = 'start' | 'email' | 'email-code' | 'passkey';

/** The same public journey for new accounts and returning users. No authorization here. */
export function UnifiedSignIn({ knownDevice, continueWithEmail, verifyEmail, onSignIn, passkeyBusy, passkeyError, passkeysAvailable, clearPasskeyError }: {
  knownDevice: () => boolean;
  continueWithEmail: (email: string) => Promise<CorporateAccessResult>;
  verifyEmail: (email: string, code: string) => Promise<unknown>;
  onSignIn: (provider: PasskeyProvider) => void;
  passkeyBusy: boolean;
  passkeyError: string | null;
  passkeysAvailable: boolean;
  clearPasskeyError: () => void;
}) {
  const [step, setStep] = useState<Step>('start');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextSend = useRef(0);
  const operation = useRef(false);

  const send = async () => {
    const normalized = corporateEmail(email);
    if (!normalized) { setError('Usa tu correo @adere.so.'); return; }
    if (operation.current) return;
    if (Date.now() < nextSend.current) { setError('Espera un minuto antes de solicitar otro código.'); return; }
    operation.current = true; setBusy(true); setError(null); clearPasskeyError();
    try {
      const result = await continueWithEmail(normalized);
      setEmail(normalized); setCode('');
      if (result.next !== 'passkey' && result.next !== 'email-code') throw new Error('No pudimos preparar tu acceso. Intenta de nuevo.');
      if (result.next === 'email-code') nextSend.current = Date.now() + 60_000;
      setStep(result.next);
    } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos continuar. Intenta más tarde.'); }
    finally { operation.current = false; setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (operation.current || passkeyBusy) return;
    if (step === 'email') { await send(); return; }
    if (step !== 'email-code' || code.length !== EMAIL_OTP_LENGTH) return;
    operation.current = true; setBusy(true); setError(null);
    try { await verifyEmail(email, code); }
    catch { setError('Código incorrecto o vencido. Revisa el último correo o solicita uno nuevo.'); setCode(''); }
    finally { operation.current = false; setBusy(false); }
  };

  if (step === 'start') return <div className="auth-card">
    <h1 className="pulse-h2">Hub comercial</h1>
    <p className="eyebrow">Todas tus herramientas de Adereso, en un solo lugar.</p>
    <button className="pill auth-passkey-button" type="button" onClick={() => { setError(null); setStep(knownDevice() ? 'passkey' : 'email'); }}>Iniciar sesión</button>
  </div>;

  if (step === 'passkey') return <div className="auth-card">
    <h1 className="pulse-h2">Confirma tu acceso</h1>
    <p className="eyebrow">{email ? `Continúa con tu passkey para ${email}.` : 'Usa tu passkey para continuar al Hub.'}</p>
    {passkeyError && <p className="status" data-tone="bad" role="alert">{passkeyError}</p>}
    <div className="auth-passkey-option">
      {passkeysAvailable ? <PasskeySignInOptions busy={passkeyBusy} onSignIn={onSignIn} />
        : <p role="alert">Abre el Hub en un navegador compatible con passkeys para continuar.</p>}
      <div className="auth-email-actions"><button type="button" disabled={passkeyBusy} onClick={() => { setError(null); clearPasskeyError(); nextSend.current = 0; setStep('email'); }}>{email ? 'Usar otro correo' : 'Continuar con mi correo'}</button></div>
    </div>
  </div>;

  return <form className="auth-card" onSubmit={event => void submit(event)}>
    <h1 className="pulse-h2">{step === 'email-code' ? 'Confirma tu correo' : 'Tu correo de Adereso'}</h1>
    <p className="eyebrow">{step === 'email-code' ? `Ingresa el código que enviamos a ${email}.` : 'Escribe tu correo corporativo para continuar.'}</p>
    <div className="auth-email-form">
      {step === 'email' ? <>
        <label htmlFor="sign-in-email">Correo corporativo</label>
        <input key="email" id="sign-in-email" className="auth-email-input" type="email" autoComplete="email" placeholder="nombre@adere.so" value={email} onChange={event => setEmail(event.target.value)} required autoFocus disabled={busy} maxLength={254} />
      </> : <>
        <label htmlFor="sign-in-code">Código de {EMAIL_OTP_LENGTH} dígitos del correo</label>
        <input key="email-code" id="sign-in-code" className="auth-email-input auth-email-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, EMAIL_OTP_LENGTH))} maxLength={EMAIL_OTP_LENGTH} minLength={EMAIL_OTP_LENGTH} required autoFocus disabled={busy} />
        <p className="eyebrow">Después protegeremos tu acceso con Authenticator y tu passkey. Solo lo configurarás una vez.</p>
      </>}
      {error && <p className="status" data-tone="bad" role="alert">{error}</p>}
      <button className="pill auth-passkey-button" type="submit" disabled={busy || (step === 'email-code' && code.length !== EMAIL_OTP_LENGTH)}>{busy ? 'Un momento…' : 'Continuar'}</button>
      <div className="auth-email-actions">
        {step === 'email-code' && <button type="button" disabled={busy} onClick={() => void send()}>Solicitar otro código</button>}
        <button type="button" disabled={busy} onClick={() => { setError(null); setCode(''); if (step === 'email-code') { nextSend.current = 0; setStep('email'); } else setStep('start'); }}>{step === 'email-code' ? 'Cambiar correo' : 'Volver'}</button>
      </div>
    </div>
  </form>;
}
