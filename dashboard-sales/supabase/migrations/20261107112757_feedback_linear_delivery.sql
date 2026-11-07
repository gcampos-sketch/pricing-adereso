alter table public.dashboard_feedback
 add column linear_issue_id text unique,
 add column linear_issue_url text,
 add column linear_claimed_at timestamptz,
 add column linear_attempt_state text not null default 'pending' check(linear_attempt_state in ('pending','claimed','confirmed','uncertain'));
create index dashboard_feedback_linear_pending_idx on public.dashboard_feedback(created_at) where linear_issue_id is null;
