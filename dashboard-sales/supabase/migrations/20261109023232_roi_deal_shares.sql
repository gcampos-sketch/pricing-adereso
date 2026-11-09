begin;
create table public.hub_roi_shares (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 payload_hash text not null,
 deal_id text not null check (deal_id ~ '^[0-9]{1,20}$'),
 deal_name text not null,
 token text not null unique check (token ~ '^[a-f0-9]{64}$'),
 context jsonb not null check (jsonb_typeof(context) = 'object'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '180 days',
 unique(user_id, request_id)
);
create index hub_roi_shares_owner_time on public.hub_roi_shares(user_id,created_at desc);
create table public.hub_roi_events (
 share_id uuid not null references public.hub_roi_shares(id) on delete cascade,
 session_id uuid not null,
 sequence integer not null check (sequence between 0 and 500),
 kind text not null check (kind in ('open','scenario')),
 scenario jsonb,
 created_at timestamptz not null default now(),
 primary key(share_id,session_id,sequence),
 check ((kind = 'open' and sequence = 0 and scenario is null) or
        (kind = 'scenario' and sequence > 0 and jsonb_typeof(scenario) = 'object'))
);
create index hub_roi_events_time on public.hub_roi_events(share_id,created_at desc);
alter table public.hub_roi_shares enable row level security;
alter table public.hub_roi_events enable row level security;
revoke all on public.hub_roi_shares, public.hub_roi_events from public,anon,authenticated;
grant all on public.hub_roi_shares, public.hub_roi_events to service_role;

-- Invoker functions are executable only by the server role. Never grant a
-- browser token direct access to either CRM associations or activity data.
create function public.hub_create_roi_share(p_user_id uuid,p_request_id uuid,p_payload_hash text,p_deal_id text,p_deal_name text,p_token text,p_context jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.hub_roi_shares%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,2));
 select * into existing from public.hub_roi_shares where user_id=p_user_id and request_id=p_request_id;
 if found then
  if existing.payload_hash<>p_payload_hash then return jsonb_build_object('error','conflict'); end if;
  return jsonb_build_object('id',existing.id,'token',existing.token,'expires_at',existing.expires_at);
 end if;
 if (select count(*) from public.hub_roi_shares where user_id=p_user_id and created_at>now()-interval '1 hour')>=30 then return jsonb_build_object('error','rate_limit'); end if;
 insert into public.hub_roi_shares(user_id,request_id,payload_hash,deal_id,deal_name,token,context)
 values(p_user_id,p_request_id,p_payload_hash,p_deal_id,p_deal_name,p_token,p_context) returning * into existing;
 return jsonb_build_object('id',existing.id,'token',existing.token,'expires_at',existing.expires_at);
end $$;

create function public.hub_record_roi_event(p_token text,p_session_id uuid,p_sequence integer,p_kind text,p_scenario jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare target public.hub_roi_shares%rowtype;
begin
 select * into target from public.hub_roi_shares where token=p_token and expires_at>now() for update;
 if not found then return 'unavailable'; end if;
 if exists(select 1 from public.hub_roi_events where share_id=target.id and session_id=p_session_id and sequence=p_sequence) then return 'duplicate'; end if;
 if (select count(*) from public.hub_roi_events where share_id=target.id)>=10000 or
    (select count(*) from public.hub_roi_events where share_id=target.id and created_at>now()-interval '1 day')>=500 then return 'rate_limit'; end if;
 insert into public.hub_roi_events(share_id,session_id,sequence,kind,scenario)
 values(target.id,p_session_id,p_sequence,p_kind,p_scenario);
 return 'recorded';
end $$;

create function public.hub_roi_share_activity(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(summary order by created_at desc),'[]'::jsonb) from (
  select s.created_at, jsonb_build_object(
   'id',s.id,'dealId',s.deal_id,'dealName',s.deal_name,'createdAt',s.created_at,'expiresAt',s.expires_at,
   'sessions',(select count(distinct e.session_id) from public.hub_roi_events e where e.share_id=s.id),
   'scenarios',(select count(*) from public.hub_roi_events e where e.share_id=s.id and e.kind='scenario'),
   'lastAt',(select max(e.created_at) from public.hub_roi_events e where e.share_id=s.id),
   'lastScenario',(select e.scenario from public.hub_roi_events e where e.share_id=s.id and e.kind='scenario' order by e.created_at desc,e.sequence desc limit 1)
  ) as summary from (select * from public.hub_roi_shares where user_id=p_user_id order by created_at desc limit 50) s
 ) t;
$$;
revoke all on function public.hub_create_roi_share(uuid,uuid,text,text,text,text,jsonb), public.hub_record_roi_event(text,uuid,integer,text,jsonb), public.hub_roi_share_activity(uuid) from public,anon,authenticated;
grant execute on function public.hub_create_roi_share(uuid,uuid,text,text,text,text,jsonb), public.hub_record_roi_event(text,uuid,integer,text,jsonb), public.hub_roi_share_activity(uuid) to service_role;
commit;
