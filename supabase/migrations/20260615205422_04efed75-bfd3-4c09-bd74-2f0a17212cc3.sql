ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS required_fields text[] DEFAULT ARRAY[]::text[];

CREATE UNIQUE INDEX IF NOT EXISTS document_templates_org_vertical_name_uidx
  ON public.document_templates (organization_id, business_vertical, name)
  WHERE business_vertical IS NOT NULL;