-- Passed in isolated PostgreSQL 17 CI; see VALIDATION.md. Not applied to production.
-- Run only after ledger-proposal.sql in an isolated disposable database.
-- Database owner required for fixture attestation; never run against production.
BEGIN;
DO $$
DECLARE e jsonb; r jsonb; k text; before_count bigint; kind text;
BEGIN
  e := jsonb_build_object('eventKey',repeat('a',64),'event',jsonb_build_object(
    'portalId','1','appId','2','eventId','123','subscriptionId','456',
    'occurredAt',1700000000000,'type','contact.propertyChange','contactId','789','value','Inbound'));
  r := public.acquisition_ingest_events(jsonb_build_array(e));
  IF (r->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'First insert failed'; END IF;
  k := r->'eventKeys'->>0;
  r := public.acquisition_ingest_events(jsonb_build_array(e));
  IF (r->>'duplicates')::int <> 1 THEN RAISE EXCEPTION 'Retry not deduplicated'; END IF;
  BEGIN
    PERFORM public.acquisition_ingest_events(jsonb_build_array(jsonb_set(e,'{event,value}','"Outbound"')));
    RAISE EXCEPTION 'Expected evidence conflict';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  SELECT count(*) INTO before_count FROM acquisition_private.webhook_events;
  BEGIN
    PERFORM public.acquisition_ingest_events(jsonb_build_array(
      jsonb_set(e,'{event,eventId}','"124"'),jsonb_set(e,'{event,portalId}','"999"')));
    RAISE EXCEPTION 'Expected atomic batch failure';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT count(*) FROM acquisition_private.webhook_events) <> before_count THEN RAISE EXCEPTION 'Partial batch committed'; END IF;
  IF public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000000001')->>'status' <> 'pending_evidence' THEN RAISE EXCEPTION 'Missing evidence accepted'; END IF;
  INSERT INTO acquisition_private.snapshot_attestations(
    attestation_id,portal_id,deal_id,contact_id,as_of,pipeline_id,coverage_start,coverage_end,
    coverage_complete,identity_at_creation_proven,acquisition_value,result_kind,source_reference,rule_version,evidence_event_keys)
  VALUES ('00000000-0000-0000-0000-000000000001',1,'100','789',to_timestamp(1700000001),'3',to_timestamp(1700000000),to_timestamp(1700000002),true,true,'Inbound','observed','synthetic-fixture','v1',ARRAY[k]);
  FOREACH kind IN ARRAY ARRAY['observed','renewal'] LOOP
    BEGIN
      INSERT INTO acquisition_private.snapshot_attestations(
        attestation_id,portal_id,deal_id,contact_id,as_of,pipeline_id,coverage_start,coverage_end,
        coverage_complete,identity_at_creation_proven,acquisition_value,result_kind,source_reference,rule_version,evidence_event_keys)
      VALUES ('00000000-0000-0000-0000-000000000002',1,'101','789',to_timestamp(1700000001),'3',to_timestamp(1700000000),to_timestamp(1700000002),true,true,NULL,kind,'synthetic-null-fixture','v1',ARRAY[k]);
      RAISE EXCEPTION 'Expected NULL classification rejection';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
  r := public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000000001');
  IF r->>'status' <> 'frozen' THEN RAISE EXCEPTION 'Freeze failed'; END IF;
  r := public.acquisition_freeze_attested_snapshot('00000000-0000-0000-0000-000000000001');
  IF r->>'status' <> 'already_frozen' THEN RAISE EXCEPTION 'Freeze retry failed'; END IF;
  BEGIN
    UPDATE acquisition_private.deal_snapshots SET acquisition_value='Outbound' WHERE deal_id='100';
    RAISE EXCEPTION 'Expected immutable snapshot';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    INSERT INTO acquisition_private.deal_snapshots(portal_id,deal_id,attestation_id,contact_id,as_of,acquisition_value,result_kind,rule_version)
    VALUES(1,'999','00000000-0000-0000-0000-000000000001','789',to_timestamp(1700000001),'Outbound','observed','v1');
    RAISE EXCEPTION 'Expected direct insert rejection';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF has_function_privilege('anon','public.acquisition_ingest_events(jsonb)','EXECUTE') OR
     has_function_privilege('authenticated','public.acquisition_ingest_events(jsonb)','EXECUTE') OR
     has_table_privilege('anon','acquisition_private.webhook_events','SELECT') OR
     has_table_privilege('authenticated','acquisition_private.deal_snapshots','INSERT') OR
     has_table_privilege('service_role','acquisition_private.snapshot_attestations','INSERT') OR
     has_table_privilege('service_role','acquisition_private.deal_snapshots','UPDATE') THEN RAISE EXCEPTION 'Unexpected privilege'; END IF;
END;
$$;
ROLLBACK;
