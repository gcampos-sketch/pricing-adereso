import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { readTrustToken } from '@/lib/mfa-trust';
import { AccountMenu } from '@/components/AuthGate';
import { HubLoading } from '@/components/HubLoading';
import { waitForHubFrame } from '@/lib/hub-frame-ready';
import { useHubLoadingHost } from '@/components/useHubLoadingHost';

/** Mounted only after the shared AuthGate and MfaGate have accepted the session. */
export function HubPortal() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const loading = useHubLoadingHost(frame, !frameReady);
  // The child keeps the address in sync; unrelated renders must not reload its frame.
  const [frameSrc] = useState(() => '/hub-content/index.html' + window.location.search);
  useEffect(() => {
    let active = true;
    const sync = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const trust = readTrustToken();
      try {
        const response = await fetch('/api/hub/session', { method: 'POST', credentials: 'same-origin', headers: {
          Authorization: `Bearer ${data.session.access_token}`, ...(trust ? { 'x-mfa-trust': trust } : {}),
        } });
        if (active) { setReady(response.ok); setError(!response.ok); }
      } catch { if (active) { setReady(false); setError(true); } }
    };
    void sync();
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === 'TOKEN_REFRESHED' || event === 'MFA_CHALLENGE_VERIFIED') queueMicrotask(() => { void sync(); });
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  if (!ready && !error) return <HubLoading message="Abriendo el Hub" />;
  if (!ready) return <main className="pulse-main"><div className="auth-card"><h1 className="pulse-h2">Hub comercial</h1><p role="alert">No pudimos abrir tu sesión. Recarga la página o vuelve a ingresar.</p><button className="pill" onClick={() => { void supabase.auth.signOut(); }}>Volver al ingreso</button></div></main>;
  return <div className="hub-portal">
    {loading.visible && <HubLoading complete={loading.complete} message={loading.message || 'Preparando tu página'} onComplete={loading.finish} />}
    <iframe ref={frame} className="hub-portal-frame" title="Hub comercial Adereso" onLoad={event => {
      void waitForHubFrame(event.currentTarget).then(() => setFrameReady(true)).catch(() => {
        setReady(false); setError(true);
      });
    }} inert={loading.visible} style={{ visibility: loading.revealed ? 'visible' : 'hidden' }} src={frameSrc} />
    <div className="hub-account-dock"><AccountMenu collapsed /></div>
  </div>;
}
