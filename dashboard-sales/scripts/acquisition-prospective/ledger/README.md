# Acquisition webhook ledger proposal — NOT APPLIED

`ledger-proposal.sql` is a reviewed-design starting point, not an installed migration or a production-validated schema. No database was changed. PostgreSQL binaries are absent in this preparation environment; SQL integration tests below are supplied but were **not executed**. No SQLite imitation is offered as evidence of PostgreSQL locking or role behavior.

Scope constants in this artifact are synthetic: portal 1, app 2, pipelines 3/4. Review and replace them privately for the intended portal before integration; no customer identifiers belong in this public proposal.

## Adapter contract

`public.acquisition_ingest_events(p_events jsonb)` accepts 1–100 envelopes:

```
{ eventKey: "64 lowercase hex JS diagnostic fingerprint", event: {
  portalId: "1", appId: "2", eventId: "123",
  subscriptionId: "456", occurredAt: 1794560000000,
  type: "deal.creation", dealId: "789"
} }
```

Other event variants are `contact.propertyChange` (`contactId`, `value` in empty/Inbound/Outbound/No aplica), or `deal.associationChange` / `contact.associationChange` (`dealId`, `contactId`, `removed` boolean). Only the receiver may map verified CONTACT_TO_DEAL / DEAL_TO_CONTACT direction to these IDs. Input excludes attemptNumber, raw payloads, unselected property values, signatures, credentials and personal free text.

Important: JS `JSON.stringify` and PostgreSQL `jsonb::text` do not serialize identically. The database deliberately recomputes its own canonical identity key; caller `eventKey` is format-checked but not trusted or persisted. Use returned `eventKeys` as database evidence references. DB identity excludes changing `value` / `removed`, so a conflicting same-identity payload aborts the entire batch instead of overwriting or silently adding another version. Event ID alone is not unique: identity also carries app, portal, subscription, event type, object IDs and occurrence time. Unknown metadata differences may still produce separate identities; test actual provider fixtures before activation.

Insert and deduplication take place inside one transaction/function call. The response must be acknowledged only after commit. A duplicate re-delivery (including changed delivery attempt metadata already stripped by receiver) does not mutate evidence. A conflict returns an error and rolls back the whole batch. No signature is verified by SQL; the trusted receiver must verify authentic raw bytes before calling this function. No raw webhook payload is stored.

## Access and immutability

Tables live in unexposed `acquisition_private`; keep that schema out of PostgREST exposed schemas. RLS enabled. Public callable wrappers use SECURITY INVOKER with a fixed pg_catalog search_path and qualified tables. EXECUTE is revoked from PUBLIC/anon/authenticated and granted only to service_role. Browser roles have no schema/table grants. There is no SECURITY DEFINER bypass. service_role can select/insert evidence and snapshots, but cannot update/delete them; mutation triggers provide additional protection. Its direct snapshot inserts must pass the same attestation gate via trigger.

Because SECURITY INVOKER needs underlying grants, service_role remains a trusted server principal able to insert evidence directly. This is not isolation from a compromised service-role key. Do not expose the key or RPC to untrusted callers. A dedicated database role could narrow this later, but creating credentials or changing production role grants is outside this proposal.

## Completeness is not inferred

A newly created receiver, last event time, retry completion, quiet period, current CRM association, or successful status code does not prove complete history. `snapshot_attestations` requires independently established coverage and identity-at-creation proof, expected pipeline, exact as-of instant, rule version and stored event references. service_role has only SELECT on this table; this proposal has no path for the receiver to self-attest. A future separately reviewed reconciliation/attestation process is required.

`acquisition_freeze_attested_snapshot` returns pending_evidence unless both coverage and identity are attested and every evidence key exists. Snapshot `(portal_id,deal_id)` is unique and append-only. A competing/different attestation returns frozen_conflict; it never overwrites. Unknown or cleared snapshots remain null (not Outbound). Renewal No aplica requires explicitly attested renewal; this does not silently decide whether late dealtype updates may override a frozen deal. The current rule conflict around renewal assigned after creation remains unresolved.

No HubSpot writer, worker, outbox or scheduler is supplied. Exactly-once database insertion does not imply exactly-once external CRM writes. No code should call a production write merely because a snapshot row exists.

## Staging verification before any deployment

1. Review SQL against current PostgreSQL/Supabase version and create an isolated disposable database with representative Supabase roles.
2. Run proposal then `staging-tests.sql`; transaction ends ROLLBACK. Tests should run as database owner only in isolated staging. Verify all intended role denials.
3. Add two-session concurrency test: identical simultaneous ingest (one row), same identity/different value (one succeeds, conflict fails); concurrent freeze with two attestations (one immutable winner).
4. Verify malformed/oversized batches, mixed valid+invalid atomic rollback, missing evidence, false coverage, missing identity, null/empty acquisition, and update/delete rejection under service_role and browser roles.
5. Run Supabase security advisors; verify private schema unexposed and RPC permissions with anonymous/authenticated requests. Never “fix” denied browser access with broader grants.
6. Verify provider retry/order/duplicate payloads, signing secret and signature version, monitoring, retention, incident response and operational reconciliation before activation.
7. Only after tests, generate a proper versioned migration via current Supabase CLI; do not apply this proposal file directly to production.

Docs checked: Supabase changelog index and database/functions documentation (security invoker and explicit EXECUTE revokes). The September 2026 PostgreSQL breaking-change note concerns extension/custom-estimator upgrade compatibility; no extension or custom operator is used here, but staging version checks remain mandatory.

Capture start: receiver configuration must reject events before the verified subscription activation instant. This proposal does not yet store a durable capture-start watermark in SQL; do not claim gap-free coverage or accept complete attestations until a reviewed activation/coverage record is persisted. This is an explicit integration blocker, not something inferred from received_at. Database owner/superuser can bypass triggers; append-only guarantees apply to the granted service role, not a malicious administrator.
