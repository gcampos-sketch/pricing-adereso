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