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

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_report_cache_updated_at
  BEFORE UPDATE ON public.report_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();