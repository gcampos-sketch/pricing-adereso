import { HubFirstAccess } from '@/components/HubFirstAccess';
import { AuthScene } from '@/components/AuthScene';
import { forgetDevice } from "@/lib/mfa-trust.functions";
import { clearTrustToken } from "@/lib/mfa-trust";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { UserRound, LogOut, RefreshCw, Fingerprint } from "lucide-react";
import { supportsPasskeys, passkeyErrorMessage, officialPasskeyOrigin, HUB_SIGN_IN_URL } from '@/lib/passkeys';
import { PasskeySettings } from '@/components/PasskeySettings';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRefreshMenu } from "@/contexts/RefreshContext";
import { MfaGate } from "@/components/MfaGate";
import { corporateEmail } from "@/lib/email-auth";

const AccountEmailContext = createContext<string | null>(null);
export const useAccountEmail = () => useContext(AccountEmailContext);

function isAllowed(session: Session | null) {
  const email = session?.user?.email?.toLowerCase() ?? "";
  return corporateEmail(email) !== null;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const passkeyRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { passkeyRequest.current?.abort(); }, []);
  const signInWithPasskey = async () => {
    if (passkeyBusy) return;
    if (!officialPasskeyOrigin(window.location.hostname)) { window.location.assign(HUB_SIGN_IN_URL); return; }
    setPasskeyBusy(true); setError(null);
    const controller = new AbortController(); passkeyRequest.current = controller;
    try {
      const { data, error } = await supabase.auth.signInWithPasskey({ options: { signal: controller.signal } });
      if (error) throw error;
      if (!data?.session || !isAllowed(data.session)) {
        await supabase.auth.signOut(); setError('Solo cuentas @adere.so pueden ingresar al Hub.');
      }
    } catch (error) { if (!controller.signal.aborted) setError(passkeyErrorMessage(error)); }
    finally { passkeyRequest.current = null; setPasskeyBusy(false); }
  };
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) void fetch('/api/hub/session', { method: 'DELETE', credentials: 'same-origin' });
      setReady(true);
    });
    supabase.auth.getSession().then(({ data: current }) => { setSession(current.session); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (ready && session && !isAllowed(session)) {
      setError('Solo cuentas @adere.so pueden ingresar al Hub.'); void supabase.auth.signOut();
    }
  }, [ready, session]);
  if (!ready) return <AuthScene><div className="skeleton" style={{ height: 44, width: 320, borderRadius: 12 }} /></AuthScene>;
  if (session && isAllowed(session)) return <AccountEmailContext.Provider value={session.user.email ?? null}><MfaGate key={session.user.id}><HubFirstAccess key={session.user.id} userId={session.user.id}>{children}</HubFirstAccess></MfaGate></AccountEmailContext.Provider>;
  const official = officialPasskeyOrigin(window.location.hostname);
  return <AuthScene><div className="auth-card">
    <h1 className="pulse-h2">Hub comercial</h1>
    <p className="eyebrow">Un solo acceso para todas tus herramientas de Adereso.</p>
    {error && <p className="status" data-tone="bad" role="alert">{error}</p>}
    <div className="auth-passkey-option">
      {!official ? <>
        <p className="eyebrow">Tu passkey está registrada en el Hub oficial. Ábrelo para ingresar con Touch ID, Face ID o Keeper.</p>
        <a className="pill auth-passkey-button" href={HUB_SIGN_IN_URL}><Fingerprint size={20} aria-hidden="true" />Abrir Hub oficial</a>
      </> : supportsPasskeys() ? <>
        <button className="pill auth-passkey-button" type="button" disabled={passkeyBusy} onClick={() => void signInWithPasskey()}><Fingerprint size={20} aria-hidden="true" />{passkeyBusy ? 'Confirma en tu dispositivo…' : 'Entrar con Touch ID / Face ID'}</button>
        <p className="eyebrow">También puedes elegir tu passkey de Keeper.</p>
      </> : <p role="status">Abre el Hub en un navegador compatible con passkeys para ingresar con tu dispositivo o Keeper.</p>}
      <p className="eyebrow">Google Authenticator confirma el segundo factor con su código de 6 dígitos cuando el Hub lo solicite.</p>
      <p className="eyebrow">Si todavía no tienes una passkey activada, contacta al administrador del Hub.</p>
    </div>
  </div></AuthScene>;
}

export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const email = useContext(AccountEmailContext);
  const { onRefresh, isRefreshing } = useRefreshMenu();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passkeyOpen, setPasskeyOpen] = useState(false);
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
      <Button variant="ghost" className="auth-hamburger-item" role="menuitem" onClick={() => { setMenuOpen(false); setPasskeyOpen(true); }}><Fingerprint size={15} aria-hidden="true" />Touch ID / Face ID</Button>
      {onRefresh && <Button variant="ghost" className="auth-hamburger-item" role="menuitem" disabled={isRefreshing} onClick={() => { onRefresh(); setMenuOpen(false); }}>
        <RefreshCw className={isRefreshing ? "auth-refresh-spin" : undefined} size={15} aria-hidden="true" />{isRefreshing ? "Actualizando…" : "Refrescar ahora"}
      </Button>}
      <Button variant="ghost" className="auth-hamburger-item" role="menuitem" onClick={() => { setMenuOpen(false); void (async () => { try { await forgetDevice(); } catch { /* ignore */ } clearTrustToken(); await supabase.auth.signOut(); })(); }}><LogOut size={15} aria-hidden="true" />Cerrar sesión</Button>
    </div>}
    <PasskeySettings open={passkeyOpen} onOpenChange={setPasskeyOpen} />
  </div>;
}
