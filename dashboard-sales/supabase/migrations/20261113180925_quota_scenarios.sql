create table public.quota_scenarios (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 payload jsonb not null check (jsonb_typeof(payload)='object')
);
create index quota_scenarios_user_created on public.quota_scenarios(user_id,created_at desc,id);
alter table public.quota_scenarios enable row level security;
revoke all on public.quota_scenarios from anon, authenticated;
grant select,insert on public.quota_scenarios to service_role;
comment on table public.quota_scenarios is 'Immutable personal quota forecast snapshots. Server-only access through corporate MFA and exact authenticated user_id. No anonymous or direct client access.';
