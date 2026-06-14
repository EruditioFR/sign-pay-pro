
-- Status enum for transmission lifecycle
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'einvoice_transmission_status') THEN
    CREATE TYPE public.einvoice_transmission_status AS ENUM (
      'queued', 'sending', 'transmitted', 'error', 'cancelled'
    );
  END IF;
END $$;

-- Queue table
CREATE TABLE IF NOT EXISTS public.einvoice_transmissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'noop',
  status          public.einvoice_transmission_status NOT NULL DEFAULT 'queued',
  format          text,
  payload_ref     text,
  remote_id       text,
  attempts        int NOT NULL DEFAULT 0,
  last_error      text,
  scheduled_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at    timestamptz,
  acknowledged_at timestamptz,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.einvoice_transmissions TO authenticated;
GRANT ALL ON public.einvoice_transmissions TO service_role;

ALTER TABLE public.einvoice_transmissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read their org transmissions"
  ON public.einvoice_transmissions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX IF NOT EXISTS einvoice_transmissions_doc_idx
  ON public.einvoice_transmissions(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS einvoice_transmissions_pending_idx
  ON public.einvoice_transmissions(status, scheduled_at)
  WHERE status IN ('queued', 'sending', 'error');

CREATE TRIGGER touch_einvoice_transmissions
  BEFORE UPDATE ON public.einvoice_transmissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Reference latest transmission on documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS pdp_provider text,
  ADD COLUMN IF NOT EXISTS pdp_transmission_id uuid
    REFERENCES public.einvoice_transmissions(id) ON DELETE SET NULL;
