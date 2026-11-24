-- Isolated synthetic DB only. Requires installed proposal and superuser session.
-- No psql meta-commands. Run sequentially, never alongside another backend.
-- All fixtures, role alterations and temporary grants roll back at the end.
BEGIN;

DO $$
DECLARE result jsonb; k text;
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'Test needs isolated database owner/superuser'; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') AND rolsuper) THEN RAISE EXCEPTION 'Fixture roles must not be superusers'; END IF;
  result := public.acquisition_ingest_events('[{"eventKey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","event":{"portalId":"1","appId":"2","eventId":"90001","subscriptionId":"900","occurredAt":1700000000000,"type":"contact.propertyChange","contactId":"90001","value":"Inbound"}}]'::jsonb);
  k := result->'eventKeys'->>0;
  INSERT INTO acquisition_private.snapshot_attestations(attestation_id,portal_id,deal_id,contact_id,as_of,pipeline_id,coverage_start,coverage_end,coverage_complete,identity_at_creation_proven,acquisition_value,result_kind,source_reference,rule_version,evidence_event_keys)
  VALUES
  ('00000000-0000-0000-0000-000000090001',1,'90001','90001',to_timestamp(1700000001),'3',to_timestamp(1700000000),to_timestamp(1700000002),true,true,'Inbound','observed','role-test','v1',ARRAY[k]),
  ('00000000-0000-0000-0000-000000090002',1,'90002','90001',to_timestamp(1700000001),'3',to_timestamp(1700000000),to_timestamp(1700000002),false,true,'Inbound','observed','role-test','v1',ARRAY[k]),
  ('00000000-0000-0000-0000-000000090003',1,'90003','90001',to_timestamp(1700000001),'3',to_timestamp(1700000000),to_timestamp(1700000002),true,false,'Inbound','observed','role-test','v1',ARRAY[k]),
  ('00000000-0000-0000-0000-000000090004',1,'90004','90001',to_timestamp(1700000001),'3',to_timestamp(1700000000),to_timestamp(1700000002),true,true,'Inbound','observed','role-test','v1',ARRAY[repeat('f',64)]),
  ('00000000-0000-0000-0000-000000090005',1,'90005','90001',to_timestamp(1700000001),'3',to_timestamp(1700000000),to_timestamp(1700000002),true,true,NULL,'unknown','role-test','v1',ARRAY[k]),
  ('00000000-0000-0000-0000-000000090006',1,'90001','90001',to_timestamp(1700000001),'3',to_timestamp(1700000000),to_timestamp(1700000002),true,true,'Outbound','observed','role-test','v1',ARRAY[k]);
END;
$$;

ALTER ROLE service_role NOBYPASSRLS;
SET LOCAL ROLE service_role;
DO $$
DECLARE cmd text; result jsonb; e jsonb; before_count bigint; x text;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'SET ROLE not effective'; END IF;
  IF NOT row_security_active('acquisition_private.webhook_events'::regclass) OR NOT row_security_active('acquisition_private.deal_snapshots'::regclass) THEN RAISE EXCEPTION 'Expected RLS active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM acquisition_private.webhook_events WHERE event->>'eventId'='90001') THEN RAISE EXCEPTION 'RLS service select blocked'; END IF;
  e := '{"eventKey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","event":{"portalId":"1","appId":"2","eventId":"90002","subscriptionId":"900","occurredAt":1700000000000,"type":"contact.propertyChange","contactId":"90001","value":"Inbound"}}'::jsonb;
  result := public.acquisition_ingest_events(jsonb_build_array(e));
  IF result->>'inserted' <> '1' THEN RAISE EXCEPTION 'RLS service insert failed'; END IF;
  result := public.acquisition_ingest_events(jsonb_build_array(e));
  IF result->>'duplicates' <> '1' THEN RAISE EXCEPTION 'Service retry not deduplicated'; END IF;
  BEGIN
    PERFORM public.acquisition_ingest_events(jsonb_build_array(jsonb_set(e,'{event,value}','"Outbound"')));
    RAISE EXCEPTION 'Conflict did not fail';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  SELECT count(*) INTO before_count FROM acquisition_private.webhook_events;
  BEGIN
    PERFORM public.acquisition_ingest_events(jsonb_build_array(jsonb_set(e,'{event,eventId}','"90003"'), jsonb_set(e,'{event,portalId}','"999"')));
    RAISE EXCEPTION 'Mixed invalid batch did not fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT count(*) FROM acquisition_private.webhook_events) <> before_count THEN RAISE EXCEPTION 'Service batch was not atomic'; END IF;
  FOREACH cmd IN ARRAY ARRAY[
    'UPDATE acquisition_private.webhook_events SET event=event',
    'DELETE FROM acquisition_private.webhook_events',
    'UPDATE acquisition_private.deal_snapshots SET rule_version=rule_version',
    'DELETE FROM acquisition_private.deal_snapshots',
    'INSERT INTO acquisition_private.snapshot_attestations SELECT * FROM acquisition_private.snapshot_attestations',
    'UPDATE acquisition_private.snapshot_attestations SET coverage_complete=true',
    'DELETE FROM acquisition_private.snapshot_attestations'
  ] LOOP
    BEGIN EXECUTE cmd; RAISE EXCEPTION 'Unexpected permission: %',cmd;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  FOREACH x IN ARRAY ARRAY['00000000-0000-0000-0000-000000099999','00000000-0000-0000-0000-000000090002','00000000-0000-0000-0000-000000090003','00000000-0000-0000-0000-000000090004'] LOOP
    IF public.acquisition_freeze_attested_snapshot(x::uuid)->>'status' <> 'pending_evidence' THEN RAISE EXCEPTION 'Missing attestation/coverage/identity/evidence accepted'; END IF;
  END LOOP;
  IF public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000090001')->>'status' <> 'frozen' THEN RAISE EXCEPTION 'Service freeze failed'; END IF;
  IF public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000090001')->>'status' <> 'already_frozen' THEN RAISE EXCEPTION 'Freeze retry failed'; END IF;
  IF public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000090006')->>'status' <> 'frozen_conflict' THEN RAISE EXCEPTION 'Frozen snapshot overwritten'; END IF;
  IF public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000090005')->>'status' <> 'frozen' THEN RAISE EXCEPTION 'Unknown freeze failed'; END IF;
  IF (SELECT acquisition_value FROM acquisition_private.deal_snapshots WHERE deal_id='90005') IS NOT NULL THEN RAISE EXCEPTION 'Unknown converted to outbound'; END IF;
  BEGIN
    INSERT INTO acquisition_private.deal_snapshots(portal_id,deal_id,attestation_id,contact_id,as_of,acquisition_value,result_kind,rule_version)
    VALUES(1,'99999','00000000-0000-0000-0000-000000090001','90001',to_timestamp(1700000001),'Outbound','observed','v1');
    RAISE EXCEPTION 'Direct insert bypassed attestation';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS service_role NOBYPASSRLS: actual role, RLS, ingest/dedup/conflict/atomicity, grants, evidence gates, freeze and direct insert guard';
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
DECLARE t text; cmd text;
BEGIN
  IF current_user <> 'anon' THEN RAISE EXCEPTION 'anon role not active'; END IF;
  FOREACH t IN ARRAY ARRAY['webhook_events','snapshot_attestations','deal_snapshots'] LOOP
    FOREACH cmd IN ARRAY ARRAY['SELECT * FROM acquisition_private.'||t,'INSERT INTO acquisition_private.'||t||' DEFAULT VALUES','UPDATE acquisition_private.'||t||' SET portal_id=portal_id','DELETE FROM acquisition_private.'||t] LOOP
      BEGIN EXECUTE cmd; RAISE EXCEPTION 'anon unexpected permission'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END LOOP;
  END LOOP;
  BEGIN PERFORM public.acquisition_ingest_events('[]'); RAISE EXCEPTION 'anon RPC access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000090001'); RAISE EXCEPTION 'anon freeze RPC access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS anon: actual role, all table CRUD and both RPCs denied';
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
DECLARE t text; cmd text;
BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'authenticated role not active'; END IF;
  FOREACH t IN ARRAY ARRAY['webhook_events','snapshot_attestations','deal_snapshots'] LOOP
    FOREACH cmd IN ARRAY ARRAY['SELECT * FROM acquisition_private.'||t,'INSERT INTO acquisition_private.'||t||' DEFAULT VALUES','UPDATE acquisition_private.'||t||' SET portal_id=portal_id','DELETE FROM acquisition_private.'||t] LOOP
      BEGIN EXECUTE cmd; RAISE EXCEPTION 'authenticated unexpected permission'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END LOOP;
  END LOOP;
  BEGIN PERFORM public.acquisition_ingest_events('[]'); RAISE EXCEPTION 'authenticated RPC access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000090001'); RAISE EXCEPTION 'authenticated freeze RPC access'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS authenticated: actual role, all table CRUD and both RPCs denied';
END;
$$;
RESET ROLE;

-- Test RLS separately from ACLs: accidentally granting a browser read/insert still
-- does not create a row policy. The grants below are rolled back and never live.
GRANT USAGE ON SCHEMA acquisition_private TO anon;
GRANT SELECT, INSERT ON acquisition_private.webhook_events TO anon;
SET LOCAL ROLE anon;
DO $$
DECLARE n bigint;
BEGIN
  IF current_user <> 'anon' OR NOT row_security_active('acquisition_private.webhook_events'::regclass) THEN RAISE EXCEPTION 'Expected anon RLS'; END IF;
  SELECT count(*) INTO n FROM acquisition_private.webhook_events;
  IF n <> 0 THEN RAISE EXCEPTION 'RLS exposed evidence'; END IF;
  BEGIN
    INSERT INTO acquisition_private.webhook_events(portal_id,app_id,event_key,content_hash,occurred_at,event) VALUES(1,2,repeat('c',64),repeat('d',64),now(),'{}');
    RAISE EXCEPTION 'RLS allowed anon insert';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS anon accidental-grant simulation: RLS hides rows and rejects inserts';
END;
$$;
RESET ROLE;
REVOKE SELECT, INSERT ON acquisition_private.webhook_events FROM anon;
REVOKE USAGE ON SCHEMA acquisition_private FROM anon;

-- Match hosted Supabase service_role BYPASSRLS while remaining NOSUPERUSER.
ALTER ROLE service_role BYPASSRLS;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF current_user <> 'service_role' OR row_security_active('acquisition_private.webhook_events'::regclass) THEN RAISE EXCEPTION 'Expected service BYPASSRLS state'; END IF;
  IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'Must not test as superuser'; END IF;
  BEGIN UPDATE acquisition_private.deal_snapshots SET rule_version='bad'; RAISE EXCEPTION 'BYPASSRLS bypassed ACL'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO acquisition_private.snapshot_attestations SELECT * FROM acquisition_private.snapshot_attestations; RAISE EXCEPTION 'BYPASSRLS can self-attest'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO acquisition_private.deal_snapshots(portal_id,deal_id,attestation_id,contact_id,as_of,acquisition_value,result_kind,rule_version)
    VALUES(1,'99999','00000000-0000-0000-0000-000000090001','90001',to_timestamp(1700000001),'Outbound','observed','v1');
    RAISE EXCEPTION 'BYPASSRLS skipped attestation trigger';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000090002')->>'status' <> 'pending_evidence' THEN RAISE EXCEPTION 'BYPASSRLS skipped coverage gate'; END IF;
  RAISE NOTICE 'PASS service_role BYPASSRLS: ACLs, no self-attestation, insert trigger and coverage gate remain effective';
END;
$$;
RESET ROLE;

-- Even accidental future UPDATE/DELETE grants cannot overwrite immutable rows.
GRANT UPDATE, DELETE ON acquisition_private.webhook_events, acquisition_private.snapshot_attestations, acquisition_private.deal_snapshots TO service_role;
SET LOCAL ROLE service_role;
DO $$
DECLARE t text; cmd text;
BEGIN
  FOREACH t IN ARRAY ARRAY['webhook_events','snapshot_attestations','deal_snapshots'] LOOP
    FOREACH cmd IN ARRAY ARRAY['UPDATE acquisition_private.'||t||' SET portal_id=portal_id','DELETE FROM acquisition_private.'||t] LOOP
      BEGIN EXECUTE cmd; RAISE EXCEPTION 'Mutation trigger ineffective'; EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS BYPASSRLS plus accidental mutation grants: all append-only triggers reject UPDATE/DELETE';
END;
$$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS role-tests completed; fixtures, grants and role alterations rolled back' AS result;
