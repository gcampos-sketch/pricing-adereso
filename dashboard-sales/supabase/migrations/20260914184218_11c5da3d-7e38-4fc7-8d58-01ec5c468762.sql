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