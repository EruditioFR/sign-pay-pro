
CREATE TYPE public.pdf_field_kind AS ENUM ('text','date','checkbox','signature','initials');

CREATE TABLE public.document_pdf_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  page_index integer NOT NULL DEFAULT 0,
  kind public.pdf_field_kind NOT NULL,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 120,
  height numeric NOT NULL DEFAULT 30,
  value text,
  font_size integer NOT NULL DEFAULT 11,
  required boolean NOT NULL DEFAULT false,
  label text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_pdf_fields_document ON public.document_pdf_fields(document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_pdf_fields TO authenticated;
GRANT ALL ON public.document_pdf_fields TO service_role;

ALTER TABLE public.document_pdf_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les zones PDF de leur org"
  ON public.document_pdf_fields FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d
    WHERE d.id = document_pdf_fields.document_id
      AND (d.organization_id = public.get_user_org(auth.uid()) OR public.is_super_admin(auth.uid()))));

CREATE POLICY "Membres créent des zones pour leurs documents"
  ON public.document_pdf_fields FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.documents d
    WHERE d.id = document_pdf_fields.document_id
      AND d.organization_id = public.get_user_org(auth.uid())));

CREATE POLICY "Auteur ou admin met à jour les zones"
  ON public.document_pdf_fields FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d
    WHERE d.id = document_pdf_fields.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
      AND (d.created_by = auth.uid() OR public.is_org_admin(auth.uid(), d.organization_id))));

CREATE POLICY "Auteur ou admin supprime les zones"
  ON public.document_pdf_fields FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d
    WHERE d.id = document_pdf_fields.document_id
      AND d.organization_id = public.get_user_org(auth.uid())
      AND (d.created_by = auth.uid() OR public.is_org_admin(auth.uid(), d.organization_id))));

CREATE TRIGGER trg_document_pdf_fields_updated_at
  BEFORE UPDATE ON public.document_pdf_fields
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
