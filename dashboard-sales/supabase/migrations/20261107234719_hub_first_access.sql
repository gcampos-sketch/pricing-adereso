-- An account consumes its introduction once. No replay/reset endpoint or browser grants.
create table public.hub_first_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);
alter table public.hub_first_access enable row level security;
revoke all on public.hub_first_access from public,anon,authenticated;
grant select,insert on public.hub_first_access to service_role;
create function public.hub_claim_first_access(p_user_id uuid) returns boolean
language plpgsql security invoker set search_path=public as $$
declare inserted integer;
begin
  insert into hub_first_access(user_id) values(p_user_id) on conflict(user_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted=1;
end $$;
revoke all on function public.hub_claim_first_access(uuid) from public,anon,authenticated;
grant execute on function public.hub_claim_first_access(uuid) to service_role;
