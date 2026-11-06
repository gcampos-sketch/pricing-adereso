import { forgetDevice } from "@/lib/mfa-trust.functions";
import { clearTrustToken } from "@/lib/mfa-trust";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { UserRound, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRefreshMenu } from "@/contexts/RefreshContext";
import { MfaGate } from "@/components/MfaGate";
import { oauthReturnPath } from "@/lib/oauth-return-path";

const AccountEmailContext = createContext<string | null>(null);
export const useAccountEmail = () => useContext(AccountEmailContext);

const ALLOWED_DOMAIN = "adere.so";

function isAllowed(session: Session | null) {
  const email = session?.user?.email?.toLowerCase() ?? "";
  return email.endsWith(`@${ALLOWED_DOMAIN}`);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data: current }) => {
      setSession(current.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (ready && session && !isAllowed(session)) {
      setError(`Solo cuentas @${ALLOWED_DOMAIN} pueden ver este reporte.`);
      void supabase.auth.signOut();
    }
  }, [ready, session]);


  const signIn = async () => {
    // Google refuses authorization inside a frame. Authenticate in a top-level
    // tab; Supabase's storage events update the embedded session on return.
    if (window.self !== window.top) {
      window.open(window.location.href, '_blank', 'noopener');
      setError('Ingresa en la pestaña que se abrió y luego vuelve al hub.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: new URL(oauthReturnPath(window.location.pathname + window.location.search), window.location.origin).href,
          queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch {
      setError("No pudimos iniciar sesión con Google. Intenta de nuevo.");
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <main className="pulse-main">
        <div className="skeleton" style={{ height: 44, width: 320, borderRadius: 12 }} />
      </main>
    );
  }

  if (session && isAllowed(session)) {
    return <AccountEmailContext.Provider value={session.user.email ?? null}><MfaGate key={session.user.id}>{children}</MfaGate></AccountEmailContext.Provider>;
  }

  return (
    <main className="pulse-main">
      <div className="auth-card">
        <h1 className="pulse-h2">Sales Dashboard</h1>
        <p className="eyebrow">
          Acceso restringido al equipo Adereso. Ingresa con tu cuenta @{ALLOWED_DOMAIN}.
        </p>
        {error ? (
          <p className="status" data-tone="bad">
            {error}
          </p>
        ) : null}
        <button className="pill" type="button" onClick={() => void signIn()} disabled={busy}>
          {busy ? "Conectando…" : "Ingresar con Google"}
        </button>
      </div>
    </main>
  );
}

export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const email = useContext(AccountEmailContext);
  const { onRefresh, isRefreshing } = useRefreshMenu();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [menuOpen]);

  return <div className="sidebar-account" ref={menuRef}>
    <Button variant="ghost" className="sidebar-account-trigger" aria-label="Menú de cuenta" title={email ?? "Menú de cuenta"} aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((open) => !open)}>
      <UserRound aria-hidden="true" /><span>{email ?? "Mi cuenta"}</span>
    </Button>
    {menuOpen && <div className="auth-hamburger-menu sidebar-account-menu" data-collapsed={collapsed} role="menu" aria-label="Cuenta">
      <span className="auth-hamburger-email">{email}</span>
      {onRefresh && <Button variant="ghost" className="auth-hamburger-item" role="menuitem" disabled={isRefreshing} onClick={() => { onRefresh(); setMenuOpen(false); }}>
        <RefreshCw className={isRefreshing ? "auth-refresh-spin" : undefined} size={15} aria-hidden="true" />{isRefreshing ? "Actualizando…" : "Refrescar ahora"}
      </Button>}
      <Button variant="ghost" className="auth-hamburger-item" role="menuitem" onClick={() => { setMenuOpen(false); void (async () => { try { await forgetDevice(); } catch { /* ignore */ } clearTrustToken(); await supabase.auth.signOut(); })(); }}><LogOut size={15} aria-hidden="true" />Cerrar sesión</Button>
    </div>}
  </div>;
}
