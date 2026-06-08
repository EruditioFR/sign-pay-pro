
ALTER TABLE public.document_workflow_steps
  ADD COLUMN IF NOT EXISTS approver_email text,
  ADD COLUMN IF NOT EXISTS approver_name text,
  ADD COLUMN IF NOT EXISTS approval_token uuid DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS document_workflow_steps_token_idx
  ON public.document_workflow_steps(approval_token);
