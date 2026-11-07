# Hub comercial · content ownership

Playbook and Operativa are live views of Notion, not independent copies of their prose.

- Playbook source: `31d9c274-7df5-81e7-bec7-cfea5d224070`.
- Operativa source: `31c9c274-7df5-81d9-8825-fcaaff9823b7`.
- Changes requested in this chat must update the corresponding Notion source through the connected Notion tool, then verify publication in the Hub. Fetch the exact current block/page first; reconcile newer content and preserve unrelated text. Verify the write before refreshing. Never overwrite a changed source from an old local snapshot.
- After a verified source edit, run `node --env-file=.env.local scripts/sync-commercial-guides.mjs playbook` (or `operativa`, or both) from `dashboard-sales/`. The command requests and checks the private worker. A busy/pending/failed result is not completion; wait for the current worker and verify the published snapshot contains the requested change.
- Do not edit legacy embedded `STAGES`/`TREE` text or `playbook/index.html`/`operativa/index.html` prose to change the commercial source. The live guide renderer owns displayed content. Presentation changes belong in Git (`commercial-guides.js`, brand styles, chapter navigation) and must not rewrite Notion content.
- There is no browser content editor and no runtime Notion write endpoint in the user-selected workflow. Use the connected Notion tool for authorized source writes; keep the runtime OAuth grant read-only and server-only.
- Source snapshots, OAuth grants and credential files remain private. Never add `.env*`, `.migration-backups`, or fetched Notion contents to Git or public hosting. Preserve Hub-wide server authentication and MFA.
- The Academy and guide worker shares durable leases, pending flags and versioned snapshots. Never clear a live lease or report a failed/partial read as a complete publication.

For Dashboard Sales code, also follow `dashboard-sales/AGENTS.md`.

# Publishing

GitHub Pages is only a migration redirect, using `_config.yml` exclusions and `pages-redirect/` permalink pages. Never publish the Hub shell or internal material through Pages. Add new application assets to the Pages exclusions; the CI Pages boundary check must pass before merging. Render remains the official authenticated Hub and its independent public Partners/ROI site. Release changes through reviewed, passing GitHub commits; keep secrets and source snapshots untracked.
