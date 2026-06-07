
-- PDF templates with reusable zones
CREATE TABLE public.pdf_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  document_type document_type NOT NULL DEFAULT 'other',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  page_count integer NOT NULL DEFAULT 1,
  size_bytes bigint,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_templates TO authenticated;
GRANT ALL ON public.pdf_templates TO service_role;
ALTER TABLE public.pdf_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les modèles PDF de leur org"
  ON public.pdf_templates FOR SELECT TO authenticated
  USING (organization_id = get_user_org(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Membres créent des modèles PDF"
  ON public.pdf_templates FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Auteur ou admin met à jour le modèle PDF"
  ON public.pdf_templates FOR UPDATE TO authenticated
  USING (organization_id = get_user_org(auth.uid())
         AND (created_by = auth.uid() OR is_org_admin(auth.uid(), organization_id)));

CREATE POLICY "Auteur ou admin supprime le modèle PDF"
  ON public.pdf_templates FOR DELETE TO authenticated
  USING (organization_id = get_user_org(auth.uid())
         AND (created_by = auth.uid() OR is_org_admin(auth.uid(), organization_id)));

CREATE TRIGGER trg_pdf_templates_updated_at
  BEFORE UPDATE ON public.pdf_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Reusable field definitions for a template
CREATE TABLE public.pdf_template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.pdf_templates(id) ON DELETE CASCADE,
  page_index integer NOT NULL DEFAULT 0,
  kind pdf_field_kind NOT NULL,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 120,
  height numeric NOT NULL DEFAULT 30,
  default_value text,
  font_size integer NOT NULL DEFAULT 11,
  required boolean NOT NULL DEFAULT false,
  label text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_template_fields TO authenticated;
GRANT ALL ON public.pdf_template_fields TO service_role;
ALTER TABLE public.pdf_template_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient les zones de modèles PDF"
  ON public.pdf_template_fields FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pdf_templates t
    WHERE t.id = pdf_template_fields.template_id
      AND (t.organization_id = get_user_org(auth.uid()) OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Membres gèrent zones modèles PDF (insert)"
  ON public.pdf_template_fields FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pdf_templates t
    WHERE t.id = pdf_template_fields.template_id
      AND t.organization_id = get_user_org(auth.uid())
  ));

CREATE POLICY "Membres gèrent zones modèles PDF (update)"
  ON public.pdf_template_fields FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pdf_templates t
    WHERE t.id = pdf_template_fields.template_id
      AND t.organization_id = get_user_org(auth.uid())
  ));

CREATE POLICY "Membres gèrent zones modèles PDF (delete)"
  ON public.pdf_template_fields FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pdf_templates t
    WHERE t.id = pdf_template_fields.template_id
      AND t.organization_id = get_user_org(auth.uid())
  ));
