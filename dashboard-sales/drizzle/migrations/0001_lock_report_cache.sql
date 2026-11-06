DROP POLICY IF EXISTS "Authenticated users can read report cache" ON public.report_cache;
REVOKE ALL ON public.report_cache FROM anon, authenticated;
GRANT ALL ON public.report_cache TO service_role;