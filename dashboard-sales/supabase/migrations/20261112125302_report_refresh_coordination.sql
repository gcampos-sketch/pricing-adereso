-- Additive, server-only coordination. Existing report keys and immutable diagnostic editions remain untouched.
create table public.report_refresh_state (
  key text primary key,
  lease_id uuid,
  lease_until timestamptz,
  checked_at timestamptz,
  content_hash text,
  builds bigint not null default 0,
  payload_writes bigint not null default 0,
  unchanged_checks bigint not null default 0,
  raw_bytes bigint not null default 0,
  sent_bytes bigint not null default 0
);
alter table public.report_refresh_state enable row level security;
revoke all on public.report_refresh_state from public, anon, authenticated;
grant all on public.report_refresh_state to service_role;

create function public.report_claim_refresh(p_key text, p_force boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare s report_refresh_state; token uuid;
begin
  if p_key !~ '^report-v2/(pulse(-ae|-kam)?|partner|team|insights|coaching|test-[a-z0-9-]+)$' then raise exception 'invalid report key'; end if;
  insert into report_refresh_state(key) values(p_key) on conflict do nothing;
  select * into s from report_refresh_state where key=p_key for update;
  if s.lease_until > clock_timestamp() then
    return jsonb_build_object('busy',true,'checkedAt',s.checked_at,'hash',s.content_hash);
  end if;
  -- Automatic refresh remains at most one minute old; manual refresh coalesces only within 5 seconds.
  if s.checked_at > clock_timestamp() - (case when p_force then interval '5 seconds' else interval '60 seconds' end)
     and exists(select 1 from report_cache where key=p_key) then
    return jsonb_build_object('busy',false,'checkedAt',s.checked_at,'hash',s.content_hash);
  end if;
  token := gen_random_uuid();
  update report_refresh_state set lease_id=token,lease_until=clock_timestamp()+interval '10 minutes' where key=p_key;
  return jsonb_build_object('token',token,'busy',false,'checkedAt',s.checked_at,'hash',s.content_hash);
end $$;

create function public.report_finish_refresh(p_key text,p_token uuid,p_hash text,p_payload jsonb,p_build_ms integer,p_raw_bytes bigint,p_sent_bytes bigint)
returns boolean language plpgsql security invoker set search_path=public as $$
declare s report_refresh_state; checked timestamptz := clock_timestamp(); same boolean;
begin
  select * into s from report_refresh_state where key=p_key for update;
  if not found or s.lease_id is distinct from p_token or s.lease_until<=checked then return false; end if;
  if p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid hash'; end if;
  same := s.content_hash=p_hash and exists(select 1 from report_cache where key=p_key);
  if same then
    -- No JSON payload is transmitted or rewritten for an unchanged report.
    update report_cache set generated_at=checked,build_ms=greatest(p_build_ms,0) where key=p_key;
  else
    if p_payload is null or p_payload->>'version' is distinct from 'report-storage/v1' or jsonb_typeof(p_payload->'gzip') is distinct from 'string' then raise exception 'missing report payload'; end if;
    insert into report_cache(key,payload,build_ms,generated_at) values(p_key,p_payload,greatest(p_build_ms,0),checked)
      on conflict(key) do update set payload=excluded.payload,build_ms=excluded.build_ms,generated_at=excluded.generated_at;
  end if;
  update report_refresh_state set lease_id=null,lease_until=null,checked_at=checked,content_hash=p_hash,
    builds=builds+1,payload_writes=payload_writes+case when same then 0 else 1 end,
    unchanged_checks=unchanged_checks+case when same then 1 else 0 end,
    raw_bytes=raw_bytes+greatest(p_raw_bytes,0),sent_bytes=sent_bytes+greatest(p_sent_bytes,0) where key=p_key;
  return true;
end $$;

create function public.report_release_refresh(p_key text,p_token uuid)
returns void language sql security invoker set search_path=public as $$
  update report_refresh_state set lease_id=null,lease_until=null where key=p_key and lease_id=p_token;
$$;
revoke all on function public.report_claim_refresh(text,boolean), public.report_finish_refresh(text,uuid,text,jsonb,integer,bigint,bigint), public.report_release_refresh(text,uuid) from public,anon,authenticated;
grant execute on function public.report_claim_refresh(text,boolean), public.report_finish_refresh(text,uuid,text,jsonb,integer,bigint,bigint), public.report_release_refresh(text,uuid) to service_role;
