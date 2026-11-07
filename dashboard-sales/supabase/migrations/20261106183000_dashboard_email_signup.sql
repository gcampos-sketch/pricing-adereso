-- Attach as the Before User Created hook in the owned Supabase project.
CREATE FUNCTION public.dashboard_restrict_signup_email(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  email text := lower(btrim(coalesce(event->'user'->>'email', '')));
BEGIN
  IF email !~ '^[^@[:space:]]+@adere[.]so$' THEN
    RETURN jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Solo cuentas @adere.so pueden registrarse.'));
  END IF;
  RETURN '{}'::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_restrict_signup_email(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.dashboard_restrict_signup_email(jsonb) TO supabase_auth_admin;
