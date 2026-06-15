
-- ============================================================================
-- 1. Settings per organisation
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.document_numbering_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_prefix text NOT NULL DEFAULT 'FAC',
  quote_prefix text NOT NULL DEFAULT 'DEV',
  credit_note_prefix text NOT NULL DEFAULT 'AVO',
  pad_width int NOT NULL DEFAULT 4 CHECK (pad_width BETWEEN 1 AND 10),
  reset_yearly boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_numbering_settings TO authenticated;
GRANT ALL ON public.document_numbering_settings TO service_role;

ALTER TABLE public.document_numbering_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "numbering_settings_select_org_members"
  ON public.document_numbering_settings FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "numbering_settings_insert_org_admin"
  ON public.document_numbering_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "numbering_settings_update_org_admin"
  ON public.document_numbering_settings FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "numbering_settings_delete_super_admin"
  ON public.document_numbering_settings FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER tg_numbering_settings_touch
  BEFORE UPDATE ON public.document_numbering_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 2. Internal counter table — no direct access from app
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.document_number_sequences (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invoice','quote','credit_note')),
  year int NOT NULL,
  last_seq int NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, kind, year)
);

GRANT ALL ON public.document_number_sequences TO service_role;
-- intentionally no grants for authenticated/anon: only callable via SECURITY DEFINER

ALTER TABLE public.document_number_sequences ENABLE ROW LEVEL SECURITY;
-- no policies → no direct access for authenticated/anon

-- ============================================================================
-- 3. Number column on documents
-- ============================================================================
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS document_numbered_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS documents_org_document_number_unique
  ON public.documents (organization_id, document_number)
  WHERE document_number IS NOT NULL;

-- ============================================================================
-- 4. Freeze guard: cannot modify or clear document_number once set
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_documents_freeze_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.document_number IS NOT NULL
     AND NEW.document_number IS DISTINCT FROM OLD.document_number THEN
    RAISE EXCEPTION 'Le numéro légal d''un document ne peut pas être modifié (% → %).',
      OLD.document_number, NEW.document_number
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_documents_freeze_number ON public.documents;
CREATE TRIGGER tg_documents_freeze_number
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_documents_freeze_number();

-- ============================================================================
-- 5. Allocation function — atomic, no gaps, no duplicates
-- ============================================================================
CREATE OR REPLACE FUNCTION public.allocate_document_number(p_document_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc       record;
  v_kind      text;
  v_year      int;
  v_settings  record;
  v_prefix    text;
  v_seq       int;
  v_number    text;
BEGIN
  -- Lock the document row to prevent races on the same document.
  SELECT id, organization_id, type, document_number, issue_date, corrected_invoice_id, status
    INTO v_doc
    FROM public.documents
    WHERE id = p_document_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document introuvable: %', p_document_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotent: if a number was already allocated, return it as-is.
  IF v_doc.document_number IS NOT NULL THEN
    RETURN v_doc.document_number;
  END IF;

  -- Determine the legal kind.
  IF v_doc.type = 'invoice' THEN
    IF v_doc.corrected_invoice_id IS NOT NULL THEN
      v_kind := 'credit_note';
    ELSE
      v_kind := 'invoice';
    END IF;
  ELSIF v_doc.type = 'quote' THEN
    v_kind := 'quote';
  ELSE
    RAISE EXCEPTION 'Numérotation légale non applicable au type %', v_doc.type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Load (or create) per-org settings.
  INSERT INTO public.document_numbering_settings (organization_id)
    VALUES (v_doc.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;

  SELECT * INTO v_settings
    FROM public.document_numbering_settings
    WHERE organization_id = v_doc.organization_id;

  v_prefix := CASE v_kind
    WHEN 'invoice'     THEN v_settings.invoice_prefix
    WHEN 'quote'       THEN v_settings.quote_prefix
    WHEN 'credit_note' THEN v_settings.credit_note_prefix
  END;

  -- Year: based on issue_date (or current date when null). When reset_yearly is
  -- false, use a fixed bucket "0" so the counter never rolls over.
  IF v_settings.reset_yearly THEN
    v_year := EXTRACT(YEAR FROM COALESCE(v_doc.issue_date::timestamptz, now()))::int;
  ELSE
    v_year := 0;
  END IF;

  -- Atomic sequence increment.
  INSERT INTO public.document_number_sequences (organization_id, kind, year, last_seq)
    VALUES (v_doc.organization_id, v_kind, v_year, 1)
    ON CONFLICT (organization_id, kind, year)
    DO UPDATE SET
      last_seq = public.document_number_sequences.last_seq + 1,
      updated_at = now()
    RETURNING last_seq INTO v_seq;

  v_number := v_prefix
    || '-'
    || (CASE WHEN v_settings.reset_yearly THEN v_year::text ELSE 'ALL' END)
    || '-'
    || lpad(v_seq::text, v_settings.pad_width, '0');

  -- Write back. Also fill invoice_number to keep e-invoice flows consistent.
  UPDATE public.documents
     SET document_number = v_number,
         document_numbered_at = now(),
         invoice_number = CASE
           WHEN type = 'invoice' AND invoice_number IS NULL THEN v_number
           ELSE invoice_number
         END,
         reference = COALESCE(reference, v_number),
         updated_at = now()
   WHERE id = p_document_id;

  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_document_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_document_number(uuid) TO authenticated, service_role;
