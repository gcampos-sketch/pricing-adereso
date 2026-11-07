-- Only MFA-checked server functions may access these records.
create table public.sales_note_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,
 deal_id text not null check (deal_id ~ '^[0-9]+$'),
 body_hash text not null,
 occurred_at timestamptz not null,
 status text not null check(status in ('pending','confirmed','rejected','uncertain')),
 note_id text,
 primary key(user_id,operation_id,deal_id)
);
alter table public.sales_note_receipts enable row level security;
revoke all on public.sales_note_receipts from public, anon, authenticated;
grant select,insert,update on public.sales_note_receipts to service_role;
create table public.dashboard_feedback (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 author_email text not null,
 body text not null check(length(body) between 1 and 4000),
 view_name text not null,
 created_at timestamptz not null default now(),
 email_state text not null default 'pending' check(email_state in ('pending','sending','sent','uncertain','failed')),
 email_claimed_at timestamptz,
 email_id text
);
alter table public.dashboard_feedback enable row level security;
revoke all on public.dashboard_feedback from public, anon, authenticated;
grant select,insert,update on public.dashboard_feedback to service_role;
create index dashboard_feedback_user_id_idx on public.dashboard_feedback(user_id);
