
CREATE TABLE public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  mode text NOT NULL,
  payment_id uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

GRANT ALL ON public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins voient les événements Stripe"
  ON public.stripe_webhook_events FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE INDEX idx_stripe_events_payment ON public.stripe_webhook_events(payment_id);
CREATE INDEX idx_stripe_events_received ON public.stripe_webhook_events(received_at DESC);
