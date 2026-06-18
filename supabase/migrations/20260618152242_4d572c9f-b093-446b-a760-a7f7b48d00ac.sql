ALTER TABLE public.pdf_templates ADD COLUMN IF NOT EXISTS theme text;
CREATE INDEX IF NOT EXISTS pdf_templates_theme_idx ON public.pdf_templates (organization_id, theme);