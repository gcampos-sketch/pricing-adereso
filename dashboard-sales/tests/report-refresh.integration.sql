-- Run against the additive migration. All synthetic rows are rolled back.
begin;

do $test$
declare claim jsonb; token uuid; committed boolean; old_payload jsonb;
begin
claim := public.report_claim_refresh('report-v2/test-transfer',false);
token := (claim->>'token')::uuid;
if token is null then raise exception 'first claim missing'; end if;
if not (public.report_claim_refresh('report-v2/test-transfer',false)->>'busy')::boolean then raise exception 'duplicate claim'; end if;
perform public.report_release_refresh('report-v2/test-transfer',gen_random_uuid());
if not (public.report_claim_refresh('report-v2/test-transfer',false)->>'busy')::boolean then raise exception 'wrong release'; end if;
committed := public.report_finish_refresh('report-v2/test-transfer',gen_random_uuid(),repeat('a',64),'{"version":"report-storage/v1","gzip":"test"}',1,1000,100);
if committed then raise exception 'wrong token committed'; end if;
committed := public.report_finish_refresh('report-v2/test-transfer',token,repeat('a',64),'{"version":"report-storage/v1","gzip":"test"}',1,1000,100);
if not committed then raise exception 'first commit failed'; end if;
if public.report_claim_refresh('report-v2/test-transfer',false) ? 'token' then raise exception 'automatic rebuilt recent'; end if;
update public.report_refresh_state set checked_at=clock_timestamp()-interval '6 seconds' where key='report-v2/test-transfer';
if public.report_claim_refresh('report-v2/test-transfer',false) ? 'token' then raise exception 'automatic interval failed'; end if;
claim := public.report_claim_refresh('report-v2/test-transfer',true);
token := (claim->>'token')::uuid;
if token is null then raise exception 'manual unavailable'; end if;
select payload into old_payload from public.report_cache where key='report-v2/test-transfer';
committed := public.report_finish_refresh('report-v2/test-transfer',token,repeat('a',64),null,2,1000,0);
if not committed then raise exception 'unchanged failed'; end if;
if (select payload from public.report_cache where key='report-v2/test-transfer') is distinct from old_payload then raise exception 'payload replaced'; end if;
if not exists(select 1 from public.report_refresh_state where key='report-v2/test-transfer' and builds=2 and payload_writes=1 and unchanged_checks=1 and sent_bytes=100) then raise exception 'metrics wrong'; end if;
update public.report_refresh_state set checked_at=null where key='report-v2/test-transfer';
claim := public.report_claim_refresh('report-v2/test-transfer',false);
token := (claim->>'token')::uuid;
update public.report_refresh_state set lease_until=clock_timestamp()-interval '1 second' where key='report-v2/test-transfer';
if public.report_finish_refresh('report-v2/test-transfer',token,repeat('b',64),'{"version":"report-storage/v1","gzip":"replacement"}',1,1000,100) then raise exception 'expired committed'; end if;
if has_table_privilege('authenticated','public.report_refresh_state','select') or has_function_privilege('anon','public.report_claim_refresh(text,boolean)','execute') then raise exception 'client access'; end if;
end $test$;

rollback;
