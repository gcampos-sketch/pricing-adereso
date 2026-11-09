import { AuthScene } from '@/components/AuthScene';
import { HubLoading } from '@/components/HubLoading';
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { issueRecoveryCodes, redeemRecoveryCode } from "@/lib/mfa-recovery.functions";
import { readTrustToken, storeTrustToken, clearTrustToken } from "@/lib/mfa-trust";
import { checkDeviceTrust, forgetDevice, rememberDevice } from "@/lib/mfa-trust.functions";

type Step =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "recover" }
  | { kind: "codes"; codes: string[] };

/** Requires a TOTP second factor (authenticator app) before showing the report.
 *  After verifying, remembers this device for 30 days so the user isn't prompted again. */
export function MfaGate({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rememberBrowser, setRememberBrowser] = useState(true);

  const resolve = async () => {
    // 1. Check Supabase session AAL first (already elevated in this session).
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") return setStep({ kind: "ok" });

    // 2. Trusted device: the server verifies the token, so the code is not asked again.
    if (readTrustToken()) {
      try {
        const { trusted } = await checkDeviceTrust();
        if (trusted) return setStep({ kind: "ok" });
      } catch {
        /* fall through to the code prompt */
      }
      clearTrustToken();
    }

    // 3. Normal MFA flow.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.[0];
    if (verified) return setStep({ kind: "verify", factorId: verified.id });
    for (const f of factors?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Sales Dashboard ${Date.now()}`,
    });
    if (enrollError || !data) {
      setError("No pudimos preparar la verificación en dos pasos. Recarga la página.");
      return;
    }
    setStep({ kind: "enroll", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  useEffect(() => {
    void resolve();
  }, []);

  const afterVerified = async (fresh: boolean) => {
    // Save device trust so the user isn't prompted again for 30 days.
    if (rememberBrowser) {
      try {
        const { token, expiresAt } = await rememberDevice();
        storeTrustToken(token, expiresAt);
      } catch { /* the code will simply be asked again next time */ }
    } else {
      try { await forgetDevice(); } catch { /* still remove the local credential */ }
      clearTrustToken();
    }

    try {
      const { codes } = await issueRecoveryCodes({ data: { onlyIfMissing: !fresh } });
      if (codes?.length) return setStep({ kind: "codes", codes });
    } catch {
      /* el reporte sigue disponible aunque falle la emisión */
    }
    setStep({ kind: "ok" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (step.kind !== "enroll" && step.kind !== "verify") return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: step.factorId,
      code: code.trim(),
    });
    if (verifyError) {
      setBusy(false);
      setError("Código incorrecto o expirado. Intenta con el código actual.");
      setCode("");
      return;
    }
    await afterVerified(step.kind === "enroll");
    setBusy(false);
    setCode("");
  };

  const recover = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ok } = await redeemRecoveryCode({ data: { code } });
      if (!ok) {
        setError("Ese código no es válido o ya fue usado.");
        setBusy(false);
        return;
      }
      await supabase.auth.refreshSession();
      setCode("");
      setNotice("Código aceptado. Configura tu nueva app de autenticación.");
      setStep({ kind: "loading" });
      await resolve();
    } catch {
      setError("Ese código no es válido o ya fue usado.");
    }
    setBusy(false);
  };

  const handleSignOut = () => {
    void (async () => {
      try {
        await forgetDevice();
      } catch {
        /* ignore */
      }
      clearTrustToken();
      await supabase.auth.signOut();
    })();
  };

  if (step.kind === "ok") return <>{children}</>;
  if (step.kind === "loading") {
    if (!error) return <HubLoading />;
    return (
      <AuthScene>
        {error ? <p className="status" data-tone="bad">{error}</p> : <div className="skeleton" style={{ height: 44, width: 320, borderRadius: 12 }} />}
      </AuthScene>
    );
  }

  if (step.kind === "codes") {
    const text = step.codes.join("\n");
    return (
      <AuthScene>
        <div className="auth-card">
          <h1 className="pulse-h2">Guarda tus códigos de recuperación</h1>
          <p className="eyebrow">
            Si pierdes tu teléfono, usa uno de estos códigos para recuperar el acceso. Cada uno sirve una sola vez y no los volveremos a mostrar. Guárdalos en un lugar seguro, como Keeper.
          </p>
          <pre style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 15, letterSpacing: "0.08em", margin: 0 }}>
            {step.codes.map((c) => <code key={c}>{c}</code>)}
          </pre>
          <button className="pill" type="button" onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}>
            {copied ? "Copiados ✓" : "Copiar códigos"}
          </button>
          <button className="pill" type="button" onClick={() => setStep({ kind: "ok" })}>
            Ya los guardé, continuar
          </button>
        </div>
      </AuthScene>
    );
  }

  if (step.kind === "recover") {
    return (
      <AuthScene>
        <form className="auth-card" onSubmit={(e) => void recover(e)}>
          <h1 className="pulse-h2">Recuperar acceso</h1>
          <p className="eyebrow">Escribe uno de tus códigos de recuperación (ej. ABCDE-12345). Después configurarás tu nueva app de autenticación.</p>
          <input
            className="pill"
            autoFocus
            autoComplete="off"
            maxLength={11}
            placeholder="ABCDE-12345"
            aria-label="Código de recuperación"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ textAlign: "center", letterSpacing: "0.15em", fontSize: 18 }}
          />
          {error ? <p className="status" data-tone="bad">{error}</p> : null}
          <button className="pill" type="submit" disabled={busy || code.replace(/[^A-Z0-9]/g, "").length !== 10}>
            {busy ? "Verificando…" : "Recuperar acceso"}
          </button>
          <button className="pill" type="button" onClick={() => { setError(null); setCode(""); void resolve(); }}>
            Volver
          </button>
          <p className="eyebrow">¿No tienes tus códigos? Pide a un administrador que restablezca tu acceso.</p>
        </form>
      </AuthScene>
    );
  }

  return (
    <AuthScene>
      <form className="auth-card" onSubmit={(e) => void submit(e)}>
        {step.kind === 'enroll' && <p className="eyebrow">CONFIGURAR AUTHENTICATOR · PASO 2 DE 3</p>}
        <h1 className="pulse-h2">{step.kind === 'enroll' ? 'Configura Authenticator' : 'Verificación en dos pasos'}</h1>
        {notice ? <p className="status">{notice}</p> : null}
        {step.kind === "enroll" ? (
          <>
            <p className="eyebrow">
              Escanea este código con Google Authenticator, Microsoft Authenticator o 1Password y escribe el código de 6 dígitos.
            </p>
            <img src={step.qr} alt="Código QR para tu app de autenticación" width={180} height={180} style={{ background: "white", borderRadius: 12, padding: 8 }} />
            <p className="eyebrow">¿No puedes escanear? Ingresa esta clave: <code>{step.secret}</code></p>
          </>
        ) : (
          <p className="eyebrow">
            Abre tu app de autenticación y escribe el código de 6 dígitos.
          </p>
        )}
        <input
          className="pill"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="123456"
          aria-label="Código de 6 dígitos"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: 18 }}
        />
        {error ? <p className="status" data-tone="bad">{error}</p> : null}
        <label className="auth-remember-device">
          <input type="checkbox" checked={rememberBrowser} onChange={event => setRememberBrowser(event.target.checked)} disabled={busy} />
          Recordar este navegador por 30 días
        </label>
        <button className="pill" type="submit" disabled={busy || code.length !== 6}>
          {busy ? "Verificando…" : "Verificar"}
        </button>
        {step.kind === "verify" ? (
          <button className="pill" type="button" onClick={() => { setError(null); setCode(""); setStep({ kind: "recover" }); }}>
            Perdí mi teléfono
          </button>
        ) : null}
        <button className="pill" type="button" onClick={handleSignOut}>
          Usar otra cuenta
        </button>
        <p className="eyebrow" style={{ opacity: 0.5, fontSize: 11 }}>
          {rememberBrowser ? 'En este navegador recordado no volveremos a pedir el código durante 30 días.' : 'La próxima sesión podrá volver a pedir el código de Authenticator.'}
        </p>
      </form>
    </AuthScene>
  );
}
