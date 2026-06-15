
DO $$ BEGIN
  CREATE TYPE public.pdp_status AS ENUM ('pending','submitted','acknowledged','rejected','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS pdp_status public.pdp_status NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS documents_pdp_status_idx
  ON public.documents (organization_id, pdp_status)
  WHERE type = 'invoice';
