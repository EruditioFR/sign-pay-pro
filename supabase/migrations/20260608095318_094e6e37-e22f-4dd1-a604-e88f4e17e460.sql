ALTER TABLE public.documents ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.document_signature_requests ALTER COLUMN invited_by DROP NOT NULL;