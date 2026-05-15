
-- =========================
-- Document templates (PDF)
-- =========================
CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  document_type public.document_type,
  logo_url text,
  primary_color text DEFAULT '#1f2937',
  header_html text,
  footer_html text,
  legal_mentions text,
  payment_terms text,
  iban text,
  bic text,
  vat_number text,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les modèles PDF de leur organisation"
  ON public.document_templates FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admin gère les modèles PDF (insert)"
  ON public.document_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admin gère les modèles PDF (update)"
  ON public.document_templates FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admin gère les modèles PDF (delete)"
  ON public.document_templates FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER trg_document_templates_touch
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================
-- Public share links
-- =========================
CREATE TABLE public.document_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  recipient_email text,
  recipient_name text,
  expires_at timestamptz,
  max_views integer,
  view_count integer NOT NULL DEFAULT 0,
  allow_sign boolean NOT NULL DEFAULT true,
  allow_pay boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_share_links_document ON public.document_share_links(document_id);
CREATE INDEX idx_share_links_token ON public.document_share_links(token);
ALTER TABLE public.document_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les liens de leur organisation"
  ON public.document_share_links FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_share_links.document_id
      AND (d.organization_id = public.get_user_org(auth.uid()) OR public.is_super_admin(auth.uid()))
  ));

CREATE POLICY "Membres créent des liens pour leurs documents"
  ON public.document_share_links FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_share_links.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
  ) AND created_by = auth.uid());

CREATE POLICY "Auteur ou admin met à jour le lien"
  ON public.document_share_links FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_share_links.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
      AND (document_share_links.created_by = auth.uid() OR public.is_org_admin(auth.uid(), d.organization_id))
  ));

CREATE POLICY "Auteur ou admin supprime le lien"
  ON public.document_share_links FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_share_links.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
      AND (document_share_links.created_by = auth.uid() OR public.is_org_admin(auth.uid(), d.organization_id))
  ));

-- =========================
-- Signatures
-- =========================
CREATE TABLE public.document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  share_link_id uuid,
  signer_name text NOT NULL,
  signer_email text,
  signature_image_b64 text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  pdf_hash_sha256 text,
  pdf_storage_path text
);
CREATE INDEX idx_signatures_document ON public.document_signatures(document_id);
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les signatures de leur org"
  ON public.document_signatures FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_signatures.document_id
      AND (d.organization_id = public.get_user_org(auth.uid()) OR public.is_super_admin(auth.uid()))
  ));
-- inserts faites par server fn admin → pas de policy authenticated insert nécessaire

-- =========================
-- Payments
-- =========================
CREATE TABLE public.document_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  share_link_id uuid,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  method text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending',
  provider_ref text,
  paid_at timestamptz,
  recorded_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_document ON public.document_payments(document_id);
ALTER TABLE public.document_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les paiements de leur org"
  ON public.document_payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_payments.document_id
      AND (d.organization_id = public.get_user_org(auth.uid()) OR public.is_super_admin(auth.uid()))
  ));

CREATE POLICY "Membres enregistrent des paiements manuels"
  ON public.document_payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_payments.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
  ));

CREATE POLICY "Auteur ou admin met à jour le paiement"
  ON public.document_payments FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_payments.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
      AND (document_payments.recorded_by = auth.uid() OR public.is_org_admin(auth.uid(), d.organization_id))
  ));

-- =========================
-- Trigger: status update on signature
-- =========================
CREATE OR REPLACE FUNCTION public.on_document_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.documents
    SET status = 'signed', updated_at = now()
    WHERE id = NEW.document_id
      AND status NOT IN ('paid', 'partially_paid');

  INSERT INTO public.audit_logs(organization_id, user_id, action, resource, metadata)
  SELECT d.organization_id, NULL, 'document.signed', 'document:' || d.id::text,
         jsonb_build_object('signature_id', NEW.id, 'signer', NEW.signer_name)
  FROM public.documents d WHERE d.id = NEW.document_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_document_signed
  AFTER INSERT ON public.document_signatures
  FOR EACH ROW EXECUTE FUNCTION public.on_document_signed();

-- =========================
-- Trigger: status update on payment
-- =========================
CREATE OR REPLACE FUNCTION public.on_document_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_doc_amount numeric;
BEGIN
  IF NEW.status <> 'succeeded' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM public.document_payments
    WHERE document_id = NEW.document_id AND status = 'succeeded';

  SELECT COALESCE(amount_ttc, amount_ht, 0) INTO v_doc_amount
    FROM public.documents WHERE id = NEW.document_id;

  IF v_doc_amount > 0 AND v_total >= v_doc_amount THEN
    UPDATE public.documents SET status = 'paid', updated_at = now()
      WHERE id = NEW.document_id;
  ELSE
    UPDATE public.documents SET status = 'partially_paid', updated_at = now()
      WHERE id = NEW.document_id;
  END IF;

  INSERT INTO public.audit_logs(organization_id, user_id, action, resource, metadata)
  SELECT d.organization_id, NEW.recorded_by, 'document.payment_recorded',
         'document:' || d.id::text,
         jsonb_build_object('payment_id', NEW.id, 'amount', NEW.amount, 'method', NEW.method)
  FROM public.documents d WHERE d.id = NEW.document_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_payment_insert
  AFTER INSERT ON public.document_payments
  FOR EACH ROW EXECUTE FUNCTION public.on_document_payment_change();

CREATE TRIGGER trg_on_payment_update
  AFTER UPDATE OF status ON public.document_payments
  FOR EACH ROW EXECUTE FUNCTION public.on_document_payment_change();

-- =========================
-- Storage bucket for signed PDFs
-- =========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-documents', 'signed-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Membres voient leurs PDF signés"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'signed-documents' AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.organization_id::text = (storage.foldername(name))[1]
        AND d.organization_id = public.get_user_org(auth.uid())
    )
  );

CREATE POLICY "Membres uploadent dans leur dossier org"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'signed-documents'
    AND (storage.foldername(name))[1] = public.get_user_org(auth.uid())::text
  );
