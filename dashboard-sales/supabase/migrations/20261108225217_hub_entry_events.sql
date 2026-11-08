-- Private usage events, independent from authentication and one-time welcome claims.
-- Identity is supplied only by the existing corporate/MFA-verified server gateway.
create table public.hub_entry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_id uuid not null,
  -- Verified JWT session identifier, not a token; no FK because Auth removes closed sessions.
  auth_session_id uuid,
  entered_at timestamptz not null default clock_timestamp(),
  constraint hub_entry_events_user_visit_unique unique (user_id, visit_id)
);
create index hub_entry_events_time_id_idx on public.hub_entry_events (entered_at, id);
alter table public.hub_entry_events enable row level security;
revoke all on public.hub_entry_events from public, anon, authenticated, service_role;
grant select, insert on public.hub_entry_events to service_role;
comment on table public.hub_entry_events is 'Server-verified production Hub openings. Reloads and technical retries share a visit ID. No tokens, IPs or browser fingerprints.';

-- Populate exact account expectations privately after approval. Never publish team emails in a migration.
create table public.hub_entry_country_expectations (
  account_email text primary key check (account_email = lower(btrim(account_email)) and account_email ~ '^[^@[:space:]]+@adere[.]so$'),
  expected_country_code text not null check (expected_country_code ~ '^[A-Z]{2}$'),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.hub_entry_country_expectations enable row level security;
revoke all on public.hub_entry_country_expectations from public, anon, authenticated, service_role;
grant select, insert, update on public.hub_entry_country_expectations to service_role;

-- Enrichment is written only by the authorized monitor after reading provider-owned edge metadata.
create table public.hub_entry_country_assessments (
  event_id uuid primary key references public.hub_entry_events(id) on delete cascade,
  assessment text not null check (assessment in ('expected','unusual_country','unknown','unconfigured')),
  evidence_state text not null check (evidence_state in ('observed','multiple','unknown','incomplete')),
  observed_country_codes text[] not null default '{}',
  expected_country_code text,
  source_log_ids uuid[] not null default '{}',
  assessed_at timestamptz not null default clock_timestamp()
);
alter table public.hub_entry_country_assessments enable row level security;
revoke all on public.hub_entry_country_assessments from public, anon, authenticated, service_role;
grant select, insert, update on public.hub_entry_country_assessments to service_role;
