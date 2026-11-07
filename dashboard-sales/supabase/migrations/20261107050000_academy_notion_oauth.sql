create table public.academy_notion_oauth_states(
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_hash text not null,
  expires_at timestamptz not null
);
create table public.academy_notion_connection(
  id boolean primary key default true check(id),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null,
  encrypted_tokens text not null,
  updated_at timestamptz not null default now()
);
alter table public.academy_notion_oauth_states enable row level security;
alter table public.academy_notion_connection enable row level security;
revoke all on public.academy_notion_oauth_states,public.academy_notion_connection from public,anon,authenticated;
grant all on public.academy_notion_oauth_states,public.academy_notion_connection to service_role;
