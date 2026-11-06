import { forgetDevice } from "@/lib/mfa-trust.functions";
import { clearTrustToken } from "@/lib/mfa-trust";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { UserRound, LogOut, RefreshCw, Fingerprint } from "lucide-react";
import { supportsPasskeys, passkeyErrorMessage } from '@/lib/passkeys';
import { PasskeySettings } from '@/components/PasskeySettings';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRefreshMenu } from "@/contexts/RefreshContext";
import { MfaGate } from "@/components/MfaGate";
import { corporateEmail, EMAIL_OTP_LENGTH, emailSendErrorMessage, sendEmailCode, verifyEmailCode } from "@/lib/email-auth";

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
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const passkeyRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { passkeyRequest.current?.abort(); }, []);
  const signInWithPasskey = async () => {
    if (busy || passkeyBusy) return;
    setPasskeyBusy(true); setError(null);
    const controller = new AbortController();
    passkeyRequest.current = controller;
    try {
      const { data, error } = await supabase.auth.signInWithPasskey({ options: { signal: controller.signal } });
      if (error) throw error;
      if (!data?.session || !isAllowed(data.session)) {
        await supabase.auth.signOut();
        setError('Solo cuentas @adere.so pueden ingresar al Hub.');
      }
    } catch (error) { if (!controller.signal.aborted) setError(passkeyErrorMessage(error)); }
    finally { passkeyRequest.current = null; setPasskeyBusy(false); }
  };

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => { const current = Date.now(); setNow(current); if (current >= resendAt) window.clearInterval(timer); }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) void fetch("/api/hub/session", { method: "DELETE", credentials: "same-origin" });
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
      setError("Solo cuentas @adere.so pueden ver este reporte.");
      void supabase.auth.signOut();
    }
  }, [ready, session]);


  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || (sentTo && resendSeconds > 0)) return;
    if (!corporateEmail(sentTo ?? email)) { setError('Ingresa tu correo @adere.so.'); return; }
    setBusy(true); setError(null);
    try {
      const normalized = await sendEmailCode(supabase.auth, sentTo ?? email);
      setSentTo(normalized); setCode(''); setNow(Date.now()); setResendAt(Date.now() + 60_000);
    } catch (error) { setError(emailSendErrorMessage(error)); }
    finally { setBusy(false); }
  };
  const confirmCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo || busy) return;
    setBusy(true); setError(null);
    try { await verifyEmailCode(supabase.auth, sentTo, code); }
    catch { setError('El código no es válido o ya expiró. Revisa el último correo.'); }
    finally { setBusy(false); }
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
        <h1 className="pulse-h2">Hub comercial</h1>
        <p className="eyebrow">Un solo acceso para todas tus herramientas de Adereso.</p>
        {error && <p className="status" data-tone="bad" role="alert">{error}</p>}
        {supportsPasskeys() && <div className="auth-passkey-option">
          <button className="pill auth-passkey-button" type="button" disabled={busy || passkeyBusy} onClick={() => void signInWithPasskey()}><Fingerprint size={20} aria-hidden="true" />{passkeyBusy ? 'Confirma en tu dispositivo…' : 'Entrar con Touch ID / Face ID'}</button>
          <p className="eyebrow">¿Primera vez? Ingresa por correo y activa tu passkey dentro del Hub.</p>
          <span className="auth-method-divider">O usa tu correo @adere.so</span>
        </div>}
        <fieldset className="auth-email-fieldset" disabled={passkeyBusy}>
        {sentTo ? <form className="auth-email-form" onSubmit={confirmCode}>
          <p role="status">Enviamos un correo de acceso a <strong>{sentTo}</strong>. Abre el enlace del último correo para continuar. Si incluye un código, también puedes ingresarlo aquí.</p>
          <label htmlFor="email-login-code">Código del correo, si lo recibiste</label>
          <input id="email-login-code" className="auth-email-input auth-email-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, EMAIL_OTP_LENGTH))}
            inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={EMAIL_OTP_LENGTH} maxLength={EMAIL_OTP_LENGTH} required autoFocus disabled={busy} />
          <button className="pill" type="submit" disabled={busy || code.length !== EMAIL_OTP_LENGTH}>{busy ? 'Verificando…' : 'Continuar'}</button>
          <div className="auth-email-actions">
            <button type="button" disabled={busy || resendSeconds > 0} onClick={() => void requestCode()}>{resendSeconds > 0 ? 'Reenviar en ' + resendSeconds + ' s' : 'Reenviar correo'}</button>
            <button type="button" disabled={busy} onClick={() => { setSentTo(null); setCode(''); setError(null); }}>Cambiar correo</button>
          </div>
        </form> : <form className="auth-email-form" onSubmit={requestCode}>
          <label htmlFor="email-login-address">Correo de trabajo</label>
          <input id="email-login-address" className="auth-email-input" type="email" autoComplete="email" placeholder="tu.nombre@adere.so" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy} />
          <button className="pill" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Recibir correo de acceso'}</button>
        </form>}
        </fieldset>
      </div>
    </main>
  );
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
