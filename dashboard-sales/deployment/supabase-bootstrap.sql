-- Target project: nsflqsdtfmnuangezsid. Fresh schema only; no source data.
BEGIN;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('report_cache','coaching_events','mfa_recovery_codes','mfa_trusted_devices','mcp_grants','sales_notification_repositories')) THEN
 RAISE EXCEPTION 'Existen tablas del dashboard: revisar antes de instalar. No se reemplaza contenido.';
 END IF;
 IF to_regprocedure('public.dashboard_update_updated_at_column()') IS NOT NULL OR to_regprocedure('public.has_active_mcp_grant(text)') IS NOT NULL OR to_regprocedure('public.save_sales_notifications(uuid,bigint,jsonb)') IS NOT NULL THEN
 RAISE EXCEPTION 'Existen funciones de destino: revisar antes de instalar.';
 END IF;
END;
$$;

-- Source: dashboard-sales/supabase/migrations/20260908221403_57941a94-f570-432e-ade9-1d044a89176a.sql
CREATE TABLE public.report_cache (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  build_ms INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.report_cache TO authenticated;
GRANT ALL ON public.report_cache TO service_role;

ALTER TABLE public.report_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read report cache"
  ON public.report_cache FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.dashboard_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_report_cache_updated_at
  BEFORE UPDATE ON public.report_cache
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_update_updated_at_column();

-- Source: dashboard-sales/supabase/migrations/20260914184218_11c5da3d-7e38-4fc7-8d58-01ec5c468762.sql
CREATE TABLE public.coaching_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  deal_id text NOT NULL,
  deal_name text,
  owner_id text,
  meeting_date timestamptz,
  meeting_type text,
  categoria_key text NOT NULL,
  categoria_label text NOT NULL,
  evidencia text,
  status text NOT NULL DEFAULT 'pendiente',
  action_note text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.coaching_events TO service_role;
ALTER TABLE public.coaching_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX coaching_events_meeting_date_idx ON public.coaching_events (meeting_date DESC);

-- Source: dashboard-sales/supabase/migrations/20260914185913_f4e158da-ac6b-46e7-9937-7dba41b3d8aa.sql
ALTER TABLE public.coaching_events ADD COLUMN stage text;

-- Source: dashboard-sales/drizzle/migrations/0000_migration.sql
CREATE TABLE public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mfa_recovery_codes TO service_role;
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX mfa_recovery_codes_user_idx ON public.mfa_recovery_codes(user_id);

-- Source: dashboard-sales/drizzle/migrations/0001_lock_report_cache.sql
DROP POLICY IF EXISTS "Authenticated users can read report cache" ON public.report_cache;
REVOKE ALL ON public.report_cache FROM anon, authenticated;
GRANT ALL ON public.report_cache TO service_role;

-- Source: dashboard-sales/drizzle/migrations/0002_migration.sql
CREATE TABLE public.mfa_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.mfa_trusted_devices TO service_role;
ALTER TABLE public.mfa_trusted_devices ENABLE ROW LEVEL SECURITY;
CREATE INDEX mfa_trusted_devices_user_idx ON public.mfa_trusted_devices(user_id);

-- Source: dashboard-sales/drizzle/migrations/0003_migration.sql
CREATE TABLE public.mcp_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  authorization_id text NOT NULL UNIQUE,
  mfa_verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcp_grants TO authenticated;
GRANT ALL ON public.mcp_grants TO service_role;
ALTER TABLE public.mcp_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own MCP grants" ON public.mcp_grants FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX mcp_grants_user_client_idx ON public.mcp_grants(user_id, client_id);

CREATE OR REPLACE FUNCTION public.has_active_mcp_grant(_client_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mcp_grants
    WHERE user_id = auth.uid() AND client_id = _client_id
      AND revoked_at IS NULL AND expires_at > now()
  );
$$;
REVOKE ALL ON FUNCTION public.has_active_mcp_grant(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_mcp_grant(text) TO authenticated;

-- Source: dashboard-sales/drizzle/migrations/0004_sales_notification_repository.sql
CREATE TABLE public.sales_notification_repositories (
 user_id uuid PRIMARY KEY,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 revision bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sales_notification_repositories TO service_role;
ALTER TABLE public.sales_notification_repositories ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.save_sales_notifications(p_user uuid, p_revision bigint, p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO public.sales_notification_repositories(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 UPDATE public.sales_notification_repositories SET payload=p_payload, revision=revision+1, updated_at=now() WHERE user_id=p_user AND revision=p_revision;
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.save_sales_notifications(uuid,bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_sales_notifications(uuid,bigint,jsonb) TO service_role;
COMMIT;
