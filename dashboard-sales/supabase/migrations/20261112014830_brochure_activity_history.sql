begin;
create index hub_brochure_owner_deal on public.hub_brochure_shares(user_id,deal_id,created_at desc);
-- Summaries use the full owned history. Pagination limits delivery, never the totals.
create function public.hub_brochure_deal_activity(p_user_id uuid,p_query text default '',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
with owned as materialized (
 select * from public.hub_brochure_shares where user_id=p_user_id
), grouped as (
 select s.deal_id,(array_agg(s.deal_name order by s.created_at desc,s.id desc))[1] as deal_name,
 count(*) as links,max(s.created_at) as created_at,
 (select max(e.created_at) from public.hub_brochure_events e join owned o on o.id=e.share_id where o.deal_id=s.deal_id) as last_at
 from owned s group by s.deal_id
), filtered as (
 select * from grouped where position(lower(coalesce(p_query,'')) in lower(deal_name||' '||deal_id))>0
), page as (
 select * from filtered order by coalesce(last_at,created_at) desc,deal_id limit 25 offset greatest(p_offset,0)
), summaries as (
 select d.*,jsonb_build_object('dealId',d.deal_id,'dealName',d.deal_name,'links',d.links,'lastAt',d.last_at,
 'sessions',coalesce(a.sessions,0),'clicks',coalesce(a.clicks,0),'seconds',coalesce(a.seconds,0),'maxProgress',coalesce(a.progress,0),
 'sections',(select coalesce(jsonb_agg(x order by x.seconds desc,x.section),'[]'::jsonb) from (
 select e.section,sum(e.seconds) as seconds,count(distinct(e.share_id,e.session_id)) as sessions
 from public.hub_brochure_events e join owned o on o.id=e.share_id
 where o.deal_id=d.deal_id and e.kind='section' group by e.section
 )x)) as summary
 from page d left join lateral (
 select count(distinct(e.share_id,e.session_id)) as sessions,
 count(*) filter(where e.kind='interaction') as clicks,sum(e.seconds) as seconds,max(e.progress) as progress
 from public.hub_brochure_events e join owned o on o.id=e.share_id where o.deal_id=d.deal_id
 )a on true
)
select jsonb_build_object('deals',(select coalesce(jsonb_agg(summary order by coalesce(last_at,created_at) desc,deal_id),'[]'::jsonb) from summaries),
 'total',(select count(*) from filtered),'nextOffset',case when greatest(p_offset,0)+25<(select count(*) from filtered) then greatest(p_offset,0)+25 else null end);
$$;
create function public.hub_brochure_deal_visits(p_user_id uuid,p_deal_id text,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
with sessions as materialized (
 select e.share_id,e.session_id,min(e.created_at) as started_at,max(e.created_at) as last_at,
 max(e.progress) as progress,sum(e.seconds) as seconds
 from public.hub_brochure_events e join public.hub_brochure_shares s on s.id=e.share_id
 where s.user_id=p_user_id and s.deal_id=p_deal_id group by e.share_id,e.session_id
), page as (
 select * from sessions order by started_at desc,share_id,session_id limit 20 offset greatest(p_offset,0)
)
select jsonb_build_object('visits',(select coalesce(jsonb_agg(jsonb_build_object('sessionId',p.session_id,'startedAt',p.started_at,'lastAt',p.last_at,'seconds',p.seconds,'progress',p.progress,
 'events',(select jsonb_agg(jsonb_build_object('kind',e.kind,'section',e.section,'interaction',e.interaction,'seconds',e.seconds,'at',e.created_at) order by e.sequence) from public.hub_brochure_events e where e.share_id=p.share_id and e.session_id=p.session_id)
 ) order by p.started_at desc,p.share_id,p.session_id),'[]'::jsonb) from page p),
 'total',(select count(*) from sessions),'nextOffset',case when greatest(p_offset,0)+20<(select count(*) from sessions) then greatest(p_offset,0)+20 else null end);
$$;
revoke all on function public.hub_brochure_deal_activity(uuid,text,integer),public.hub_brochure_deal_visits(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.hub_brochure_deal_activity(uuid,text,integer),public.hub_brochure_deal_visits(uuid,text,integer) to service_role;
commit;
