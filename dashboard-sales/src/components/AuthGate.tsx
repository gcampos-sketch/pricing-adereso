import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HubFirstAccess } from '@/components/HubFirstAccess';
import { AuthScene } from '@/components/AuthScene';
import { HubLoading } from '@/components/HubLoading';
import { forgetDevice } from "@/lib/mfa-trust.functions";
import { clearTrustToken } from "@/lib/mfa-trust";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { UserRound, LogOut, Fingerprint } from "lucide-react";
import { supportsPasskeys, passkeyErrorMessage, officialPasskeyOrigin, HUB_SIGN_IN_URL } from '@/lib/passkeys';
import { PasskeySettings } from '@/components/PasskeySettings';
import type { PasskeyProvider } from '@/components/PasskeySignInOptions';
import { UnifiedSignIn } from '@/components/UnifiedSignIn';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MfaGate } from "@/components/MfaGate";
import { PasskeyGate } from '@/components/PasskeyGate';
import { verifiedCorporateUser, confirmRegistrationCode } from '@/lib/account-enrollment';
import { continueWithCorporateEmail } from '@/lib/account-enrollment.functions';
import { knownSignInDevice, rememberSignInDevice } from '@/lib/sign-in-journey';

const AccountEmailContext = createContext<string | null>(null);
export const useAccountEmail = () => useContext(AccountEmailContext);

function isAllowed(session: Session | null) {
  return verifiedCorporateUser(session?.user);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const passkeyRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { passkeyRequest.current?.abort(); }, []);
  const signInWithPasskey = async (provider: PasskeyProvider = 'device') => {
    if (passkeyBusy) return;
    if (!officialPasskeyOrigin(window.location.hostname)) { window.location.assign(HUB_SIGN_IN_URL); return; }
    setPasskeyBusy(true); setError(null);
    const controller = new AbortController(); passkeyRequest.current = controller;
    try {
      const { data, error } = await supabase.auth.signInWithPasskey({ options: { signal: controller.signal } });
      if (error) throw error;
      if (!data?.session || !isAllowed(data.session)) {
        await supabase.auth.signOut(); setError('Solo cuentas @adere.so pueden ingresar al Hub.');
      } else {
        try { rememberSignInDevice(localStorage); } catch { /* optional presentation hint */ }
      }
    } catch (error) { if (!controller.signal.aborted) setError(provider === 'keeper'
      ? `${passkeyErrorMessage(error)} Comprueba que Keeper esté desbloqueado y tenga tu passkey del Hub. Puedes continuar con otro correo si lo necesitas.`
      : passkeyErrorMessage(error)); }
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
      setError('Necesitas un correo @adere.so confirmado para ingresar al Hub.'); void supabase.auth.signOut();
    }
  }, [ready, session]);
  if (!ready) return <HubLoading message="Comprobando tu sesión" />;
  if (session && isAllowed(session)) return <AccountEmailContext.Provider value={session.user.email ?? null}><MfaGate key={session.user.id}><PasskeyGate><HubFirstAccess key={session.user.id} userId={session.user.id}>{children}</HubFirstAccess></PasskeyGate></MfaGate></AccountEmailContext.Provider>;
  const official = officialPasskeyOrigin(window.location.hostname);
  if (official) return <AuthScene><UnifiedSignIn
    knownDevice={() => { try { return knownSignInDevice(localStorage); } catch { return false; } }}
    continueWithEmail={email => continueWithCorporateEmail({ data: { email } })}
    verifyEmail={(email, code) => confirmRegistrationCode(supabase.auth, email, code)}
    onSignIn={provider => void signInWithPasskey(provider)} passkeyBusy={passkeyBusy} passkeyError={error}
    passkeysAvailable={supportsPasskeys()} clearPasskeyError={() => setError(null)} /></AuthScene>;
  return <AuthScene><div className="auth-card">
    <h1 className="pulse-h2">Hub comercial</h1>
    <p className="eyebrow">Un solo acceso para todas tus herramientas de Adereso.</p>
    <p className="eyebrow">Continúa en el Hub oficial para verificar tu acceso.</p>
    <a className="pill auth-passkey-button" href={HUB_SIGN_IN_URL}>Iniciar sesión</a>
  </div></AuthScene>;
}

export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const email = useContext(AccountEmailContext);
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    if (!profileOpen) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.['full_name'] ?? data.user?.user_metadata?.['name'];
      if (active) setProfileName(typeof name === 'string' && name.trim() ? name.trim() : null);
    }).catch(() => {});
    return () => { active = false; };
  }, [profileOpen]);

  return <div className="sidebar-account" data-collapsed={collapsed}>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="sidebar-account-trigger" aria-label="Menú de cuenta" title={email ?? 'Mi cuenta'}>
          <UserRound aria-hidden="true" /><span>{email ?? 'Mi cuenta'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="sidebar-account-dropdown" side="top" align="start" sideOffset={10} collisionPadding={12}>
        <DropdownMenuLabel className="sidebar-account-email">{email ?? 'Mi cuenta'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setProfileOpen(true)}><UserRound aria-hidden="true" />Ver perfil</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPasskeyOpen(true)}><Fingerprint aria-hidden="true" />Passkeys · Keeper y dispositivo</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="sidebar-account-signout" onSelect={() => {
          void (async () => { try { await forgetDevice(); } catch { /* ignore */ } clearTrustToken(); await supabase.auth.signOut(); })();
        }}><LogOut aria-hidden="true" />Salir del Hub</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
      <DialogContent className="account-profile-dialog">
        <DialogHeader><DialogTitle>Mi perfil</DialogTitle><DialogDescription>Tu cuenta de acceso al Hub comercial.</DialogDescription></DialogHeader>
        <div className="account-profile-avatar"><UserRound size={28} aria-hidden="true" /></div>
        <dl className="account-profile-details">
          {profileName ? <div><dt>Nombre</dt><dd>{profileName}</dd></div> : null}
          <div><dt>Correo</dt><dd>{email}</dd></div>
          <div><dt>Cuenta</dt><dd>Adereso</dd></div>
        </dl>
      </DialogContent>
    </Dialog>
    <PasskeySettings open={passkeyOpen} onOpenChange={setPasskeyOpen} />
  </div>;
}
