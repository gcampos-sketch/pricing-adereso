import { useEffect, useState, type ReactNode } from 'react';
import { AuthScene } from './AuthScene';
import { HubLoading } from './HubLoading';
import { PasskeySettings } from './PasskeySettings';
import { getPasskeyStatus } from '@/lib/passkey-status.functions';
import { officialPasskeyOrigin, HUB_SIGN_IN_URL } from '@/lib/passkeys';
import { supabase } from '@/integrations/supabase/client';
import { rememberSignInDevice } from '@/lib/sign-in-journey';

/** MFA alone cannot complete onboarding; the server independently checks this too. */
export function PasskeyGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready' | 'error'>('loading');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (status === 'ready') { try { rememberSignInDevice(localStorage); } catch { /* optional hint */ } }
  }, [status]);
  useEffect(() => {
    let active = true;
    void getPasskeyStatus().then(({ registered }) => { if (active) setStatus(registered ? 'ready' : 'missing'); })
      .catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, []);
  const recheck = async () => {
    setStatus('loading');
    try { const { registered } = await getPasskeyStatus(); setStatus(registered ? 'ready' : 'missing'); }
    catch { setStatus('error'); }
  };
  if (status === 'loading') return <HubLoading message="Comprobando tu passkey" />;
  if (status === 'ready') return <>{children}</>;
  const official = officialPasskeyOrigin(window.location.hostname);
  return <AuthScene><div className="auth-card">
    <p className="eyebrow">CREAR CUENTA · PASO 3 DE 3</p>
    <h1 className="pulse-h2">Guarda tu passkey</h1>
    <p className="eyebrow">Tu correo y Authenticator ya están confirmados. Guarda tu passkey en Keeper o en tu dispositivo para entrar al Hub las próximas veces.</p>
    {status === 'error' ? <>
      <p role="alert" className="status" data-tone="bad">No pudimos comprobar tu passkey. El acceso sigue protegido.</p>
      <button className="pill" onClick={() => void recheck()}>Reintentar</button>
    </> : official ? <button className="pill" onClick={() => setOpen(true)}>Guardar passkey</button>
      : <a className="pill" href={HUB_SIGN_IN_URL}>Configurar en el Hub oficial</a>}
    <button className="pill" onClick={() => void supabase.auth.signOut()}>Salir</button>
    {official && <PasskeySettings open={open} onOpenChange={setOpen} onRegistered={() => { setOpen(false); void recheck(); }} />}
  </div></AuthScene>;
}
