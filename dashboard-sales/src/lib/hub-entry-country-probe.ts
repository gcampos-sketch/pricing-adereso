import { isVisitId } from './hub-entry';

export const HUB_SUPABASE_ORIGIN = 'https://nsflqsdtfmnuangezsid.supabase.co';
export const HUB_COUNTRY_PROBE_PARAM = 'hub_entry_visit';
export const HUB_COUNTRY_PROBE_CLIENT = 'hub-entry-country/v1';
export const HUB_COUNTRY_PROBE_STORAGE_KEY = 'adereso:hub-entry-country-probe:v1';

/** Claim the opening observation before sending, so a reload cannot relocate an older entry. */
export function createHubCountryProbeClaims(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const claimed = new Set<string>();
  return (visitId: string): boolean => {
    if (!isVisitId(visitId) || claimed.has(visitId)) return false;
    claimed.add(visitId);
    try {
      if (storage?.getItem(HUB_COUNTRY_PROBE_STORAGE_KEY) === visitId) return false;
      storage?.setItem(HUB_COUNTRY_PROBE_STORAGE_KEY, visitId);
    } catch { /* The entry's own reload deduplication is also best-effort with blocked storage. */ }
    return true;
  };
}

function isPublicKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  try {
    const payload = key.split('.')[1];
    return !!payload && JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon';
  } catch { return false; }
}

/**
 * The existing identity provider observes the browser connection. Country is read later
 * from its private edge logs, never from browser headers/body or an external GeoIP API.
 * No IP is read, copied or sent by this code. Failure must not prevent entry recording.
 */
export async function probeHubEntryCountry(options: {
  supabaseUrl: string | undefined;
  publishableKey: string | undefined;
  accessToken: string;
  visitId: string;
  fetcher?: typeof fetch | undefined;
}): Promise<boolean> {
  if (!options.supabaseUrl || !options.publishableKey || !isVisitId(options.visitId)) return false;
  try {
    const configured = new URL(options.supabaseUrl);
    if (configured.origin !== HUB_SUPABASE_ORIGIN || configured.username || configured.password || configured.search || configured.hash || !['', '/'].includes(configured.pathname)) return false;
    if (!isPublicKey(options.publishableKey)) return false;
    const url = new URL('/auth/v1/user', HUB_SUPABASE_ORIGIN);
    url.searchParams.set(HUB_COUNTRY_PROBE_PARAM, options.visitId);
    const response = await (options.fetcher ?? fetch)(url, {
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(6000),
      headers: { apikey: options.publishableKey, Authorization: `Bearer ${options.accessToken}`, 'x-client-info': HUB_COUNTRY_PROBE_CLIENT },
    });
    return response.status === 200;
  } catch { return false; }
}
