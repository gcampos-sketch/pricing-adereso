import { HUB_COUNTRY_PROBE_CLIENT, HUB_COUNTRY_PROBE_PARAM, HUB_SUPABASE_ORIGIN } from './hub-entry-country-probe';

// ISO 3166-1 alpha-2. Cloudflare XX (unknown), T1 (Tor) and other pseudo-regions are not countries.
const ISO_COUNTRIES = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));
export function countryCode(value: unknown): string | null {
  return typeof value === 'string' && ISO_COUNTRIES.has(value.toUpperCase()) ? value.toUpperCase() : null;
}

export type HubEntryForCountry = { userId: string; sessionId: string | null; visitId: string; enteredAt: string };
/** Only selected, non-sensitive fields from the Supabase edge-log connector. */
export type HubCountryLog = {
  id: string; timestamp: string; source: string; host: string; path: string; method: string;
  status: number; userId: string; sessionId: string; role: string; search: string; clientInfo: string; country: string;
};
export type CountryEvidence = {
  state: 'observed' | 'multiple' | 'unknown' | 'incomplete';
  countryCodes: string[];
  sourceLogIds: string[];
};

/** The only permitted adapter for connector-returned edge metadata, not request headers. */
export function countryLogFromProviderRow(row: {
  id: string; timestamp: string; source: string; log_attributes: Record<string, string>;
}): HubCountryLog {
  const attributes = row.log_attributes;
  const field = (key: string) => typeof attributes[key] === 'string' ? attributes[key]! : '';
  return { id: row.id, timestamp: row.timestamp, source: row.source,
    country: field('request.cf.country'), host: field('request.host'), path: field('request.path'), method: field('request.method'),
    status: Number(field('response.status_code')), userId: field('request.sb.auth_user'),
    sessionId: field('request.sb.jwt.authorization.payload.session_id'), role: field('request.sb.jwt.authorization.payload.role'),
    search: field('request.search'), clientInfo: field('request.headers.x_client_info') };
}

// Supabase ClickHouse timestamps are UTC, including API values without a trailing Z.
export function logTime(value: string): number {
  return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value) ? value + 'Z' : value);
}

export function resolveHubEntryCountry(entry: HubEntryForCountry, logs: HubCountryLog[], complete: boolean): CountryEvidence {
  const at = logTime(entry.enteredAt), countries = new Set<string>(), ids = new Set<string>();
  let unknown = false;
  if (!entry.sessionId || !Number.isFinite(at)) return { state: 'unknown', countryCodes: [], sourceLogIds: [] };
  for (const log of logs) {
    const time = logTime(log.timestamp);
    if (log.source !== 'edge_logs' || log.host !== new URL(HUB_SUPABASE_ORIGIN).host || log.path !== '/auth/v1/user' || log.method !== 'GET' || log.status !== 200
      || log.userId !== entry.userId || log.sessionId !== entry.sessionId || log.role !== 'authenticated' || log.clientInfo !== HUB_COUNTRY_PROBE_CLIENT
      || !Number.isFinite(time) || time < at - 5 * 60_000 || time > at + 2 * 60_000 || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(log.id)) continue;
    const marker = new URLSearchParams(log.search).getAll(HUB_COUNTRY_PROBE_PARAM);
    if (marker.length !== 1 || marker[0] !== entry.visitId) continue;
    ids.add(log.id);
    const country = countryCode(log.country);
    if (country) countries.add(country); else unknown = true;
  }
  const countryCodes = [...countries].sort();
  return {
    state: !complete ? 'incomplete' : countryCodes.length > 1 ? 'multiple' : !countryCodes.length || unknown ? 'unknown' : 'observed',
    countryCodes, sourceLogIds: [...ids].sort(),
  };
}

export type CountryExpectation = { email: string; expectedCountry: string };
export function assessHubEntryCountry(email: string, policies: CountryExpectation[], evidence: CountryEvidence) {
  // Explicit per-account policy only: NL for the verified exception does not permit NL for everyone.
  const matches = policies.filter(policy => policy.email.trim().toLowerCase() === email.trim().toLowerCase());
  const expected = matches.length === 1 ? countryCode(matches[0]?.expectedCountry) : null;
  if (!expected) return { state: 'unconfigured' as const, alert: false, expectedCountry: null, unexpectedCountries: [] };
  const unexpected = evidence.countryCodes.map(countryCode).filter((country): country is string => !!country && country !== expected);
  if (unexpected.length) return { state: 'unusual_country' as const, alert: true, expectedCountry: expected, unexpectedCountries: [...new Set(unexpected)] };
  return { state: evidence.state === 'observed' && evidence.countryCodes.length === 1 && countryCode(evidence.countryCodes[0]) === expected ? 'expected' as const : 'unknown' as const,
    alert: false, expectedCountry: expected, unexpectedCountries: [] };
}
