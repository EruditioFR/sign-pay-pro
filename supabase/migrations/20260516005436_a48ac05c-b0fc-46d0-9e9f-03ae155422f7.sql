
-- Status enum for signature requests
DO $$ BEGIN
  CREATE TYPE public.signature_request_status AS ENUM ('pending','signed','declined','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.document_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  order_index integer NOT NULL DEFAULT 1,
  sequential boolean NOT NULL DEFAULT false,
  status public.signature_request_status NOT NULL DEFAULT 'pending',
  signature_id uuid,
  decline_reason text,
  invited_by uuid NOT NULL,
  expires_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsr_document ON public.document_signature_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_dsr_status ON public.document_signature_requests(status);

ALTER TABLE public.document_signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les invitations de leur org"
ON public.document_signature_requests FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_signature_requests.document_id
    AND (d.organization_id = public.get_user_org(auth.uid()) OR public.is_super_admin(auth.uid()))
));

CREATE POLICY "Auteur ou admin crée des invitations"
ON public.document_signature_requests FOR INSERT TO authenticated
WITH CHECK (
  invited_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_signature_requests.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
      AND (d.created_by = auth.uid() OR public.is_org_admin(auth.uid(), d.organization_id))
  )
);

CREATE POLICY "Auteur ou admin met à jour les invitations"
ON public.document_signature_requests FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_signature_requests.document_id
    AND d.organization_id = public.get_user_org(auth.uid())
    AND (d.created_by = auth.uid() OR public.is_org_admin(auth.uid(), d.organization_id))
));

CREATE POLICY "Auteur ou admin supprime les invitations"
ON public.document_signature_requests FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_signature_requests.document_id
    AND d.organization_id = public.get_user_org(auth.uid())
    AND (d.created_by = auth.uid() OR public.is_org_admin(auth.uid(), d.organization_id))
));

CREATE TRIGGER touch_dsr_updated
BEFORE UPDATE ON public.document_signature_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- When a request flips to 'signed', if every required request for the doc is signed,
-- mark the document as 'signed'.
CREATE OR REPLACE FUNCTION public.on_signature_request_signed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_remaining int;
  v_org uuid;
BEGIN
  IF NEW.status <> 'signed' OR (OLD.status = 'signed') THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_remaining
    FROM public.document_signature_requests
    WHERE document_id = NEW.document_id
      AND status = 'pending';

  IF v_remaining = 0 THEN
    UPDATE public.documents
      SET status = 'signed', updated_at = now()
      WHERE id = NEW.document_id
        AND status NOT IN ('paid','partially_paid');

    SELECT organization_id INTO v_org FROM public.documents WHERE id = NEW.document_id;
    INSERT INTO public.audit_logs(organization_id, action, resource, metadata)
    VALUES (v_org, 'document.multi_signed', 'document:' || NEW.document_id::text,
            jsonb_build_object('last_request_id', NEW.id));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dsr_signed ON public.document_signature_requests;
CREATE TRIGGER trg_dsr_signed
AFTER UPDATE ON public.document_signature_requests
FOR EACH ROW EXECUTE FUNCTION public.on_signature_request_signed();
