import { HUB_SIGN_IN_URL } from './passkeys';

export const HUB_ENTRY_ORIGIN = new URL(HUB_SIGN_IN_URL).origin;
export const HUB_ENTRY_STORAGE_KEY = 'adereso:hub-entry:v1';
export const isVisitId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export type EntrySession = { userId: string; sessionId: string; accessToken: string };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export type HubEntryVisit = { userId: string; sessionId: string; visitId: string };

/** Deduplication only. Never use this unverified client claim to authorize a request. */
export function readEntrySessionId(accessToken: string): string | null {
  try {
    const encoded = accessToken.split('.')[1];
    if (!encoded) return null;
    const claims: unknown = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    const id = claims && typeof claims === 'object' && 'session_id' in claims ? claims.session_id : null;
    return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch { return null; }
}

/** One visit per document/session. Reloads reuse a tab's visit; a new navigation does not. */
export function createHubEntryVisits(options: { storage?: Storage | undefined; navigationType: string; randomId: () => string }) {
  const visits = new Map<string, HubEntryVisit>();
  return (session: Pick<EntrySession, 'userId' | 'sessionId'>, restored = false): HubEntryVisit => {
    const key = `${session.userId}:${session.sessionId}`;
    const current = visits.get(key);
    if (current && !restored) return current;
    let visit: HubEntryVisit | undefined;
    if (!restored && options.navigationType === 'reload') {
      try {
        const saved = JSON.parse(options.storage?.getItem(HUB_ENTRY_STORAGE_KEY) ?? 'null') as HubEntryVisit | null;
        if (saved?.userId === session.userId && saved.sessionId === session.sessionId && isVisitId(saved.visitId)) {
          visit = { userId: saved.userId, sessionId: saved.sessionId, visitId: saved.visitId };
        }
      } catch { /* Storage may be unavailable; per-document idempotency still applies. */ }
    }
    visit ??= { userId: session.userId, sessionId: session.sessionId, visitId: options.randomId() };
    visits.set(key, visit);
    try { options.storage?.setItem(HUB_ENTRY_STORAGE_KEY, JSON.stringify(visit)); } catch { /* Do not block access. */ }
    return visit;
  };
}

/** Recovery retries the opening already observed, even if another tab replaces the account's session. */
export function createHubEntrySelection(visits: ReturnType<typeof createHubEntryVisits>) {
  let pinned: HubEntryVisit | undefined;
  return (session: Pick<EntrySession, 'userId' | 'sessionId'>, restored = false) => {
    if (!pinned || restored) pinned = visits(session, restored);
    return pinned;
  };
}

/** Repeated deliveries are safe because the server has an atomic user/visit uniqueness constraint. */
export async function deliverHubEntry(visit: HubEntryVisit, dependencies: {
  getSession: () => Promise<EntrySession | null>;
  send: (session: EntrySession, visitId: string) => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  isActive: () => boolean;
}): Promise<'recorded' | 'cancelled' | 'failed'> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await dependencies.sleep(attempt === 1 ? 1000 : 5000);
    if (!dependencies.isActive()) return 'cancelled';
    try {
      const session = await dependencies.getSession();
      if (!dependencies.isActive() || !session || session.userId !== visit.userId || session.sessionId !== visit.sessionId) return 'cancelled';
      const status = await dependencies.send(session, visit.visitId);
      if (status === 204) return 'recorded';
      if (status < 500 && status !== 429) return 'failed';
    } catch { /* Retry the same visit, never manufacture a new event. */ }
  }
  return 'failed';
}
