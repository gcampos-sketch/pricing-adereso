import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthGate } from "@/components/AuthGate";
import { recordMcpGrant, revokeMcpGrant } from "@/lib/mcp-grant.functions";
import { staleConsentClientIds } from "@/lib/mcp/stale-consents";

type Details = { client?: { name?: string; redirect_uri?: string } | null; scope?: string; redirect_url?: string; redirect_to?: string } | null;
type OAuthApi = {
  getAuthorizationDetails(id: string): Promise<{ data: Details; error: { message: string } | null }>;
  approveAuthorization(id: string, o?: { skipBrowserRedirect?: boolean }): Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization(id: string, o?: { skipBrowserRedirect?: boolean }): Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  listGrants(): Promise<{ data: { client?: { id?: string } }[] | null; error: { message: string } | null }>;
  revokeGrant(o: { clientId: string }): Promise<{ error: { message: string } | null }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

/**
 * Revokes remembered consents that have no active MFA grant, so the OAuth server
 * cannot silently re-approve them and skip this screen. Returns false on failure.
 */
async function clearStaleConsents(): Promise<boolean> {
  const [{ data: consents, error: listErr }, { data: grants, error: grantErr }] = await Promise.all([
    oauth().listGrants(),
    supabase.from("mcp_grants").select("client_id").is("revoked_at", null).gt("expires_at", new Date().toISOString()),
  ]);
  if (listErr || grantErr) return false;
  const stale = staleConsentClientIds((consents ?? []).map((c) => c.client?.id ?? ""), (grants ?? []).map((g) => g.client_id));
  for (const clientId of stale) {
    const { error } = await oauth().revokeGrant({ clientId });
    if (error) return false;
  }
  return true;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Conectar asistente · Sales Dashboard" },
      { name: "description", content: "Autoriza a un asistente externo a leer el Sales Dashboard." },
      { property: "og:title", content: "Conectar asistente · Sales Dashboard" },
      { property: "og:description", content: "Autoriza a un asistente externo a leer el Sales Dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AuthGate><Consent /></AuthGate>,
  errorComponent: ({ error }) => (
    <main className="pulse-main"><div className="auth-card"><p className="status" data-tone="bad">No se pudo cargar la solicitud: {error instanceof Error ? error.message : String(error)}</p></div></main>
  ),
});

function Consent() {
  const { authorization_id } = Route.useSearch();
  const [details, setDetails] = useState<Details>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!authorization_id) { setError("Falta el identificador de autorización."); setLoading(false); return; }
    void (async () => {
      // Must run before loading details: loading an already-consented authorization approves it.
      if (!(await clearStaleConsents())) {
        setError("No se pudo preparar la conexión. Vuelve a conectar desde tu asistente.");
        setLoading(false);
        return;
      }
      const { data, error: err } = await oauth().getAuthorizationDetails(authorization_id);
      if (err) { setError("La solicitud no es válida o expiró. Vuelve a conectar desde tu asistente."); setLoading(false); return; }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      // Only clients with an active MFA grant keep a remembered consent, so this is safe.
      if (immediate && !data?.client) { window.location.href = immediate; return; }
      setDetails(data);
      setLoading(false);
    })();
  }, [authorization_id]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (approve) {
        const grant = await recordMcpGrant({ data: { authorizationId: authorization_id } });
        if (!grant.ok) { setNeedCode(true); setBusy(false); return; }
      } else {
        await revokeMcpGrant({ data: { authorizationId: authorization_id } }).catch(() => undefined);
      }
    } catch {
      setBusy(false);
      setError("No se pudo registrar la autorización. Intenta de nuevo.");
      return;
    }
    const { data, error: err } = approve ? await oauth().approveAuthorization(authorization_id) : await oauth().denyAuthorization(authorization_id);
    const target = data?.redirect_url ?? data?.redirect_to;
    if (err || !target) { setBusy(false); setError(approve ? "No se pudo aprobar. Intenta de nuevo." : "No se pudo cancelar. Intenta de nuevo."); return; }
    window.location.href = target;
  }

  /** Delegating access always requires a fresh 6-digit code, even on a remembered device. */
  async function verifyAndApprove() {
    setBusy(true);
    setError(null);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (!factor) { setBusy(false); setError("No tienes verificación en dos pasos configurada."); return; }
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (err) { setBusy(false); setCode(""); setError("Código incorrecto o expirado."); return; }
    setNeedCode(false);
    await decide(true);
  }

  const name = details?.client?.name ?? "Un asistente";
  return (
    <main className="pulse-main">
      <div className="auth-card">
        {loading ? <div className="skeleton" style={{ height: 44, width: 320, borderRadius: 12 }} /> : <>
          <h1 className="pulse-h2">Conectar {name} al Sales Dashboard</h1>
          <p className="eyebrow">{name} podrá leer el resumen del equipo, el rendimiento por comercial y los deals con alertas, actuando como tú.</p>
          {details?.client?.redirect_uri ? <p className="eyebrow">Destino: {details.client.redirect_uri}</p> : null}
          <p className="eyebrow">Compartirá tu perfil básico y tu correo. No salta los permisos del reporte.</p>
        </>}
        {error ? <p className="status" data-tone="bad" role="alert">{error}</p> : null}
        {needCode ? <>
          <p className="eyebrow">Para conectar un asistente necesitas confirmar con tu código de 6 dígitos.</p>
          <input className="pill" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="123456" aria-label="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: 18 }} />
          <button className="pill" type="button" disabled={busy || code.length !== 6} onClick={() => void verifyAndApprove()}>{busy ? "Verificando…" : "Verificar y aprobar"}</button>
          <button className="pill" type="button" disabled={busy} onClick={() => void decide(false)}>Cancelar conexión</button>
        </> : null}
        {!loading && details && !needCode ? <>
          <button className="pill" type="button" disabled={busy} onClick={() => void decide(true)}>{busy ? "Procesando…" : "Aprobar"}</button>
          <button className="pill" type="button" disabled={busy} onClick={() => void decide(false)}>Cancelar conexión</button>
        </> : null}
      </div>
    </main>
  );
}
