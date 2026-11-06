begin;
create table if not exists public.hub_gmail_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null check (email ~ '^[^@[:space:]]+@adere\.so$'),
 google_sub text not null,
 refresh_token_encrypted text not null,
 connected_at timestamptz not null default now()
);
create table if not exists public.hub_gmail_oauth_states (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state_hash text unique not null,
 verifier_encrypted text not null,
 nonce text not null,
 selection jsonb not null,
 expires_at timestamptz not null
);
create table if not exists public.hub_gmail_sends (
 request_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 payload_hash text not null,
 status text not null check(status in ('pending','sent','failed','unknown')),
 provider_message_id text,
 created_at timestamptz not null default now()
);
create index if not exists hub_gmail_sends_user_time on public.hub_gmail_sends(user_id,created_at);
alter table public.hub_gmail_connections enable row level security;
alter table public.hub_gmail_oauth_states enable row level security;
alter table public.hub_gmail_sends enable row level security;
revoke all on public.hub_gmail_connections, public.hub_gmail_oauth_states, public.hub_gmail_sends from public, anon, authenticated;
grant all on public.hub_gmail_connections, public.hub_gmail_oauth_states, public.hub_gmail_sends to service_role;
create or replace function public.hub_claim_gmail_send(p_user_id uuid,p_request_id uuid,p_payload_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare existing public.hub_gmail_sends%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
 select * into existing from public.hub_gmail_sends where request_id=p_request_id;
 if found then
  if existing.user_id<>p_user_id or existing.payload_hash<>p_payload_hash then return 'conflict'; end if;
  return existing.status;
 end if;
 if not exists(select 1 from public.hub_gmail_connections where user_id=p_user_id) then return 'not_connected'; end if;
 if (select count(*) from public.hub_gmail_sends where user_id=p_user_id and created_at>now()-interval '1 hour')>=30 then return 'rate_limit'; end if;
 insert into public.hub_gmail_sends(request_id,user_id,payload_hash,status) values(p_request_id,p_user_id,p_payload_hash,'pending');
 return 'claimed';
end $$;
revoke all on function public.hub_claim_gmail_send(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.hub_claim_gmail_send(uuid,uuid,text) to service_role;
commit;
