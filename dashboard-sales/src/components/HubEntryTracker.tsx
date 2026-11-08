import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { readTrustToken } from '@/lib/mfa-trust';
import { createHubEntrySelection, createHubEntryVisits, deliverHubEntry, HUB_ENTRY_ORIGIN, readEntrySessionId, type EntrySession } from '@/lib/hub-entry';
import { createHubCountryProbeClaims, probeHubEntryCountry } from '@/lib/hub-entry-country-probe';

// This module belongs to the top-level authenticated root, never the consent route.
let visits: ReturnType<typeof createHubEntryVisits> | undefined;
const recorded = new Set<string>();
let claimCountryProbe: ReturnType<typeof createHubCountryProbeClaims> | undefined;

async function currentSession(): Promise<EntrySession | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const sessionId = readEntrySessionId(session.access_token);
  return sessionId ? { userId: session.user.id, sessionId, accessToken: session.access_token } : null;
}

/** Mount only below AuthGate/MfaGate. Refreshing a token or focusing a tab is not an entry. */
export function HubEntryTracker() {
  useEffect(() => {
    if (window.location.origin !== HUB_ENTRY_ORIGIN || window.self !== window.top) return;
    let storage: globalThis.Storage | undefined;
    try { storage = window.sessionStorage; } catch { /* Optional deduplication across reloads. */ }
    if (!claimCountryProbe) claimCountryProbe = createHubCountryProbeClaims(storage);
    if (!visits) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      visits = createHubEntryVisits({ storage, navigationType: navigation?.type ?? 'navigate', randomId: () => crypto.randomUUID() });
    }
    const selectVisit = createHubEntrySelection(visits);
    let active = true;
    let inFlight = false;
    let restorePending = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const clearRetry = () => { if (retryTimer !== undefined) clearTimeout(retryTimer); retryTimer = undefined; };
    const report = async (restored = false) => {
      if (!active) return;
      if (inFlight) { restorePending ||= restored; return; }
      inFlight = true;
      clearRetry();
      let retry = false;
      try {
        const session = await currentSession();
        if (!active || !session) return;
        const visit = selectVisit(session, restored);
        if (recorded.has(visit.visitId)) return;
        const outcome = await deliverHubEntry(visit, {
          getSession: currentSession,
          isActive: () => active,
          sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
          send: async (current, visitId) => {
            if (claimCountryProbe?.(visitId)) {
              // Country enrichment must never delay or prevent the entry itself.
              void probeHubEntryCountry({
                supabaseUrl: import.meta.env['VITE_SUPABASE_URL'], publishableKey: import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'],
                accessToken: current.accessToken, visitId,
              });
            }
            const trust = readTrustToken();
            const response = await fetch('/api/hub/entries', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(6000), headers: {
              Authorization: `Bearer ${current.accessToken}`, 'x-hub-visit-id': visitId,
              ...(trust ? { 'x-mfa-trust': trust } : {}),
            } });
            return response.status;
          },
        });
        if (outcome === 'recorded') recorded.add(visit.visitId);
        if (outcome === 'failed') retry = true;
      } catch { retry = true; }
      finally {
        inFlight = false;
        if (active && restorePending) { restorePending = false; void report(true); }
        else if (active && retry) {
          // Retain the same visit through outages. Recovery never manufactures a new entry.
          retryTimer = setTimeout(() => { void report(); }, 60_000);
        }
      }
    };
    void report();
    // A back/forward-cache restore reopens the document without remounting React.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void report(true); };
    const onOnline = () => { void report(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void report(); };
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false; clearRetry();
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
