<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- PipelineFunnel receives the selected-period quota from its dashboard parent so simulator attainment uses the same quota scope as the executive summary.
- SALES-97 consumes producer risk states without a duplicate detector; server reads corroborate the caller's owner by exact email and isolate a durable per-user repository with CAS updates. Why: UI filters cannot authorize team/private evidence and concurrent reads must not overwrite newer state.
- Notification retirement requires a newer exact producer attestation with explicit validity and complete coverage; unstructured SALES-89 text is displayed as uncorroborated and never used to prove resolution. Why: the four CRM properties alone lack a machine-verifiable freshness contract.

- ReportSidebar owns report navigation presentation; the index retains report selection and fetching so navigation does not reset dashboard data.

- AuthGate supplies account identity through context; ReportSidebar renders account controls in its footer so they remain available in the compact rail.

- The role filter (Todos/AE/KAM) is defined once in `src/lib/owner-roles.ts`; the server scopes the Pulse report by role (per-role cache keys `pulse-ae`/`pulse-kam`, MRR en servicio stays global) and client dashboards reuse the same role to narrow owner lists and deals. Never duplicate the owner↔role mapping elsewhere.

- The commercial overview separates selected-period results from today's operational snapshot because year/quarter filters must never imply that live hygiene and open-pipeline metrics are historical.
- Calendar creation comparisons and chronological activation checks live in the browser-safe story-metrics module, with tests outside src to keep test-runner imports out of application compilation.
- Report server functions use requireMfa (aal2 claim) and the UI wraps content in MfaGate; why: TOTP 2FA must be enforced server-side, not only in the UI.
- MCP tools require an active row in mcp_grants (user + OAuth client, created only by an aal2 session at consent, expiring and revocable), checked via has_active_mcp_grant under the caller's token; why: delegated OAuth tokens may not carry aal2, and grants survive token refresh.
- The consent route revokes remembered OAuth consents lacking an active mcp_grant before loading authorization details; why: loading an already-consented authorization auto-approves it and skips the MFA-backed grant.
- Trusted-device MFA uses server-issued tokens (mfa_trusted_devices, hash only) sent in the x-mfa-trust header and accepted by requireMfa; why: a browser-only signature cannot skip the code safely.
- CompactFilterBar measures a normal-flow anchor for its sticky appearance and preserves its geometry across the transition; why: changing header height or measuring sticky offsetTop creates scroll-anchor jumps.
- WR and generation/activation share the commercial FoldList and its existing browser-local ordering; why: independent collapse/reordering must not own or reset dashboard filters and metrics.
- Adobo Intelligence uses the shared commercial FoldList and browser-safe versioned evidence adapter; why: audit current CRM snapshots without inventing evaluation events or reusing legacy contact thresholds for episode metrics.
- Adobo summary cards and bounded drilldowns share a close-date selected-period universe through the browser-safe adobo-period adapter; why: totals, lists and history requests must exclude unrelated quarters without changing CRM evidence rules.
- Followup episode validation uses injectable time, producer-owned validity and per-episode evidence/deadlines; partial coverage has no global rate or absence signal because a sample cannot establish global customer silence.
- Adobo context evidence requires an explicit producer time window and validity checked against injectable time; historical events cannot be future and current evaluations/commitments must be fresh because snapshot flags alone do not attest their dates.
- Contact aggregates fail closed unless producer evidence binds their payload to the exact existing open-pipeline list, owner, role and report snapshot; individual deal verification cannot attest an aggregate.
- Adobo score/Pinzas chronology comes only from HubSpot propertiesWithHistory bound to the exact deal record (hubspot-property-history/v1, fail-closed to null on read errors, partial batches flagged incomplete, cache keyed by exact IDs+props and invalidated on manual refresh); unknown or conflicting versions break adjacency; why: comparing snapshots, bridging gaps or read times would fabricate events.
- Adobo alert review state is personal browser-local (adobo-workflow/v1 per account), keyed to an alert/evidence fingerprint and never written to CRM; why: shared persistence would need new permissions, and new adverse evidence must reopen resolved alerts.
- Adobo freshness/expiry uses a live client clock, not report.generatedAt; why: expiry must advance while the page stays open.
- Report snapshots use lossless report-wire/v1 deal references with backward-compatible reads; server code never shares in-flight promises, semaphore resolvers or singleflight builds across requests; why: Workers hang a request awaiting I/O owned by another (cancelled) request.
- Only the selected report is fetched; Adobo history loads in bounded requests on fold opening and is keyed to report read time; why: home must not compete with hidden reports or raw history batches, and refresh must not retain old evidence.
- Executive-strip cards and drilldowns share a browser-side owner/role/type scope over commercial-pipeline journeys and report on-track data; date/stage filters are excluded to retain historical counts without extra CRM reads.

- Standalone development uses native Vite/TanStack configuration and a Node Nitro build; server-only HubSpot access uses HUBSPOT_ACCESS_TOKEN against the official API. Never restore a Lovable gateway fallback, treat connector credentials as native tokens or expose server secrets through VITE_*.
- The local hub embeds Dashboard Sales on port 8878. Sign-in uses eight-digit email OTP for exact @adere.so addresses, followed by MfaGate; Supabase must use an OTP email template and the corporate signup hook. Preserve server MFA and MCP grants; email verification alone never grants report access.
