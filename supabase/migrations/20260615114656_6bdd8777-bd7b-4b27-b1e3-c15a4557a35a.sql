ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'canvas',
  ADD COLUMN IF NOT EXISTS source_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS source_mime TEXT,
  ADD COLUMN IF NOT EXISTS source_page_count INTEGER,
  ADD COLUMN IF NOT EXISTS overlay_zones JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.document_templates
  ADD CONSTRAINT document_templates_kind_check
  CHECK (kind IN ('canvas','overlay'));