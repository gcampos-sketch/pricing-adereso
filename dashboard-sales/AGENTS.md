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
- The local hub embeds Dashboard Sales on port 8878. Hub sign-in uses passkeys (Touch ID, Face ID or Keeper), followed by MfaGate/Authenticator when required. The user explicitly removed email-link/OTP sign-in from the Hub; never restore an email login form or send routine sign-in emails. New users need administrator-assisted enrollment. Local previews link to the fixed official Hub for passkey login because the production WebAuthn RP must not be changed. Preserve exact @adere.so authorization, server MFA and MCP grants.

- The whole Hub is served behind the shared AuthGate/MfaGate at the application root. Hub files must remain outside public build assets and pass the server-verified /hub-content/ gateway; the embedded dashboard uses /?dashboard=1 on the same origin. Never restore the unprotected static development server.

- Public /partners/ is an explicitly authorized external presentation extracted only from ppTpl, plus three allowlisted visual assets. Sharing must link to it without session tokens or customer data; never expose the Hub shell or private reports through public route parameters.

- The active share flow collects a recipient/message and opens Gmail compose with the public Partner link; direct OAuth sending is deferred by the user. When enabled in future, per-user Gmail sharing is server-only and requires the existing corporate MFA session. Verify Google ID-token issuer/audience, nonce, verified email/domain and exact Hub-account match. Keep encrypted refresh credentials inaccessible to browser roles. Atomic send claims prevent duplicate retries; ambiguous delivery must never automatically resend. Missing OAuth configuration must remain explicit.

- Public /roi/ must contain only the extracted ROI section/formulas and standalone inputs, never the full Pricing document hidden by CSS. Share links may carry only monthly investment, conversation volume and optional all-in WhatsApp unit rate; no private Hub state or session.

- Embedded dashboards use embedded=hub and ReportSidebar's panel presentation: a labeled, fully hideable report subnavigation beside the Hub rail, with a drawer on narrow screens. Standalone dashboards retain the sidebar. All presentations share report definitions, Index selection/fetching, refresh and account controls; embedded is presentation only and never changes authorization. Hiding navigation must preserve the selected view, loaded data and filters.

- Dashboard neutral surfaces and typography follow the Hub’s root brand-system.css (Outfit headings, Work Sans body, the same quiet atmospheric page gradients as Pricing in index.html, without patterns or animation). Preserve executive-summary semantic/chart colors when aligning presentation; never restore the page grid.

- Hidden embedded report navigation exposes a shadowed desktop edge: pointer/focus previews overlay the report and close on leave/Escape, while explicit open pins it. Hover must never change Index view/filter state or reserve layout width; touch continues using the drawer button.

- The embedded dashboard has no Hub launch bar or report header strip; its iframe uses the full viewport and report content fills available width with compact gutters. Keep the edge control usable for touch/keyboard and preserve launch bars for other embedded tools.

- The bell combines authorized report operational tasks with the existing personal producer repository, one task per deal and all reasons preserved. Reuse report warning/hygiene drilldowns and executive populations; do not widen private Adobo reads. Owner/role/type/stage filters apply to every task, while year/Q do not hide current warnings. E4 missing dates require chronological before/after evidence and remain review candidates, never confirmed skips. Personal review checks use evidence fingerprints and do not resolve CRM alerts; changed evidence reopens a task.

- DealModal headers own a stacking context above frozen body cells; frozen column offsets share the selection-width/gap variables. Row tools open from a compact portalled actions menu beside the deal title, so hover/focus never reserves another line or moves rows. Keep keyboard scrolling on the deal-list region and never test editable CRM fields by changing their values.
- Deal cells omit captions duplicating their column headings; retain only useful context such as last activity date and multiple contacts. Contact names open mailto in one click, with email/title in the tooltip instead of a permanent extra line. Frozen name cells and checkboxes align centrally with the row data.

- DealModal filters occupy one non-wrapping horizontal toolbar. Search is a circular trigger opening an autofocus overlay; search/filter panels portal above the modal so toolbar scrolling never clips them. Escape closes the active overlay before the deal modal; keep existing client filtering and avoid CRM writes while verifying.

- HubSpot nextStep text and its arrow action are omitted from deal rows at the user’s request. Keep the original CRM value intact.

- Deal rows keep Adobo composition and missing-evidence details in a portalled popup opened from the score. Verified Adobo trends appear beside the score instead of a separate column; CRM probability trends use exact hs_deal_stage_probability history in the same verified current-stage interval. Missing/partial/conflicting history stays unknown inside the detail, never a fabricated neutral trend. Preserve native probability editing and stable row/action geometry.

- DealModal monthly totals reduce its final filtered/locally edited deals by close calendar date, across the current calendar quarter, including past months within that quarter. Month controls share the same date helper. Out-of-window and invalid-date totals remain explicit so the summary reconciles with the table; never sum the raw payload or selected checkboxes instead.

- Checkbox selection immediately shows a compact amount summary, without a simulation mode/button or commission form. Commercial lists add eligible open selected deals to the same owner/role/type and selected-period won baseline (MRR + OTF/12), excluding already-won IDs, non-eligible rows and close dates outside that period. Bulk CRM actions stay collapsed and require their existing explicit actions; checking a row never writes to HubSpot.

- DealModal keeps filters visible and uses the shared useDealHeaderScroll hook for continuous, distance-driven chrome collapse/expansion with frame-based damping; do not restore binary compact-state switches or change summary layout modes mid-scroll. Horizontal movement and viewport-induced scroll clamping must not change progress. Default ordering is descending close probability, then latest close calendar date; missing dates go last within a probability tie. Explicit drilldown ordering remains authoritative.

- SALES-52 commission uses user-entered per-account/owner browser preference; exact attainment boundaries enter the upper band and percentages use half-up rounding to two decimals. Never imply the 9.09% example is a universal rate or calculate monetary payout without a verified base.
- SALES-78 pace is calendar days including today, clamped to the single selected quarter, using the same eligible MRR + OTF/12 and quota. "En línea" means equality after rounding real/expected percentages to one decimal; missing quota is unknown, not off track.
- SALES-53 WR reference aggregates unique positive-amount closed Commercial Adereso deals over all available periods with owner/role/type scope, independent of selected Q. Estado actual defaults immediately after period results; existing browser-local fold ordering remains user-owned.
- SALES-84 note receipts are server-only and unique per user/request/deal. A create POST is never retried automatically; uncertain results reconcile exact body/timestamp/deal association before any success claim. Draft and operation ID survive UI retries; changing content starts a new operation. Notes and Adobo history reads verify pipeline 93085851.
- SALES-83 native WhatsApp channel is WHATS_APP; legacy WHATSAPP is also accepted. Count unique exact deal associations, fully page association reads and never turn a failed/partial activity read into a zero or a complete-followup badge.
- SALES-107 consumes exact CRM trend plus bounded score/stage property history. Current/prior versions must agree with the snapshot and both lie inside the current verified stage interval; otherwise show Sin comparación rather than bridge a potentially reopened cycle. Never write scores or probability.
- SALES-89 hygiene consumes the existing personal authorized producer repository inside forecast hygiene. Team selection does not grant other owners' private evidence; coverage limitations remain explicit. Approved cross is active AND (score >=76 OR probability >70), with independent units/nulls.
- SALES-101 feedback stores only authenticated author, comment and allowlisted view. The user chose internal persistence followed by a Linear issue in Dashboard comercial. Delivery belongs to the authorized worker with an atomic claim and durable issue ID; unknown creation must reconcile by exact feedback ID, never recreate blindly. A pending issue is not displayed as created. Never attach CRM data, query tokens or screenshots automatically.

- Playbook and Operativa in the Hub render the live Notion block snapshots through the private /api/guides/content gateway. Their fixed Notion IDs are defined in commercial-guides.ts. Do not edit the legacy embedded text/arrays to change commercial content: those are no longer the displayed source. For content changes requested in this chat, fetch the exact current Notion page/block, reconcile concurrent edits, apply only the requested change with the connected Notion tool, read back the write, run scripts/sync-commercial-guides.mjs for the affected guide and verify its published hash. Design/layout changes stay in Git and must not overwrite Notion prose. Do not claim both copies updated until the source write and published snapshot are verified. The runtime Notion connection remains read-only; no browser editor or server-side content write scope is needed for this user-selected workflow.

- The first-access welcome is claimed atomically per account in hub_first_access, after server-verified corporate MFA. It is consumed before playback, including when skipped/interrupted, and must never be keyed only by browser storage or reset on logout, a new device, or a release. Embedded dashboard frames do not claim or replay it. Keep the finite logo/light/starfield sequence skippable and honor reduced motion; there is no replay/reset product route. Visual QA uses an isolated fixture, not a real user's first-access claim.

- Month-summary cards apply a separate, reversible table drilldown over the existing filtered/edited deals. Keep summary buckets stable while a card is selected and preserve all underlying filter state when toggling it off; never write to CRM from a summary click.

- The month-summary total is labeled Total Q and includes every filtered deal in the current calendar quarter, including past months within that quarter. Its drilldown uses the exact same quarter buckets; older quarters stay excluded.
