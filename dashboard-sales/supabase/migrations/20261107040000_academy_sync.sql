-- Internal learning material is server-only, including Notion content and webhook state.
create table public.academy_source_state (
  source text primary key check (source in ('notion','help')),
  requested_at timestamptz not null default now(), pending boolean not null default true,
  lease_id uuid, lease_until timestamptz, claimed_request_at timestamptz,
  version text, checked_at timestamptz, published_at timestamptz, error_code text
);
create table public.academy_source_versions (
  source text not null references public.academy_source_state(source),
  version text not null, payload jsonb not null, created_at timestamptz not null default now(),
  primary key(source,version),
  check(jsonb_typeof(payload->'documents')='array'),
  check(octet_length(payload::text)<20000000)
);
insert into public.academy_source_state(source) values ('notion'),('help');
alter table public.academy_source_state enable row level security;
alter table public.academy_source_versions enable row level security;
revoke all on public.academy_source_state,public.academy_source_versions from public,anon,authenticated;
grant all on public.academy_source_state,public.academy_source_versions to service_role;
create table public.academy_webhook_setup (
  id boolean primary key default true check(id),
  encrypted_candidate text not null,
  created_at timestamptz not null default now()
);
alter table public.academy_webhook_setup enable row level security;
revoke all on public.academy_webhook_setup from public,anon,authenticated;
grant all on public.academy_webhook_setup to service_role;

-- A durable dirty bit coalesces webhook retries without an unbounded event table.
create function public.academy_request_sync(p_source text) returns void language sql security invoker set search_path=public as $$
  update academy_source_state set pending=true,requested_at=clock_timestamp() where source=p_source;
$$;
create function public.academy_claim_sync(p_source text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare s academy_source_state;
begin
  update academy_source_state set lease_id=gen_random_uuid(),lease_until=now()+interval '8 minutes',claimed_request_at=requested_at
  where source=p_source and (lease_until is null or lease_until<now())
    and (pending or checked_at is null or checked_at<now()-interval '15 minutes') returning * into s;
  if not found then return null; end if;
  return jsonb_build_object('lease',s.lease_id,'version',s.version);
end $$;
create function public.academy_finish_sync(p_source text,p_lease uuid,p_version text,p_payload jsonb,p_error text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare s academy_source_state;
begin
  select * into s from academy_source_state where source=p_source for update;
  -- Fence out an expired/replaced worker, including its failure cleanup.
  if s.lease_id is distinct from p_lease or s.lease_until<=now() then return false; end if;
  if p_error is null then
    if p_payload->>'schema'<>'academy-sources/v1' or p_payload->>'source'<>p_source
      or jsonb_array_length(p_payload->'documents')<1 or p_version !~ '^[a-f0-9]{64}$' then raise exception 'invalid academy snapshot'; end if;
    insert into academy_source_versions(source,version,payload) values(p_source,p_version,p_payload)
      on conflict(source,version) do update set payload=excluded.payload;
    update academy_source_state set version=p_version,
      published_at=case when version is distinct from p_version then now() else published_at end,
      pending=requested_at>claimed_request_at,error_code=null,checked_at=now(),lease_id=null,lease_until=null where source=p_source;
    delete from academy_source_versions where source=p_source and version not in
      (select version from academy_source_versions where source=p_source and version<>p_version order by created_at desc limit 4)
      and version<>p_version;
  else
    update academy_source_state set error_code=left(p_error,80),checked_at=now(),pending=true,lease_id=null,lease_until=null where source=p_source;
  end if;
  return true;
end $$;
revoke all on function public.academy_request_sync(text),public.academy_claim_sync(text),public.academy_finish_sync(text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_request_sync(text),public.academy_claim_sync(text),public.academy_finish_sync(text,uuid,text,jsonb,text) to service_role;
