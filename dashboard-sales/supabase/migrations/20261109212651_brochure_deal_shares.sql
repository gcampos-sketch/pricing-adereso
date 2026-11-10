begin;
create table public.hub_brochure_shares (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,payload_hash text not null,deal_id text not null check(deal_id ~ '^[0-9]{1,20}$'),deal_name text not null,
 token text not null unique check(token ~ '^[a-f0-9]{64}$'),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '180 days',unique(user_id,request_id)
);
create index hub_brochure_owner_time on public.hub_brochure_shares(user_id,created_at desc);
create table public.hub_brochure_events (
 share_id uuid not null references public.hub_brochure_shares(id) on delete cascade,session_id uuid not null,
 sequence integer not null check(sequence between 0 and 500),kind text not null check(kind in('open','section','interaction')),
 section text check(section in('intro','credentials','platform','usecases','operation','impact','closing')),
 progress integer not null check(progress between 0 and 100),seconds integer not null check(seconds between 0 and 60),
 interaction text check(interaction in('route-0','route-1','route-2','route-3','route-4','stage-0','stage-1','stage-2','stage-3','stage-4','case-0','case-1','case-2','mission-0','mission-1','mission-2','delivery-0','delivery-1','delivery-2','delivery-3','delivery-4','scene-0-0','scene-0-1','scene-0-2','scene-0-3','scene-0-4','scene-1-0','scene-1-1','scene-1-2','scene-1-3','scene-1-4','scene-2-0','scene-2-1','scene-2-2','scene-2-3','scene-2-4')),
 created_at timestamptz not null default now(),primary key(share_id,session_id,sequence),
 check((kind='open' and sequence=0 and section is null and interaction is null and seconds=0 and progress=0) or (kind='section' and sequence>0 and section is not null and interaction is null and seconds>=2) or (kind='interaction' and sequence>0 and section is not null and interaction is not null and seconds=0))
);
create index hub_brochure_events_time on public.hub_brochure_events(share_id,created_at desc);
alter table public.hub_brochure_shares enable row level security;
alter table public.hub_brochure_events enable row level security;
revoke all on public.hub_brochure_shares,public.hub_brochure_events from public,anon,authenticated;
grant all on public.hub_brochure_shares,public.hub_brochure_events to service_role;
create function public.hub_create_brochure_share(p_user_id uuid,p_request_id uuid,p_payload_hash text,p_deal_id text,p_deal_name text,p_token text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.hub_brochure_shares%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,12));
 select * into existing from public.hub_brochure_shares where user_id=p_user_id and request_id=p_request_id;
 if found then
 if existing.payload_hash<>p_payload_hash then return jsonb_build_object('error','conflict');end if;
 return jsonb_build_object('id',existing.id,'token',existing.token,'expires_at',existing.expires_at);
 end if;
 if(select count(*) from public.hub_brochure_shares where user_id=p_user_id and created_at>now()-interval '1 hour')>=30 then return jsonb_build_object('error','rate_limit');end if;
 insert into public.hub_brochure_shares(user_id,request_id,payload_hash,deal_id,deal_name,token) values(p_user_id,p_request_id,p_payload_hash,p_deal_id,p_deal_name,p_token) returning * into existing;
 return jsonb_build_object('id',existing.id,'token',existing.token,'expires_at',existing.expires_at);
end $$;
create function public.hub_record_brochure_event(p_token text,p_session_id uuid,p_sequence integer,p_kind text,p_section text,p_progress integer,p_seconds integer,p_interaction text)
returns text language plpgsql security invoker set search_path='' as $$
declare target public.hub_brochure_shares%rowtype;
begin
 select * into target from public.hub_brochure_shares where token=p_token and expires_at>now() for update;
 if not found then return 'unavailable';end if;
 if exists(select 1 from public.hub_brochure_events where share_id=target.id and session_id=p_session_id and sequence=p_sequence) then return 'duplicate';end if;
 if(select count(*) from public.hub_brochure_events where share_id=target.id)>=15000 or (select count(*) from public.hub_brochure_events where share_id=target.id and created_at>now()-interval '1 day')>=1000 then return 'rate_limit';end if;
 insert into public.hub_brochure_events(share_id,session_id,sequence,kind,section,progress,seconds,interaction) values(target.id,p_session_id,p_sequence,p_kind,p_section,p_progress,p_seconds,p_interaction);
 return 'recorded';
end $$;
create function public.hub_brochure_share_activity(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(summary order by created_at desc),'[]'::jsonb) from (
 select s.created_at,jsonb_build_object('id',s.id,'dealId',s.deal_id,'dealName',s.deal_name,'createdAt',s.created_at,'expiresAt',s.expires_at,
 'sessions',(select count(distinct e.session_id) from public.hub_brochure_events e where e.share_id=s.id and e.kind='open'),
 'maxProgress',(select coalesce(max(e.progress),0) from public.hub_brochure_events e where e.share_id=s.id),
 'seconds',(select coalesce(sum(e.seconds),0) from public.hub_brochure_events e where e.share_id=s.id),
 'lastAt',(select max(e.created_at) from public.hub_brochure_events e where e.share_id=s.id),
 'sections',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select e.section,sum(e.seconds) as seconds,count(distinct e.session_id) as sessions,max(e.progress) as progress from public.hub_brochure_events e where e.share_id=s.id and e.kind='section' group by e.section) x),
 'visits',(select coalesce(jsonb_agg(v order by v."startedAt" desc),'[]'::jsonb) from (select e.session_id as "sessionId",min(e.created_at) as "startedAt",max(e.created_at) as "lastAt",max(e.progress) as progress,sum(e.seconds) as seconds,jsonb_agg(jsonb_build_object('kind',e.kind,'section',e.section,'interaction',e.interaction,'seconds',e.seconds,'at',e.created_at) order by e.sequence) as events from public.hub_brochure_events e where e.share_id=s.id group by e.session_id order by min(e.created_at) desc limit 20) v)
 ) as summary from(select * from public.hub_brochure_shares where user_id=p_user_id order by created_at desc limit 50)s
 )t;
$$;
revoke all on function public.hub_create_brochure_share(uuid,uuid,text,text,text,text),public.hub_record_brochure_event(text,uuid,integer,text,text,integer,integer,text),public.hub_brochure_share_activity(uuid) from public,anon,authenticated;
grant execute on function public.hub_create_brochure_share(uuid,uuid,text,text,text,text),public.hub_record_brochure_event(text,uuid,integer,text,text,integer,integer,text),public.hub_brochure_share_activity(uuid) to service_role;
commit;
