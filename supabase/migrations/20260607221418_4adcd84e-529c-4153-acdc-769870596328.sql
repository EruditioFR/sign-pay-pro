
-- 1. Create versions table
CREATE TABLE public.pdf_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.pdf_templates(id) ON DELETE CASCADE,
  version integer NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  page_count integer NOT NULL DEFAULT 1,
  size_bytes bigint,
  notes text,
  is_current boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdf_template_versions TO authenticated;
GRANT ALL ON public.pdf_template_versions TO service_role;
ALTER TABLE public.pdf_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membres voient versions modèles PDF de leur org"
  ON public.pdf_template_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pdf_templates t
    WHERE t.id = pdf_template_versions.template_id
      AND (t.organization_id = get_user_org(auth.uid()) OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Membres créent versions modèles PDF"
  ON public.pdf_template_versions FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND EXISTS (
      SELECT 1 FROM public.pdf_templates t
      WHERE t.id = pdf_template_versions.template_id
        AND t.organization_id = get_user_org(auth.uid())
    )
  );

CREATE POLICY "Auteur ou admin met à jour version modèle PDF"
  ON public.pdf_template_versions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pdf_templates t
    WHERE t.id = pdf_template_versions.template_id
      AND t.organization_id = get_user_org(auth.uid())
      AND (t.created_by = auth.uid() OR is_org_admin(auth.uid(), t.organization_id))
  ));

CREATE POLICY "Auteur ou admin supprime version modèle PDF"
  ON public.pdf_template_versions FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pdf_templates t
    WHERE t.id = pdf_template_versions.template_id
      AND t.organization_id = get_user_org(auth.uid())
      AND (t.created_by = auth.uid() OR is_org_admin(auth.uid(), t.organization_id))
  ));

-- 2. Add version_id on fields
ALTER TABLE public.pdf_template_fields
  ADD COLUMN version_id uuid REFERENCES public.pdf_template_versions(id) ON DELETE CASCADE;

-- 3. Add current_version_id on pdf_templates
ALTER TABLE public.pdf_templates
  ADD COLUMN current_version_id uuid REFERENCES public.pdf_template_versions(id) ON DELETE SET NULL;

-- 4. Backfill: one v1 per existing template
INSERT INTO public.pdf_template_versions
  (template_id, version, storage_path, file_name, page_count, size_bytes, notes, is_current, created_by, created_at)
SELECT id, 1, storage_path, file_name, page_count, size_bytes, 'Version initiale', true, created_by, created_at
FROM public.pdf_templates;

-- Link template.current_version_id
UPDATE public.pdf_templates t
SET current_version_id = v.id
FROM public.pdf_template_versions v
WHERE v.template_id = t.id AND v.is_current;

-- Link existing fields to their template's v1
UPDATE public.pdf_template_fields f
SET version_id = v.id
FROM public.pdf_template_versions v
WHERE v.template_id = f.template_id AND v.is_current;

-- 5. Lock version_id NOT NULL on fields
ALTER TABLE public.pdf_template_fields
  ALTER COLUMN version_id SET NOT NULL;

CREATE INDEX idx_pdf_template_fields_version ON public.pdf_template_fields(version_id);
CREATE INDEX idx_pdf_template_versions_template ON public.pdf_template_versions(template_id);
