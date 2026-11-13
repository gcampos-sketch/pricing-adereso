# Prospective acquisition webhook core — not activated

This is an isolated, review-only implementation artifact. No application route imports it; no subscriptions, secrets, permissions, migrations, scheduler or HubSpot writers are configured. It does not edit Marketing or the existing deal creator. Never use the legacy Inbound flag as historical proof.

## Components and boundaries

- `core.mjs`: Node-only receiver factory, minimal event normalization, semantic idempotency keys and temporal candidate resolver.
- `core.test.mjs`: synthetic Node tests. Run `node --test scripts/acquisition-prospective/core.test.mjs` from dashboard-sales.
- Ledger SQL is a proposal, not an applied migration or proof of database permissions/concurrency. Apply only after separate staging review and tests.

The receiver requires a private-app signing secret, not the API access token. It verifies the legacy v1 SHA256(secret + exact raw body) documented by HubSpot, with constant-time comparison. It accepts no v2/v3 downgrade. A real app delivery must establish signature version before activation; if the app sends another version, implement and test that exact algorithm instead of weakening verification. No secret is committed, displayed or loaded by this module.

Request bodies are bounded at 256 KiB and 100 events. A hosting adapter must also impose an input-read deadline and request/concurrency limits. No Host or forwarded header is trusted for authorization. Batch records are normalized to IDs, timestamps, event kinds and approved acquisition enum values; no emails, arbitrary fields, raw body, signature or source metadata are persisted. Unknown event types/properties are rejected, not silently accepted. Configure only supported subscriptions initially.

v1 signatures do not authenticate a request timestamp. Durable event deduplication and a configured capture-start boundary are therefore mandatory. The ledger must retain dedupe identities for the capture's lifetime. Do not reset/delete them while accepting replayable events. A retry's attemptNumber is excluded; eventId alone is not assumed unique. Mirrored association events remain distinct receipts but produce one logical association in reconstruction.

A batch must commit durably in one transaction before 204. Failure returns 503 for upstream retry. No discarded background work after response. `persistBatch` is a trusted server adapter, not an HTTP-supplied callback. It must enforce portal/app constraints, normalized schema, atomic idempotency and conflict rejection. Connection pool limits and timeouts must meet HubSpot's five-second delivery deadline; this is not tested against Render Free cold starts.

## Prospective subscriptions (not created)

- deal.creation
- deal.associationChange and/or contact.associationChange restricted in receiver to CONTACT_TO_DEAL / DEAL_TO_CONTACT
- contact.propertyChange for tipo_de_adquisicion

Merge, deletion, privacy deletion, restore and unexpected association changes require a reviewed invalidation/retention path before broad production capture. They must invalidate coverage for affected records, never silently reuse old identities. This artifact does not configure those subscriptions or claim coverage of them.

## Reconstruction is explicitly not a writer

Latest requested business rule: mutable contact acquisition, each deal snapshots the historical contact value at its own creation. Renewal is No aplica. Neither current associations nor current contact state prove that snapshot.

The resolver requires trusted, separately established coverage attestations: association identity at creation, complete acquisition history, complete capture, and no invalidating event. It does NOT derive completeness from quiet time or from all webhook requests returning 204. Delivery can be delayed/out of order or exhausted after retries. A suitable baseline/reconciliation source and retention contract must be validated before any such attestation is set.

Only one active contact at creation is allowed. Same-time add/remove, competing property versions, missing creation event, missing historical value, late association, unknown initial dealtype and out-of-scope pipeline stay pending. Later contact changes are not applied retroactively. Candidate outputs always have writeAllowed=false. Unknown is not Outbound. These gates deliberately leave many deals pending until evidence is sufficient.

Observed real workflows may set dealtype minutes after creation. The product decision between a strictly creation-time snapshot and a separately defined completion-time policy is still unresolved. Do not silently wait five minutes then call it creation-time. A later renewal exception also requires an explicit policy.

## Deployment gates

1. Review code and proposed database privileges; run Postgres tests in isolated staging, including concurrent duplicate batches and conflicting freeze attempts.
2. Confirm signature version and association payload using an actual authorized app delivery to a staging receiver. Do not trigger or modify live customer records just to test.
3. Establish baseline/coverage, delayed-delivery reconciliation and invalidating-event handling; validate complete chronology and exact pipeline/type enums.
4. Configure a protected server adapter, request deadlines, monitored failure/retry queue and retention. No arbitrary proxy endpoint.
5. Only after explicit activation authorization, configure receiver URL/subscriptions and production secrets. A new subscription does not grant itself permission to write CRM.
6. A future writer needs single-writer durable claim/outbox, read-before-write and read-after-write reconciliation of uncertain outcomes. PostgreSQL cannot make a transaction atomic with HubSpot. This PR includes NO writer.

Sources: https://developers.hubspot.com/docs/api-reference/legacy/webhooks/guide and https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview . Keep credential/app/customer identifiers out of this public repository.
