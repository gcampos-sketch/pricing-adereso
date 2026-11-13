-- SYNTHETIC SCOPE: portal 1, app 2, pipelines 3/4 must be reviewed/replaced in
-- private deployment configuration before any staging integration.
-- PROPOSAL ONLY. Do not apply to production. PostgreSQL integration tests pending.
-- This is intentionally not a versioned migration. Generate one with Supabase CLI
-- only after isolated PostgreSQL validation and explicit activation approval.
BEGIN;
CREATE SCHEMA acquisition_private;
REVOKE ALL ON SCHEMA acquisition_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA acquisition_private TO service_role;

CREATE TABLE acquisition_private.webhook_events (
  portal_id bigint NOT NULL CHECK (portal_id = 1),
  app_id bigint NOT NULL CHECK (app_id = 2),
  event_key text NOT NULL CHECK (event_key ~ '^[a-f0-9]{64}$'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  PRIMARY KEY (portal_id, app_id, event_key)
);
CREATE INDEX webhook_events_occurred ON acquisition_private.webhook_events(portal_id, occurred_at);
ALTER TABLE acquisition_private.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_event_reads ON acquisition_private.webhook_events FOR SELECT TO service_role USING (true);
CREATE POLICY server_event_inserts ON acquisition_private.webhook_events FOR INSERT TO service_role WITH CHECK (true);

-- An audited completeness/identity attestation is not inferred from webhook arrival,
-- a quiet interval, the latest event time, or current CRM associations.
-- The receiver role cannot INSERT/UPDATE these. A separately reviewed operator or
-- reconciliation integration must establish evidence before snapshot materialization.
CREATE TABLE acquisition_private.snapshot_attestations (
  attestation_id uuid PRIMARY KEY,
  portal_id bigint NOT NULL CHECK (portal_id = 1),
  deal_id text NOT NULL CHECK (deal_id ~ '^[0-9]{1,30}$'),
  contact_id text NOT NULL CHECK (contact_id ~ '^[0-9]{1,30}$'),
  as_of timestamptz NOT NULL,
  pipeline_id text NOT NULL CHECK (pipeline_id IN ('3','4')),
  coverage_start timestamptz NOT NULL,
  coverage_end timestamptz NOT NULL,
  coverage_complete boolean NOT NULL DEFAULT false,
  identity_at_creation_proven boolean NOT NULL DEFAULT false,
  acquisition_value text CHECK (acquisition_value IN ('Inbound','Outbound','No aplica')),
  result_kind text NOT NULL CHECK (result_kind IN ('observed','unknown','cleared','renewal')),
  source_reference text NOT NULL CHECK (source_reference ~ '^[A-Za-z0-9_:/.-]{1,200}$'),
  rule_version text NOT NULL CHECK (rule_version ~ '^[A-Za-z0-9_.-]{1,100}$'),
  evidence_event_keys text[] NOT NULL CHECK (cardinality(evidence_event_keys) BETWEEN 1 AND 100),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (coverage_start <= as_of AND as_of <= coverage_end),
  CHECK (((result_kind IN ('unknown','cleared') AND acquisition_value IS NULL)
      OR (result_kind = 'observed' AND acquisition_value IN ('Inbound','Outbound'))
      OR (result_kind = 'renewal' AND acquisition_value = 'No aplica')) IS TRUE)
);
ALTER TABLE acquisition_private.snapshot_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_attestation_reads ON acquisition_private.snapshot_attestations FOR SELECT TO service_role USING (true);

CREATE TABLE acquisition_private.deal_snapshots (
  portal_id bigint NOT NULL CHECK (portal_id = 1),
  deal_id text NOT NULL CHECK (deal_id ~ '^[0-9]{1,30}$'),
  attestation_id uuid NOT NULL REFERENCES acquisition_private.snapshot_attestations(attestation_id),
  contact_id text NOT NULL,
  as_of timestamptz NOT NULL,
  acquisition_value text CHECK (acquisition_value IN ('Inbound','Outbound','No aplica')),
  result_kind text NOT NULL,
  rule_version text NOT NULL,
  frozen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (portal_id, deal_id)
);
ALTER TABLE acquisition_private.deal_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY server_snapshot_reads ON acquisition_private.deal_snapshots FOR SELECT TO service_role USING (true);
CREATE POLICY server_snapshot_inserts ON acquisition_private.deal_snapshots FOR INSERT TO service_role WITH CHECK (true);

-- Reject mutation even if a future grant accidentally permits UPDATE/DELETE.
CREATE FUNCTION acquisition_private.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Acquisition evidence is append-only'; END;
$$;
CREATE TRIGGER webhook_events_immutable BEFORE UPDATE OR DELETE ON acquisition_private.webhook_events
FOR EACH ROW EXECUTE FUNCTION acquisition_private.reject_mutation();
CREATE TRIGGER attestations_immutable BEFORE UPDATE OR DELETE ON acquisition_private.snapshot_attestations
FOR EACH ROW EXECUTE FUNCTION acquisition_private.reject_mutation();
CREATE TRIGGER snapshots_immutable BEFORE UPDATE OR DELETE ON acquisition_private.deal_snapshots
FOR EACH ROW EXECUTE FUNCTION acquisition_private.reject_mutation();

-- Direct service-role inserts cannot bypass attestation gates or change values.
CREATE FUNCTION acquisition_private.validate_snapshot_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE a acquisition_private.snapshot_attestations%ROWTYPE;
BEGIN
  SELECT * INTO a FROM acquisition_private.snapshot_attestations WHERE attestation_id=NEW.attestation_id;
  IF NOT FOUND OR NOT a.coverage_complete OR NOT a.identity_at_creation_proven OR
     ROW(NEW.portal_id,NEW.deal_id,NEW.contact_id,NEW.as_of,NEW.acquisition_value,NEW.result_kind,NEW.rule_version)
       IS DISTINCT FROM ROW(a.portal_id,a.deal_id,a.contact_id,a.as_of,a.acquisition_value,a.result_kind,a.rule_version) OR
     EXISTS (SELECT 1 FROM unnest(a.evidence_event_keys) AS e(key) WHERE NOT EXISTS
       (SELECT 1 FROM acquisition_private.webhook_events w WHERE w.portal_id=a.portal_id AND w.event_key=e.key)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Snapshot evidence not verified';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_snapshot BEFORE INSERT ON acquisition_private.deal_snapshots
FOR EACH ROW EXECUTE FUNCTION acquisition_private.validate_snapshot_insert();

-- Whole batch succeeds or rolls back. Only normalized scalar event data is accepted;
-- no raw requests, signatures, tokens, emails, form fields or user-agent metadata.
CREATE FUNCTION public.acquisition_ingest_events(p_events jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE envelope jsonb; e jsonb; identity jsonb; k text; h text; old_hash text;
        inserted integer := 0; duplicates integer := 0; n integer; t timestamptz;
        event_keys jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid event batch';
  END IF;
  FOR envelope IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    IF jsonb_typeof(envelope) IS DISTINCT FROM 'object' OR
       EXISTS (SELECT 1 FROM jsonb_object_keys(envelope) AS q(key) WHERE key NOT IN ('eventKey','event')) OR
       coalesce(envelope->>'eventKey','') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid event envelope';
    END IF;
    e := envelope->'event';
    IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR pg_column_size(e) > 4096 OR
       EXISTS (SELECT 1 FROM jsonb_object_keys(e) AS q(key) WHERE key NOT IN
       ('appId','portalId','eventId','subscriptionId','type','occurredAt','dealId','contactId','value','removed')) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid normalized event';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(e) AS f(key,value) WHERE key IN ('portalId','appId','eventId','subscriptionId','dealId','contactId','type') AND jsonb_typeof(value) <> 'string') OR
       e->>'portalId' IS DISTINCT FROM '1' OR e->>'appId' IS DISTINCT FROM '2' OR
       coalesce(e->>'eventId','') !~ '^[0-9]{1,30}$' OR coalesce(e->>'subscriptionId','') !~ '^[0-9]{1,30}$' OR
       jsonb_typeof(e->'occurredAt') IS DISTINCT FROM 'number' OR coalesce(e->>'occurredAt','') !~ '^[0-9]{13}$' OR
       coalesce(e->>'type','') NOT IN ('deal.creation','deal.associationChange','contact.associationChange','contact.propertyChange') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Event scope rejected';
    END IF;
    t := to_timestamp((e->>'occurredAt')::numeric / 1000);
    IF t > clock_timestamp() + interval '5 minutes' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Future event rejected';
    END IF;
    IF e->>'type' LIKE '%.associationChange' THEN
      IF coalesce(e->>'dealId','') !~ '^[0-9]{1,30}$' OR coalesce(e->>'contactId','') !~ '^[0-9]{1,30}$' OR
         jsonb_typeof(e->'removed') IS DISTINCT FROM 'boolean' OR e ? 'value' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid association event';
      END IF;
    ELSIF e->>'type' = 'deal.creation' THEN
      IF coalesce(e->>'dealId','') !~ '^[0-9]{1,30}$' OR e ?| ARRAY['contactId','value','removed'] THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid creation event';
      END IF;
    ELSE
      IF coalesce(e->>'contactId','') !~ '^[0-9]{1,30}$' OR e ?| ARRAY['dealId','removed'] OR
         jsonb_typeof(e->'value') IS DISTINCT FROM 'string' OR e->>'value' NOT IN ('','Inbound','Outbound','No aplica') THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid contact acquisition event';
      END IF;
    END IF;
    -- SQL identity is canonical jsonb, not the JS JSON.stringify key. The supplied
    -- eventKey is a diagnostic fingerprint only and is deliberately not persisted.
    -- Retry attemptNumber must already have been stripped by the verified receiver.
    identity := e - 'value' - 'removed';
    k := encode(sha256(convert_to(identity::text,'UTF8')),'hex');
    h := encode(sha256(convert_to(e::text,'UTF8')),'hex');
    INSERT INTO acquisition_private.webhook_events(portal_id,app_id,event_key,content_hash,occurred_at,event)
      VALUES (1,2,k,h,t,e) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN
      SELECT content_hash INTO old_hash FROM acquisition_private.webhook_events
        WHERE portal_id=1 AND app_id=2 AND event_key=k;
      IF old_hash IS DISTINCT FROM h THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Conflicting webhook evidence';
      END IF;
      duplicates := duplicates + 1;
    ELSE inserted := inserted + 1;
    END IF;
    event_keys := event_keys || jsonb_build_array(k);
  END LOOP;
  RETURN jsonb_build_object('inserted',inserted,'duplicates',duplicates,'eventKeys',event_keys);
END;
$$;

CREATE FUNCTION public.acquisition_freeze_attested_snapshot(p_attestation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE a acquisition_private.snapshot_attestations%ROWTYPE;
        existing acquisition_private.deal_snapshots%ROWTYPE; n integer;
BEGIN
  SELECT * INTO a FROM acquisition_private.snapshot_attestations WHERE attestation_id=p_attestation_id;
  IF NOT FOUND OR NOT a.coverage_complete OR NOT a.identity_at_creation_proven THEN
    RETURN jsonb_build_object('status','pending_evidence');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(a.evidence_event_keys) AS e(key) WHERE NOT EXISTS
      (SELECT 1 FROM acquisition_private.webhook_events w WHERE w.portal_id=a.portal_id AND w.event_key=e.key)) THEN
    RETURN jsonb_build_object('status','pending_evidence');
  END IF;
  INSERT INTO acquisition_private.deal_snapshots(portal_id,deal_id,attestation_id,contact_id,as_of,acquisition_value,result_kind,rule_version)
  VALUES(a.portal_id,a.deal_id,a.attestation_id,a.contact_id,a.as_of,a.acquisition_value,a.result_kind,a.rule_version)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT * INTO existing FROM acquisition_private.deal_snapshots WHERE portal_id=a.portal_id AND deal_id=a.deal_id;
  IF existing.attestation_id <> a.attestation_id THEN
    RETURN jsonb_build_object('status','frozen_conflict');
  END IF;
  RETURN jsonb_build_object('status',CASE WHEN n=1 THEN 'frozen' ELSE 'already_frozen' END);
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA acquisition_private FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON acquisition_private.webhook_events, acquisition_private.deal_snapshots TO service_role;
GRANT SELECT ON acquisition_private.snapshot_attestations TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA acquisition_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acquisition_ingest_events(jsonb), public.acquisition_freeze_attested_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquisition_ingest_events(jsonb), public.acquisition_freeze_attested_snapshot(uuid) TO service_role;
-- No grants to browser roles, no writes to HubSpot, no receiver route or scheduler.
COMMIT;
