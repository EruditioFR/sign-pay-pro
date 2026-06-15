ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS canvas_schema jsonb,
  ADD COLUMN IF NOT EXISTS page_format text NOT NULL DEFAULT 'A4',
  ADD COLUMN IF NOT EXISTS page_orientation text NOT NULL DEFAULT 'portrait';

ALTER TABLE public.document_templates
  DROP CONSTRAINT IF EXISTS document_templates_page_format_chk;
ALTER TABLE public.document_templates
  ADD CONSTRAINT document_templates_page_format_chk
  CHECK (page_format IN ('A4','A5','LETTER'));

ALTER TABLE public.document_templates
  DROP CONSTRAINT IF EXISTS document_templates_page_orientation_chk;
ALTER TABLE public.document_templates
  ADD CONSTRAINT document_templates_page_orientation_chk
  CHECK (page_orientation IN ('portrait','landscape'));