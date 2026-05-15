
-- Extend document_status enum
ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'signed';
ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE public.document_status ADD VALUE IF NOT EXISTS 'partially_paid';
