import { describe, expect, test } from 'bun:test';
import { dealIntelligence, evidenceChronology, freshnessReport, safeHttpsUrl, validPropertyHistory, type AdoboVerifiedContextV1, type PropertyHistoryV1 } from '../src/lib/adobo-intelligence';
import { alertFingerprint, alertKinds, applyTransition, effectiveState, emptyStore, parseStore } from '../src/lib/adobo-workflow';
import { toPropertyHistory } from '../src/lib/adobo.server';
import type { DealDTO } from '../src/lib/pulse-types';

// Test-only fixtures; never used by the application.
const URL_ = 'https://app.hubspot.com/contacts/1/deal/a';
const NOW = Date.parse('2026-10-19T12:00:00Z');
const H = 3_600_000;
const deal = (score = '60', pinzas = 'false'): DealDTO => ({ id: 'a', name: 'a', owner: 'O', ownerId: 'o', stage: 'E2', segment: 'Inbound', url: URL_,
  adobo: { properties: { adobo_closing_score: score, seguimiento_con_pinzas: pinzas } } } as unknown as DealDTO);
const history = (scores: [string, string][], extra: PropertyHistoryV1['properties'] = {}): PropertyHistoryV1 => ({
  version: 'hubspot-property-history/v1', dealId: 'a', fetchedAt: '2026-10-19T11:00:00Z', recordUrl: URL_,
  properties: { adobo_closing_score: { versions: scores.map(([value, at]) => ({ value, at, sourceType: 'INTEGRATION' })).reverse(), truncated: false }, ...extra } });
const withHistory = (d: DealDTO, h: PropertyHistoryV1 | null) => { d.adobo!.propertyHistory = h; return d; };

describe('chronology from real property history', () => {
  test('absence is explicit, never inferred from snapshots', () => {
    const c = evidenceChronology(deal(), NOW);
    expect(c).toMatchObject({ status: 'missing', transitions: [], pinzasStatus: 'missing' });
    expect(dealIntelligence(deal(), NOW).delta).toBeNull();
  });
  test('previous → current with co-changed variables', () => {
    const d = withHistory(deal(), history([['80', '2026-10-01T00:00:00Z'], ['60', '2026-10-10T00:00:00Z']],
      { adobo_current_urgencia: { versions: [{ value: 'baja', at: '2026-10-10T00:00:00Z', sourceType: 'INTEGRATION' }], truncated: false } }));
    const c = evidenceChronology(d, NOW);
    expect(c.status).toBe('changed');
    expect(c.transitions).toEqual([{ from: 80, to: 60, at: '2026-10-10T00:00:00Z', sourceType: 'INTEGRATION', coChanged: ['adobo_current_urgencia'] }]);
    expect(dealIntelligence(d, NOW).delta).toBe(-20);
    expect(alertKinds(d, NOW)).toContain('scoreDrop');
  });
  test('single version: unchanged, no delta, not a first event claim', () => {
    const c = evidenceChronology(withHistory(deal(), history([['60', '2026-10-10T00:00:00Z']])), NOW);
    expect(c.status).toBe('unchanged'); expect(c.transitions).toEqual([]);
  });
  test('history not matching current snapshot is inconsistent, no delta', () => {
    const d = withHistory(deal('55'), history([['80', '2026-10-01T00:00:00Z'], ['60', '2026-10-10T00:00:00Z']]));
    expect(evidenceChronology(d, NOW)).toMatchObject({ status: 'inconsistent', transitions: [] });
    expect(dealIntelligence(d, NOW).delta).toBeNull();
  });
  test('future versions, wrong deal or unsafe record URL rejected', () => {
    expect(validPropertyHistory(withHistory(deal(), history([['60', '2026-10-20T00:00:00Z']])), NOW)).toBeNull();
    expect(validPropertyHistory(withHistory(deal(), { ...history([['60', '2026-10-10T00:00:00Z']]), dealId: 'b' }), NOW)).toBeNull();
    for (const bad of ['http://app.hubspot.com/x', 'javascript:alert(1)', 'https://u:p@evil.test/', 'not a url'])
      expect(validPropertyHistory(withHistory(deal(), { ...history([['60', '2026-10-10T00:00:00Z']]), recordUrl: bad }), NOW)).toBeNull();
    expect(validPropertyHistory(withHistory(deal(), { ...history([['60', '2026-10-10T00:00:00Z']]), fetchedAt: '2026-10-20T00:00:00Z' }), NOW)).toBeNull();
  });
  test('pinzas entry/exit only from recorded versions; reason stays unknown', () => {
    const d = withHistory(deal('60', 'true'), history([['60', '2026-10-01T00:00:00Z']], { seguimiento_con_pinzas: { truncated: false, versions: [
      { value: 'true', at: '2026-10-05T00:00:00Z', sourceType: 'CRM_UI' }, { value: 'false', at: '2026-10-02T00:00:00Z', sourceType: 'CRM_UI' }] } }));
    expect(evidenceChronology(d, NOW).pinzas).toEqual([{ kind: 'entry', at: '2026-10-05T00:00:00Z', sourceType: 'CRM_UI', coChanged: [] }]);
  });
  test('producer mapping drops undated versions and marks partial', () => {
    const h = toPropertyHistory('a', URL_, '2026-10-19T11:00:00Z', { adobo_closing_score: [{ value: '60', timestamp: '2026-10-10T00:00:00Z' }, { value: '70' }] });
    expect(h.properties.adobo_closing_score).toMatchObject({ malformed: true, versions: [{ value: '60' }] });
    expect(evidenceChronology(withHistory(deal(), h), NOW).partial).toBe(true);
  });
});

describe('freshness with live clock', () => {
  const ctx = (): AdoboVerifiedContextV1 => ({ version: 'adobo-evidence/v1', verified: true, fresh: true, coverageVerified: true,
    temporal: { version: 'adobo-context-time/v1', observedAt: '2026-10-19T10:00:00Z', window: { start: '2026-10-01', end: '2026-10-19T10:00:00Z' },
      validity: { version: 'producer-validity/v1', maxAgeMs: 4 * H } },
    evaluation: { url: 'https://example.org/eval', at: '2026-10-19T10:00:00Z' }, history: [], lastCustomerResponse: null, nextStep: null, commitment: null, pinzasEvidence: null, followup: null });
  test('evaluation current, then expires as time advances past report generation', () => {
    const d = deal(); d.adobo!.verifiedContext = ctx();
    expect(freshnessReport(d, '2026-10-19T10:30:00Z', NOW)).toMatchObject({ status: 'evaluation-current', evaluation: { ageMs: 2 * H } });
    expect(freshnessReport(d, '2026-10-19T10:30:00Z', NOW + 3 * H)).toMatchObject({ status: 'recalculation-needed', evaluation: { state: 'expired' } });
  });
  test('no evaluation: not verifiable, missing sources visible, read age not an evaluation', () => {
    const f = freshnessReport(deal(), '2026-10-19T11:00:00Z', NOW);
    expect(f.status).toBe('not-verifiable'); expect(f.evaluation).toBeNull(); expect(f.readAgeMs).toBe(H);
    expect(f.sources.filter(s => s.state === 'missing').map(s => s.key)).toEqual(['history', 'evaluation', 'episodes', 'diio', 'email']);
  });
  test('unsafe evaluation URL never counts', () => {
    const d = deal(); const c = ctx(); c.evaluation = { url: 'http://example.org', at: c.evaluation!.at }; d.adobo!.verifiedContext = c;
    expect(freshnessReport(d, '2026-10-19T10:30:00Z', NOW).evaluation).toBeNull();
  });
});

describe('personal review workflow', () => {
  const pinzasDeal = () => deal('60', 'true');
  const ctx = (now = NOW) => ({ actor: 'g@adere.so', now, fingerprint: alertFingerprint(pinzasDeal(), now) });
  test('reviewed does not clear the alert', () => {
    const r = applyTransition(emptyStore(), 'a', { state: 'reviewed' }, ctx());
    if (!r.ok) throw new Error(r.error);
    expect(effectiveState(r.store.records['a'], ctx().fingerprint, NOW).state).toBe('reviewed');
    expect(alertKinds(pinzasDeal(), NOW)).toContain('pinzas');
  });
  test('actor required', () => {
    expect(applyTransition(emptyStore(), 'a', { state: 'reviewed' }, { ...ctx(), actor: ' ' }).ok).toBe(false);
  });
  test('waiting requires future review date and resurfaces when due', () => {
    expect(applyTransition(emptyStore(), 'a', { state: 'waiting' }, ctx()).ok).toBe(false);
    expect(applyTransition(emptyStore(), 'a', { state: 'waiting', reviewAt: new Date(NOW - 1).toISOString() }, ctx()).ok).toBe(false);
    const r = applyTransition(emptyStore(), 'a', { state: 'waiting', reviewAt: new Date(NOW + H).toISOString() }, ctx());
    if (!r.ok) throw new Error(r.error);
    expect(effectiveState(r.store.records['a'], ctx().fingerprint, NOW + H - 1).state).toBe('waiting');
    expect(effectiveState(r.store.records['a'], ctx().fingerprint, NOW + H)).toMatchObject({ state: 'pending', resurfaced: true });
  });
  test('resolved requires useful evidence and a safe https URL', () => {
    for (const note of [undefined, '', '   ', 'ok', '............']) expect(applyTransition(emptyStore(), 'a', { state: 'resolved', note }, ctx()).ok).toBe(false);
    for (const url of ['http://x.test', 'javascript:alert(1)', 'ftp://x', 'https://u:p@x.test'])
      expect(applyTransition(emptyStore(), 'a', { state: 'resolved', note: 'Cliente confirmó plan en reunión', url }, ctx()).ok).toBe(false);
    const r = applyTransition(emptyStore(), 'a', { state: 'resolved', note: 'Cliente confirmó plan en reunión', url: 'https://example.org/n' }, ctx());
    expect(r.ok).toBe(true);
  });
  test('new adverse evidence reopens a resolved alert', () => {
    const r = applyTransition(emptyStore(), 'a', { state: 'resolved', note: 'Cliente confirmó plan en reunión' }, ctx());
    if (!r.ok) throw new Error(r.error);
    const changed = withHistory(pinzasDeal(), history([['80', '2026-10-01T00:00:00Z'], ['60', '2026-10-10T00:00:00Z']]));
    const fp = alertFingerprint(changed, NOW);
    expect(fp).not.toBe(ctx().fingerprint);
    expect(effectiveState(r.store.records['a'], fp, NOW)).toMatchObject({ state: 'pending', reopened: true });
    expect(effectiveState(r.store.records['a'], ctx().fingerprint, NOW).state).toBe('resolved');
  });
  test('manual reopen keeps audit trail with actor and time', () => {
    let s = emptyStore();
    for (const input of [{ state: 'resolved' as const, note: 'Cliente confirmó plan en reunión' }, { state: 'pending' as const }]) {
      const r = applyTransition(s, 'a', input, ctx()); if (!r.ok) throw new Error(r.error); s = r.store;
    }
    expect(s.records['a']!.map(e => [e.state, e.actor])).toEqual([['resolved', 'g@adere.so'], ['pending', 'g@adere.so']]);
    expect(effectiveState(s.records['a'], ctx().fingerprint, NOW).state).toBe('pending');
  });
  test('stored state with unsafe URLs or bad shape is discarded', () => {
    const raw = JSON.stringify({ version: 'adobo-workflow/v1', records: { a: [{ state: 'resolved', at: '2026-10-19', actor: 'x', fingerprint: 'f', url: 'javascript:1' }], b: 'x' } });
    expect(parseStore(raw, NOW).records).toEqual({});
    expect(parseStore('nope', NOW).records).toEqual({});
  });
  test('safe URL helper', () => {
    expect(safeHttpsUrl('https://app.hubspot.com/x')).toBe(true);
    expect(safeHttpsUrl('http://app.hubspot.com/x')).toBe(false);
  });
});

describe('review fixes', () => {
  const mk = (vs: [string | null, string][], prop: 'adobo_closing_score' | 'seguimiento_con_pinzas' = 'adobo_closing_score') =>
    ({ versions: vs.map(([value, at]) => ({ value, at, sourceType: 'INTEGRATION' })).reverse(), truncated: false });
  test('null version breaks adjacency: 80 → null → 60 has no 80→60 delta', () => {
    const d = withHistory(deal(), { ...history([]), properties: { adobo_closing_score: mk([['80', '2026-10-01T00:00:00Z'], [null, '2026-10-09T00:00:00Z'], ['60', '2026-10-10T00:00:00Z']]) } });
    const c = evidenceChronology(d, NOW);
    expect(c.transitions).toEqual([]); expect(c.partial).toBe(true);
    expect(dealIntelligence(d, NOW).delta).toBeNull();
  });
  test('out-of-range value breaks adjacency', () => {
    const d = withHistory(deal(), { ...history([]), properties: { adobo_closing_score: mk([['80', '2026-10-01T00:00:00Z'], ['150', '2026-10-09T00:00:00Z'], ['60', '2026-10-10T00:00:00Z']]) } });
    expect(evidenceChronology(d, NOW).transitions).toEqual([]);
  });
  test('same-timestamp conflict establishes no transition', () => {
    const d = withHistory(deal(), { ...history([]), properties: { adobo_closing_score: mk([['80', '2026-10-01T00:00:00Z'], ['70', '2026-10-10T00:00:00Z'], ['60', '2026-10-10T00:00:00Z']]) } });
    const c = evidenceChronology(d, NOW);
    expect(c.status).toBe('inconsistent'); expect(dealIntelligence(d, NOW).delta).toBeNull();
  });
  test('latest actual version invalid → inconsistent, even if an older valid version equals current', () => {
    const d = withHistory(deal(), { ...history([]), properties: { adobo_closing_score: mk([['80', '2026-10-01T00:00:00Z'], ['60', '2026-10-05T00:00:00Z'], ['x', '2026-10-10T00:00:00Z']]) } });
    expect(evidenceChronology(d, NOW).status).toBe('inconsistent');
    expect(dealIntelligence(d, NOW).delta).toBeNull();
  });
  test('older transition is not claimed as current delta', () => {
    const d = withHistory(deal(), { ...history([]), properties: { adobo_closing_score: mk([['80', '2026-10-01T00:00:00Z'], ['60', '2026-10-05T00:00:00Z'], [null, '2026-10-08T00:00:00Z'], ['60', '2026-10-10T00:00:00Z']]) } });
    expect(evidenceChronology(d, NOW).transitions.length).toBe(1);
    expect(dealIntelligence(d, NOW).delta).toBeNull();
  });
  test('pinzas history disagreeing with current is marked inconsistent and hides transitions', () => {
    const d = withHistory(deal('60', 'false'), { ...history([['60', '2026-10-01T00:00:00Z']]), properties: { ...history([['60', '2026-10-01T00:00:00Z']]).properties,
      seguimiento_con_pinzas: mk([['false', '2026-10-02T00:00:00Z'], ['true', '2026-10-05T00:00:00Z']]) } });
    expect(evidenceChronology(d, NOW)).toMatchObject({ pinzasStatus: 'inconsistent', pinzas: [] });
  });
  test('truncation of another relevant property or incomplete batch marks partial', () => {
    const base = history([['60', '2026-10-01T00:00:00Z']]);
    const t = withHistory(deal(), { ...base, properties: { ...base.properties, adobo_current_urgencia: { versions: [], truncated: true } } });
    expect(evidenceChronology(t, NOW).partial).toBe(true);
    expect(evidenceChronology(withHistory(deal(), { ...base, complete: false }), NOW).partial).toBe(true);
    expect(freshnessReport(withHistory(deal(), { ...base, complete: false }), '2026-10-19T11:00:00Z', NOW).sources.find(s => s.key === 'history')?.state).toBe('partial');
  });
  test('toPropertyHistory carries batch incompleteness', () => {
    expect(toPropertyHistory('a', URL_, '2026-10-19T11:00:00Z', {}, false).complete).toBe(false);
  });
  const ev = (o: Record<string, unknown>) => JSON.stringify({ version: 'adobo-workflow/v1', records: { a: [{ state: 'reviewed', at: '2026-10-19T00:00:00Z', actor: 'g@adere.so', fingerprint: 'f', ...o }] } });
  for (const [name, o] of [['resolved without evidence, blank actor, future', { state: 'resolved', actor: '', at: '2099-01-01' }],
    ['resolved without evidence', { state: 'resolved' }], ['future timestamp', { at: '2099-01-01T00:00:00Z' }], ['blank actor', { actor: '  ' }],
    ['blank fingerprint', { fingerprint: '' }], ['nonstring note', { note: 5 }], ['nonstring url', { url: {} }],
    ['waiting without date', { state: 'waiting' }], ['waiting date before event', { state: 'waiting', reviewAt: '2026-10-18T00:00:00Z' }],
    ['reviewAt on reviewed', { reviewAt: '2026-10-25T00:00:00Z' }]] as const)
    test(`persisted invalid event rejected: ${name}`, () => expect(parseStore(ev(o), NOW).records).toEqual({}));
  test('valid persisted events survive', () => {
    expect(Object.keys(parseStore(ev({}), NOW).records)).toEqual(['a']);
    expect(Object.keys(parseStore(ev({ state: 'waiting', reviewAt: '2026-10-20T00:00:00Z' }), NOW).records)).toEqual(['a']);
  });
  test('fingerprint binds owner and episode identities, not read time', () => {
    const d = deal('60', 'true');
    const other = { ...deal('60', 'true'), ownerId: 'p' } as DealDTO;
    expect(alertFingerprint(other, NOW)).not.toBe(alertFingerprint(d, NOW));
    expect(alertFingerprint(d, NOW + 10 * H)).toBe(alertFingerprint(d, NOW));
    const h1 = withHistory(deal('60', 'true'), history([['60', '2026-10-01T00:00:00Z']]));
    const h2 = withHistory(deal('60', 'true'), { ...history([['60', '2026-10-01T00:00:00Z']]), fetchedAt: '2026-10-19T11:30:00Z' });
    expect(alertFingerprint(h1, NOW)).toBe(alertFingerprint(h2, NOW));
  });
  test('distinct unanswered episodes with identical counts/window change fingerprint', () => {
    const mkCtx = (epId: string): DealDTO => {
      const d = deal('60', 'false');
      const e = { url: `https://example.org/${epId}`, at: '2026-10-15T00:00:00Z' };
      d.adobo!.verifiedContext = { version: 'adobo-evidence/v1', verified: true, fresh: true, coverageVerified: true,
        temporal: { version: 'adobo-context-time/v1', observedAt: '2026-10-19T11:00:00Z', window: { start: '2026-10-01T00:00:00Z', end: '2026-10-19T10:00:00Z' }, validity: { version: 'producer-validity/v1', maxAgeMs: 24 * H } },
        evaluation: null, history: [], lastCustomerResponse: null, nextStep: null, commitment: null, pinzasEvidence: null,
        followup: { version: 'followup-episodes/v1', methodology: 'responded-eligible-episodes', verified: true, fresh: true, coverageVerified: true, pauseAgreed: false,
          window: { start: '2026-10-01T00:00:00Z', end: '2026-10-19T10:00:00Z' }, observedAt: '2026-10-19T11:00:00Z', validity: { version: 'producer-validity/v1', maxAgeMs: 24 * H },
          coverage: { covered: 1, total: 1 }, episodes: [{ id: epId, state: 'eligible', response: null, evidence: e, dueAt: '2026-10-16T00:00:00Z' }] } };
      return d;
    };
    const a = mkCtx('ep-1'), b = mkCtx('ep-2');
    expect(dealIntelligence(a, NOW).noResponse).toBe(true);
    expect(alertFingerprint(a, NOW)).not.toBe(alertFingerprint(b, NOW));
  });
  const badCtx = (patch: Partial<AdoboVerifiedContextV1>): DealDTO => {
    const d = deal();
    d.adobo!.verifiedContext = { version: 'adobo-evidence/v1', verified: true, fresh: true, coverageVerified: true,
      temporal: { version: 'adobo-context-time/v1', observedAt: '2026-10-10T00:00:00Z', window: { start: '2026-10-01', end: '2026-10-10T00:00:00Z' }, validity: { version: 'producer-validity/v1', maxAgeMs: H } },
      evaluation: { url: 'https://example.org/eval', at: '2026-10-09T00:00:00Z' }, history: [], lastCustomerResponse: null, nextStep: null, commitment: null, pinzasEvidence: null, followup: null, ...patch } as AdoboVerifiedContextV1;
    return d;
  };
  test('structurally valid old context is shown as expired evaluation', () => {
    expect(freshnessReport(badCtx({}), '2026-10-19T11:00:00Z', NOW)).toMatchObject({ status: 'recalculation-needed', evaluation: { state: 'expired' } });
  });
  for (const [name, patch] of [['verified=false', { verified: false }], ['wrong version', { version: 'adobo-evidence/v0' as 'adobo-evidence/v1' }],
    ['future observedAt', { temporal: { version: 'adobo-context-time/v1', observedAt: '2026-10-25T00:00:00Z', window: { start: '2026-10-01', end: '2026-10-10T00:00:00Z' }, validity: { version: 'producer-validity/v1', maxAgeMs: H } } }],
    ['evaluation outside window', { evaluation: { url: 'https://example.org/eval', at: '2026-09-01T00:00:00Z' } }],
    ['malformed history', { history: [{ score: 500, evidence: { url: 'https://x.test', at: '2026-10-05T00:00:00Z' } }] }]] as const)
    test(`invalid old context stays unknown: ${name}`, () => {
      expect(freshnessReport(badCtx(patch as Partial<AdoboVerifiedContextV1>), '2026-10-19T11:00:00Z', NOW)).toMatchObject({ status: 'not-verifiable', evaluation: null });
    });
});

describe('mapper + chronology: discarded versions', () => {
  const map = (raw: Parameters<typeof toPropertyHistory>[3]) => withHistory(deal('60', 'true'), toPropertyHistory('a', URL_, '2026-10-19T11:00:00Z', raw));
  test('dated 80, undated 70, dated 60 never claims 80→60', () => {
    const d = map({ adobo_closing_score: [{ value: '60', timestamp: '2026-10-10T00:00:00Z' }, { value: '70' }, { value: '80', timestamp: '2026-10-01T00:00:00Z' }] });
    const c = evidenceChronology(d, NOW);
    expect(c.transitions).toEqual([]); expect(c.partial).toBe(true); expect(c.status).toBe('inconsistent');
    expect(dealIntelligence(d, NOW).delta).toBeNull();
  });
  test('malformed timestamp also breaks pinzas chronology', () => {
    const d = map({ adobo_closing_score: [{ value: '60', timestamp: '2026-10-01T00:00:00Z' }],
      seguimiento_con_pinzas: [{ value: 'true', timestamp: '2026-10-05T00:00:00Z' }, { value: 'x', timestamp: 'bad' }, { value: 'false', timestamp: '2026-10-02T00:00:00Z' }] });
    expect(evidenceChronology(d, NOW)).toMatchObject({ pinzasStatus: 'inconsistent', pinzas: [] });
    expect(freshnessReport(d, '2026-10-19T11:00:00Z', NOW).sources.find(s => s.key === 'history')?.state).toBe('partial');
  });
  test('oldest-version truncation alone keeps a retained adjacent pair', () => {
    const versions = Array.from({ length: 14 }, (_, i) => ({ value: i === 13 ? '60' : '80', timestamp: new Date(Date.parse('2026-10-01T00:00:00Z') + i * H).toISOString() }));
    const d = map({ adobo_closing_score: versions });
    const c = evidenceChronology(d, NOW);
    expect(c.partial).toBe(true); expect(c.status).toBe('changed');
    expect(dealIntelligence(d, NOW).delta).toBe(-20);
  });
  test('inconsistent pinzas is never reported as covered history', () => {
    const d = map({ adobo_closing_score: [{ value: '60', timestamp: '2026-10-01T00:00:00Z' }], seguimiento_con_pinzas: [{ value: 'false', timestamp: '2026-10-05T00:00:00Z' }] });
    expect(evidenceChronology(d, NOW).pinzasStatus).toBe('inconsistent');
    expect(freshnessReport(d, '2026-10-19T11:00:00Z', NOW).sources.find(s => s.key === 'history')?.state).toBe('partial');
  });
});
