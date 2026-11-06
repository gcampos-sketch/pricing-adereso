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