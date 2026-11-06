import { useEffect, useRef, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { supportsPasskeys, passkeyErrorMessage } from '@/lib/passkeys';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/** Render only inside AuthGate + MfaGate. Credentials are created by the user's OS. */
export function PasskeySettings({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open) { pending.current?.abort(); setError(null); setRegistered(false); }
    return () => { pending.current?.abort(); };
  }, [open]);

  const register = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const { data, error } = await supabase.auth.registerPasskey({ options: { signal: controller.signal } });
      if (error) throw error;
      if (!data) throw new Error('Missing verified credential');
      if (!controller.signal.aborted) setRegistered(true);
    } catch (error) {
      if (!controller.signal.aborted) setError(passkeyErrorMessage(error));
    } finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="passkey-dialog">
      <Fingerprint size={30} aria-hidden="true" />
      <DialogTitle>Acceso con Touch ID / Face ID</DialogTitle>
      <DialogDescription>Activa una passkey para ingresar sin esperar un correo. Tu dispositivo puede usar huella, rostro, PIN o una llave de seguridad.</DialogDescription>
      <p className="eyebrow">Tu huella y tu rostro permanecen en tu dispositivo. Google Authenticator y los códigos de recuperación siguen disponibles; podemos pedir el segundo factor en un navegador nuevo.</p>
      {error && <p role="alert" className="status" data-tone="bad">{error}</p>}
      {registered ? <><p role="status">Passkey activada. En tu próximo ingreso elige «Entrar con Touch ID / Face ID».</p><button className="pill" onClick={() => onOpenChange(false)}>Listo</button></> :
        <><button className="pill" disabled={busy || !supportsPasskeys()} onClick={() => void register()}>{busy ? 'Confirma en tu dispositivo…' : 'Activar en este dispositivo'}</button>
        {!supportsPasskeys() && <p role="status">Abre el Hub en tu navegador habitual para activar una passkey.</p>}</>}
    </DialogContent>
  </Dialog>;
}
