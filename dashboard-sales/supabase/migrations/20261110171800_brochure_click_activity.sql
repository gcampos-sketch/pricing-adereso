begin;
alter table public.hub_brochure_events drop constraint hub_brochure_events_section_check;
alter table public.hub_brochure_events add constraint hub_brochure_events_section_check check(section in('intro','credentials','platform','usecases','operation','impact','closing','releases'));
alter table public.hub_brochure_events drop constraint hub_brochure_events_interaction_check;
alter table public.hub_brochure_events add constraint hub_brochure_events_interaction_check check(interaction in('route-0','route-1','route-2','route-3','route-4','stage-0','stage-1','stage-2','stage-3','stage-4','case-0','case-1','case-2','mission-0','mission-1','mission-2','delivery-0','delivery-1','delivery-2','delivery-3','delivery-4','scene-0-0','scene-0-1','scene-0-2','scene-0-3','scene-0-4','scene-1-0','scene-1-1','scene-1-2','scene-1-3','scene-1-4','scene-2-0','scene-2-1','scene-2-2','scene-2-3','scene-2-4','nav-intro','nav-credentials','nav-usecases','nav-platform','nav-closing','link-evidence','link-security','link-contact','proof-toggle','evidence-toggle','agents-toggle','delivery-next','release-open','release-close','release-detail','release-guide','download-pdf'));
create or replace function public.hub_brochure_share_activity(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(summary order by created_at desc),'[]'::jsonb) from (
 select s.created_at,jsonb_build_object('id',s.id,'dealId',s.deal_id,'dealName',s.deal_name,'createdAt',s.created_at,'expiresAt',s.expires_at,
 'clicks',(select count(*) from public.hub_brochure_events e where e.share_id=s.id and e.kind='interaction'),
 'sessions',(select count(distinct e.session_id) from public.hub_brochure_events e where e.share_id=s.id and e.kind='open'),
 'maxProgress',(select coalesce(max(e.progress),0) from public.hub_brochure_events e where e.share_id=s.id),
 'seconds',(select coalesce(sum(e.seconds),0) from public.hub_brochure_events e where e.share_id=s.id),
 'lastAt',(select max(e.created_at) from public.hub_brochure_events e where e.share_id=s.id),
 'sections',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select e.section,sum(e.seconds) as seconds,count(distinct e.session_id) as sessions,max(e.progress) as progress from public.hub_brochure_events e where e.share_id=s.id and e.kind='section' group by e.section) x),
 'visits',(select coalesce(jsonb_agg(v order by v."startedAt" desc),'[]'::jsonb) from (select e.session_id as "sessionId",min(e.created_at) as "startedAt",max(e.created_at) as "lastAt",max(e.progress) as progress,sum(e.seconds) as seconds,jsonb_agg(jsonb_build_object('kind',e.kind,'section',e.section,'interaction',e.interaction,'seconds',e.seconds,'at',e.created_at) order by e.sequence) as events from public.hub_brochure_events e where e.share_id=s.id group by e.session_id order by min(e.created_at) desc limit 20) v)
 ) as summary from(select * from public.hub_brochure_shares where user_id=p_user_id order by created_at desc limit 50)s
 )t;
$$;
commit;
