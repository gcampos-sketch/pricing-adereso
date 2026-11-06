import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { readTrustToken } from '@/lib/mfa-trust';

/** Mounted only after the shared AuthGate and MfaGate have accepted the session. */
export function HubPortal() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
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
  if (!ready) return <main className="pulse-main"><div className="auth-card"><h1 className="pulse-h2">Hub comercial</h1><p role="status">{error ? 'No pudimos abrir tu sesión. Recarga la página o vuelve a ingresar.' : 'Abriendo tus herramientas…'}</p><button className="pill" onClick={() => { void supabase.auth.signOut(); }}>Volver al ingreso</button></div></main>;
  return <div className="hub-portal">
    <iframe className="hub-portal-frame" title="Hub comercial Adereso" src={'/hub-content/index.html' + window.location.search} />
    <button className="hub-sign-out" onClick={() => { void supabase.auth.signOut(); }}>Salir del Hub</button>
  </div>;
}
