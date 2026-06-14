
-- 1. Enum signature_level (SES aujourd'hui, AES/QES prêts pour plus tard)
DO $$ BEGIN
  CREATE TYPE public.signature_level AS ENUM ('ses', 'aes', 'qes');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Invitations: niveau requis + méthode d'auth requise
ALTER TABLE public.document_signature_requests
  ADD COLUMN IF NOT EXISTS signature_level public.signature_level NOT NULL DEFAULT 'ses',
  ADD COLUMN IF NOT EXISTS auth_method_required text NOT NULL DEFAULT 'email_link';

-- 3. Signatures: traces de conformité
ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS signature_level public.signature_level NOT NULL DEFAULT 'ses',
  ADD COLUMN IF NOT EXISTS consent_text text,
  ADD COLUMN IF NOT EXISTS consent_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'email_link',
  ADD COLUMN IF NOT EXISTS original_pdf_hash_sha256 text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_signatures_level ON public.document_signatures(signature_level);
