
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS business_vertical TEXT;
ALTER TABLE public.workflow_templates ADD COLUMN IF NOT EXISTS business_vertical TEXT;
CREATE INDEX IF NOT EXISTS idx_document_templates_business_vertical ON public.document_templates(business_vertical);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_business_vertical ON public.workflow_templates(business_vertical);
