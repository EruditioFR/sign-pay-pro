
-- 1) Extend enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
                 WHERE t.typname = 'document_status' AND e.enumlabel = 'issued') THEN
    ALTER TYPE public.document_status ADD VALUE 'issued';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
                 WHERE t.typname = 'document_status' AND e.enumlabel = 'viewed') THEN
    ALTER TYPE public.document_status ADD VALUE 'viewed';
  END IF;
END $$;

-- 2) Track first view timestamp
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz;

-- 3) Invoice transition audit trigger
CREATE OR REPLACE FUNCTION public.tg_audit_invoice_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.type = 'invoice'::public.document_type
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.audit_log_event(
      NEW.organization_id,
      auth.uid(),
      'invoice.transition',
      'document:' || NEW.id::text,
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status,
        'invoice_number', NEW.invoice_number,
        'amount_ttc', NEW.amount_ttc,
        'due_date', NEW.due_date
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_invoice_transition ON public.documents;
CREATE TRIGGER audit_invoice_transition
  AFTER UPDATE OF status ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_audit_invoice_transition();
