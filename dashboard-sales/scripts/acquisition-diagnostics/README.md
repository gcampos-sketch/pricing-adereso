# Acquisition diagnostics (not activated)

Operator-only read probe for a proposed acquisition snapshot workflow. This directory does not register an HTTP endpoint, MCP tool, job or CRM workflow. It does not run on import, load credentials, write HubSpot/Supabase, or classify records in production.

Latest rule: contact acquisition may change; each deal retains the value at its creation time. Renewal is No aplica. Do not reuse the superseded consumable-inbound-event design. The Marketing Inbound=Sí workflow and existing deal creator remain untouched.

## Run synthetic tests

`node --test scripts/acquisition-diagnostics/probe.test.mjs` from dashboard-sales.

No dependencies or network needed. Fixtures are synthetic. Node 22+ is compatible with the application runtime. Files live outside src, so no browser imports or test imports enter application compilation. No package/lockfile/build/config change is needed.

## Future private operator invocation

After code review, a trusted server operator can import inspectAcquisition and supply `path => gateway(path)` using the existing `src/lib/hubspot.server.ts` server abstraction. Do not expose this function as a public or arbitrary-path proxy. No CLI that accepts or prints credentials is included. No runtime invocation was performed for this PR.

Supply a private, verified selection of at most ten total contact/deal IDs, the exact two Comercial/SDR pipeline IDs, the verified property internal name and allowed internal enum values for acquisition and dealtype. Arrays are an explicit operator allowlist, not authorization for arbitrary callers. Verify portal 23480943 out of band before using the runtime credential. This module does not certify portal identity. Internal enum values are exact schema strings (including capitalization, spaces and accents), bounded to 200 characters without control characters. Property names use a separate identifier validator. Never rename CRM values to fit the probe.

Optional Events probe requires one selected contact, a maximum seven-day window, an event type and form-property internal name established from HubSpot metadata, and allowlisted form IDs. `e_submitted_form` / `hs_form_id` in tests are synthetic API-contract examples, NOT a claim of discovery or occurrence in this portal. It reads at most three pages and returns at most fifty matched occurrences. It reports bounded/failed reads explicitly. Empty results and event-type definitions alone do not certify coverage. A successful sample must be contrasted with a real submission in HubSpot before relying on it.

The injected adapter receives only fixed GET paths. Error details are discarded; output includes only selected IDs, dates, allowlisted enum values, reason codes, minimal event identifiers and association counts. Do not commit diagnostics or real IDs to this public repository. Existing gateway logging should be reviewed before runtime use: its read retry warning logs request paths (IDs/time filters, not credentials); no form field values are requested. Never log upstream response bodies or raw contact metadata.

## Evidence limits and activation gates

- Reading current associations cannot prove the contact was associated at deal creation. Output always marks identityAtCreationProven=false. Multiple contacts require a verified origin, not an arbitrary oldest/latest contact.
- `asOf` evaluates only supplied available history, includes explicit clearing, and fails closed for conflicting same-time versions. It is not a production snapshot writer and does not make a claim that property history covers record merges or all prior time.
- No contact property history before creation means unknown, not a current-value backfill. Never classify an old deal from today's contact value.
- Dealtype can be populated after deal creation. The policy for unknown initial type and later renewal must be defined before activating a frozen classifier.
- Property history access, Events scopes and real form occurrences have NOT been validated with the live token. A 401/403 requires authorization review, not credential substitution. No scopes are added here.
- Production concurrency, immutable ledger, transactional claims/outbox, retries after ambiguous writes, scheduler, live integration and deployment remain separate future work.

## Compatibility/security review

Additive, no application imports or routes changed, no schema migration, no dependency addition, no privileges added. Full app lint/typecheck/build and CI have not been run in this isolated diagnostic preparation. Only the focused Node tests and syntax check were run. Render deploys codex/dashboard-sales-hub automatically, so keep this on its separate draft PR branch. Do not merge, deploy or activate based on these synthetic tests.
