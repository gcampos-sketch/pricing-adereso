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
