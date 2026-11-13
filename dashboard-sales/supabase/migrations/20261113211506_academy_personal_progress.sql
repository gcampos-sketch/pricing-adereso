-- Personal practice evidence, never a permission or commercial certification.
create table public.academy_personal_progress (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision integer not null default 1 check (revision>0),
 updated_at timestamptz not null default now(),
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=120000)
);
alter table public.academy_personal_progress enable row level security;
revoke all on public.academy_personal_progress from public,anon,authenticated;
grant select,insert,update on public.academy_personal_progress to service_role;

-- One atomic statement handles new and existing rows; stale writers never replace newer progress.
create function public.academy_save_personal_progress(p_user_id uuid,p_revision integer,p_payload jsonb)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare saved integer;
begin
 if p_revision<0 then return null; end if;
 if p_revision=0 then
  insert into public.academy_personal_progress(user_id,payload) values(p_user_id,p_payload)
  on conflict(user_id) do nothing returning revision into saved;
 else
  update public.academy_personal_progress set revision=revision+1,payload=p_payload,updated_at=now()
  where user_id=p_user_id and revision=p_revision returning revision into saved;
 end if;
 return saved;
end $$;
revoke all on function public.academy_save_personal_progress(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.academy_save_personal_progress(uuid,integer,jsonb) to service_role;
