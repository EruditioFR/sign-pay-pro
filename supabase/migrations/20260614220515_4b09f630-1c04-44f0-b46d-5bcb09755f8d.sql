-- 1. Add 'cancelled' to document_status enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'document_status' AND e.enumlabel = 'cancelled'
  ) THEN
    ALTER TYPE public.document_status ADD VALUE 'cancelled';
  END IF;
END$$;

-- 2. Archive metadata columns
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_status public.document_status,
  ADD COLUMN IF NOT EXISTS retention_until date;

CREATE INDEX IF NOT EXISTS documents_archived_at_idx ON public.documents(archived_at);
CREATE INDEX IF NOT EXISTS documents_retention_until_idx ON public.documents(retention_until);

-- 3. Guard trigger: when status = archived, only status / archive metadata can change
CREATE OR REPLACE FUNCTION public.tg_documents_archive_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'archived'::public.document_status
     AND NEW.status = 'archived'::public.document_status THEN
    IF (NEW.title, NEW.reference, NEW.description, NEW.amount_ht, NEW.amount_ttc,
        NEW.currency, NEW.third_party_name, NEW.third_party_email,
        NEW.issue_date, NEW.due_date, NEW.tags, NEW.type)
       IS DISTINCT FROM
       (OLD.title, OLD.reference, OLD.description, OLD.amount_ht, OLD.amount_ttc,
        OLD.currency, OLD.third_party_name, OLD.third_party_email,
        OLD.issue_date, OLD.due_date, OLD.tags, OLD.type) THEN
      RAISE EXCEPTION 'Document archivé en lecture seule. Désarchivez avant modification.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_archive_guard ON public.documents;
CREATE TRIGGER documents_archive_guard
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.tg_documents_archive_guard();