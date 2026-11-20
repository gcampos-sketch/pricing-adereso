# Isolated PostgreSQL validation (not deployed)

Validated against PostgreSQL 17.11, Debian official packages extracted into a temporary directory. Package SHA256 values were verified against the official Debian package index. No global install or service registration, external database, application credentials, customer records, or production configuration were used.

The exact proposal and staging-tests.sql from PR head 04832dbf8680c87fd9e0ccf880f3406b61ca3a74 were executed in a fresh synthetic database with roles anon, authenticated, service_role. Roles initially had no superuser or BYPASSRLS privilege.

## Results
- Proposal parsed and installed in disposable local database.
- staging-tests.sql completed without PostgreSQL ERROR/FATAL, repeated with explicit completion marker.
- Tested ingestion retry deduplication, conflicting evidence rejection, atomic invalid-batch rollback, missing-attestation pending result, null observed/renewal rejection, freeze retry, immutable snapshot, direct invalid insert rejection, and declared privilege checks.
- Test transaction rollback confirmed: webhook_events count returned zero.
- role-tests.sql was attempted but NOT passed: its `Expected RLS active` guard failed in standalone mode despite SET ROLE changing current_user. Standalone PostgreSQL retains implicit superuser behavior. The transaction aborted; subsequent tests did not run successfully. Assertions were not relaxed. This result is an environment limitation, not proof that RLS works or fails in normal server mode.

## Limits
A private Unix socket server start failed with Operation not permitted in the execution sandbox. Tests used the real PostgreSQL standalone backend (postgres --single -j), not an emulation. There was no listening socket or TCP port.
Two-session concurrency, actual Supabase service-role/PostgREST configuration, network endpoint permissions, webhook signatures/payload delivery, completeness, and temporal identity were NOT validated. Successful synthetic tests do not authorize activation, migration, or CRM writes.
No production schema was applied. The proposal remains inactive and must not be applied directly to production.

## Normal-server CI validation: PASSED

The local standalone limitation was subsequently resolved using a disposable official postgres:17 service in GitHub Actions, not by weakening assertions.

- Tested commit: 415649bdbccd6c19999e7fabafd879db800b866a.
- Run: https://github.com/gcampos-sketch/pricing-adereso/actions/runs/43447910352
- Job: isolated-ledger, 131962127070; completed SUCCESS.
- psql ON_ERROR_STOP=1 executed staging-tests.sql and role-tests.sql successfully under a normal PostgreSQL server.
- Actual SET ROLE tests passed for service_role NOBYPASSRLS and BYPASSRLS, anon and authenticated; verified RLS active when expected, RPC/table privilege denials, no self-attestation, coverage gates, direct-insert checks and append-only triggers even under simulated accidental grants.
- concurrency-tests.py passed three READ COMMITTED contention cases: identical evidence gives one insert plus one deduplication; conflicting evidence fails SQLSTATE23505 without overwrite; competing attestations produce one immutable winner and frozen_conflict for the loser. Each case observed session A after write in PgSleep and session B waiting on a Lock before checking outcomes.
- Service container was stopped at job completion. No external service credentials, secrets, CRM payloads or customer records were used. Workflow has pull_request path filters, contents:read only, pinned checkout with persist-credentials:false, and no deployment step.

This supersedes only the unvalidated role/concurrency statements above. Hosted Supabase/PostgREST exposure and permissions, real provider signature/payload delivery, complete temporal identity, durable capture watermark, and activation remain unvalidated. postgres:17 is an official moving-major image; pin an approved image digest/version for production parity validation.
