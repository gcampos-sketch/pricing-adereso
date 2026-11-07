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