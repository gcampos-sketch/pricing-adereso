import type { ContactTempScope, PulseReport } from './pulse-types';
import type { RoleFilter } from './owner-roles';
import { validEvidence, type Evidence } from './adobo-intelligence';

/** Integration-only metadata. The current legacy producer supplies none. */
export type ContactSnapshotV1 = {
  version: 'contact-snapshot/v1'; id: string; observedAt: string;
  window: { start: string; end: string }; role: RoleFilter;
};
export type ContactAggregateEvidenceV1 = {
  version: 'contact-aggregate/v1'; verified: boolean; snapshot: ContactSnapshotV1;
  ownerId: string; evidence: Evidence;
  validity: { version: 'producer-validity/v1'; maxAgeMs: number };
  /** Exact canonical payload attested by the producer; not a security signature. */
  payload: string;
  members: { id: string; ownerId: string; snapshotId: string; observedAt: string;
    verified: boolean; evidence: Evidence; validUntil: string }[];
};

export function contactAggregatePayload(scope: ContactTempScope): string {
  return JSON.stringify({ id: scope.id, openCount: scope.openCount, coldCount: scope.coldCount,
    coldAmount: scope.coldAmount, coldModal: scope.coldModal, coldPct: scope.coldPct,
    buckets: scope.buckets.map(b => ({ key:b.key, count:b.count, amount:b.amount,
      avgScore:b.avgScore, share:b.share, modal:b.modal })) });
}

export function verifiedContactAggregate(report: Pick<PulseReport, 'contactTemp' | 'contactSnapshot' | 'generatedAt' | 'roleScope' | 'drilldowns'>,
  ownerId: string, role: RoleFilter, now: number = Date.now()): ContactTempScope | null {
  const candidates = report.contactTemp?.filter(s => s.id === ownerId) ?? [];
  if (candidates.length !== 1 || !Number.isFinite(now)) return null;
  const scope = candidates[0];
  if (!scope) return null;
  const proof = scope.validation, snapshot = report.contactSnapshot;
  if (!proof || !snapshot || proof.version !== 'contact-aggregate/v1' || proof.verified !== true ||
      snapshot.version !== 'contact-snapshot/v1' || !snapshot.id || proof.ownerId !== ownerId ||
      snapshot.role !== role || (report.roleScope ?? 'all') !== role ||
      !proof.snapshot || proof.snapshot.version !== snapshot.version || proof.snapshot.id !== snapshot.id ||
      proof.snapshot.role !== snapshot.role || proof.snapshot.observedAt !== snapshot.observedAt ||
      !proof.snapshot.window || !snapshot.window || proof.snapshot.window.start !== snapshot.window.start ||
      proof.snapshot.window.end !== snapshot.window.end || snapshot.observedAt !== report.generatedAt) return null;
  const start=Date.parse(snapshot.window.start), end=Date.parse(snapshot.window.end), observed=Date.parse(snapshot.observedAt);
  const validity=proof.validity;
  if (![start,end,observed].every(Number.isFinite) || start>end || end>observed || observed>now ||
      validity?.version !== 'producer-validity/v1' || !Number.isSafeInteger(validity.maxAgeMs) ||
      validity.maxAgeMs<=0 || now-observed>=validity.maxAgeMs) return null;
  const inWindow = (e: Evidence) => validEvidence(e) && Date.parse(e.at)>=start && Date.parse(e.at)<=end;
  if (!inWindow(proof.evidence) || proof.payload !== contactAggregatePayload(scope)) return null;
  // Reuse the exact existing open-pipeline list, not an unrelated stage journey or a fallback owner.
  const deals=report.drilldowns[ownerId === 'team' ? 'team-open' : `owner-${ownerId}-open`]?.deals;
  if (!deals || !Array.isArray(proof.members) || scope.openCount !== deals.length || proof.members.length !== deals.length ||
      new Set(deals.map(d=>d.id)).size !== deals.length || new Set(proof.members.map(m=>m.id)).size !== proof.members.length) return null;
  const members=new Map(proof.members.map(m=>[m.id,m]));
  if (deals.some(d=> {
    const m=members.get(d.id);
    return !m || m.ownerId!==d.ownerId || (ownerId!=='team' && d.ownerId!==ownerId) ||
      m.verified!==true || m.snapshotId!==snapshot.id || m.observedAt!==snapshot.observedAt ||
      !inWindow(m.evidence) || !Number.isFinite(Date.parse(m.validUntil)) || Date.parse(m.validUntil)<=now;
  })) return null;
  return scope;
}