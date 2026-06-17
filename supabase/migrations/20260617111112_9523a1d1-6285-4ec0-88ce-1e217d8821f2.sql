ALTER TABLE public.document_pdf_fields
  ADD COLUMN IF NOT EXISTS recipient_fillable boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_document_pdf_fields_recipient
  ON public.document_pdf_fields(document_id) WHERE recipient_fillable = true;