import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Fingerprint } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { supportsPasskeys, passkeyErrorMessage, preparePasskeyEnrollment, type PasskeyEnrollmentStep } from '@/lib/passkeys';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/** Render only inside AuthGate + MfaGate. Credentials are created by the user's OS. */
export function PasskeySettings({ open, onOpenChange, onRegistered }: { open: boolean; onOpenChange: (open: boolean) => void; onRegistered?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<PasskeyEnrollmentStep | { kind: 'loading' } | { kind: 'error' }>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    setError(null); setRegistered(false); setCode(''); setStep({ kind: 'loading' });
    if (open) void preparePasskeyEnrollment(supabase.auth).then(step => { if (active) setStep(step); }).catch(error => {
      if (active) { setStep({ kind: 'error' }); setError(error.message); }
    });
    return () => { active = false; pending.current?.abort(); };
  }, [open]);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || step.kind !== 'verify' || code.length !== 6) return;
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: step.factorId, code });
      if (error) { setError('Código incorrecto o expirado. Usa el código actual de tu app.'); return; }
      setStep(await preparePasskeyEnrollment(supabase.auth));
    } catch { setError('No pudimos verificar tu sesión. Intenta otra vez.'); }
    finally { setCode(''); setBusy(false); }
  };

  const register = async () => {
    if (busy || step.kind !== 'ready') return;
    setBusy(true); setError(null);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const current = await preparePasskeyEnrollment(supabase.auth);
      if (controller.signal.aborted) return;
      if (current.kind !== 'ready') { setStep(current); return; }
      const { data, error } = await supabase.auth.registerPasskey({ options: { signal: controller.signal } });
      if (error) throw error;
      if (!data) throw new Error('Missing verified credential');
      if (!controller.signal.aborted) { setRegistered(true); onRegistered?.(); }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(passkeyErrorMessage(error));
        if (error && typeof error === 'object' && 'code' in error && error.code === 'insufficient_aal') {
          try { setStep(await preparePasskeyEnrollment(supabase.auth)); } catch { setStep({ kind: 'error' }); }
        }
      }
    } finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="passkey-dialog">
      <Fingerprint size={30} aria-hidden="true" />
      <DialogTitle>Tu passkey de acceso</DialogTitle>
      <DialogDescription>Guárdala en Keeper o en tu dispositivo. Puedes usar huella, rostro, PIN o una llave de seguridad.</DialogDescription>
      <p className="eyebrow">Tu huella y tu rostro permanecen en tu dispositivo. Google Authenticator y los códigos de recuperación siguen disponibles; podemos pedir el segundo factor en un navegador nuevo.</p>
      {error && <p role="alert" className="status" data-tone="bad">{error}</p>}
      {registered ? <><p role="status">Passkey activada. En tu próximo ingreso elige Keeper o tu dispositivo, según dónde la guardaste.</p><button className="pill" onClick={() => onOpenChange(false)}>Listo</button></> : step.kind === 'loading' ? <p role="status">Comprobando tu sesión…</p> : step.kind === 'verify' ?
        <form className="auth-email-form" onSubmit={event => void verify(event)}>
          <p className="eyebrow">Para crear tu passkey, confirma una vez el código de 6 dígitos de tu app de autenticación. Después podrás guardarla en Keeper.</p>
          <label htmlFor="passkey-mfa-code">Código de Authenticator</label>
          <input id="passkey-mfa-code" className="auth-email-input auth-email-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} required disabled={busy} />
          <button className="pill" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Confirmar código'}</button>
        </form> : step.kind === 'ready' ?
        <><p className="eyebrow">Para guardarla en Keeper, primero desbloquea su extensión. Al continuar, elige guardar la passkey en Keeper.</p>
        <button className="pill" disabled={busy || !supportsPasskeys()} onClick={() => void register()}>{busy ? 'Confirma dónde guardarla…' : 'Crear passkey en Keeper o mi dispositivo'}</button>
        {!supportsPasskeys() && <p role="status">Abre el Hub en tu navegador habitual para activar una passkey.</p>}</> : <button className="pill" onClick={() => onOpenChange(false)}>Cerrar</button>}
    </DialogContent>
  </Dialog>;
}
