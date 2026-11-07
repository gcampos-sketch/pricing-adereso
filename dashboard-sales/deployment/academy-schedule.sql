-- Run as the project database administrator after the Academy migration.
-- Create the Vault secret named academy-sync-secret out of band first.
-- Its value must equal Render's ACADEMY_SYNC_SECRET. Never put its value here.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.academy_dispatch_sync() returns bigint
language plpgsql security invoker set search_path=public,pg_temp as $$
declare sync_secret text;
begin
  select decrypted_secret into strict sync_secret
    from vault.decrypted_secrets where name='academy-sync-secret';
  if length(sync_secret)<32 then raise exception 'academy sync secret not configured'; end if;
  -- The caller cannot select a host, path, headers or body. A key rotation in
  -- Vault is picked up by the next run without exposing the key in cron.job.
  return net.http_post(
    url:='https://adereso-hub-comercial.onrender.com/api/academy/sync',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||sync_secret),
    body:='{}'::jsonb,
    timeout_milliseconds:=420000
  );
end $$;
revoke all on function public.academy_dispatch_sync() from public,anon,authenticated,service_role;

do $$
begin
  if not exists(select 1 from public.academy_source_state where source='help') then
    raise exception 'Install the Academy migration first';
  end if;
  if (select count(*) from vault.decrypted_secrets where name='academy-sync-secret' and length(decrypted_secret)>=32)<>1 then
    raise exception 'Configure exactly one academy-sync-secret in Vault before scheduling';
  end if;
end $$;

-- A named job is updated rather than duplicated when this installer is rerun.
select cron.schedule('adereso-academy-sync','*/5 * * * *','select public.academy_dispatch_sync();');
commit;
