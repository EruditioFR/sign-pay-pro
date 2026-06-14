-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for fuzzy / ILIKE search
CREATE INDEX IF NOT EXISTS documents_title_trgm_idx
  ON public.documents USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS documents_reference_trgm_idx
  ON public.documents USING gin (reference gin_trgm_ops);
CREATE INDEX IF NOT EXISTS documents_third_party_name_trgm_idx
  ON public.documents USING gin (third_party_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS documents_third_party_email_trgm_idx
  ON public.documents USING gin (third_party_email gin_trgm_ops);

-- Filter / sort indexes
CREATE INDEX IF NOT EXISTS documents_org_status_idx
  ON public.documents (organization_id, status);
CREATE INDEX IF NOT EXISTS documents_org_type_idx
  ON public.documents (organization_id, type);
CREATE INDEX IF NOT EXISTS documents_org_issue_date_idx
  ON public.documents (organization_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS documents_org_created_at_idx
  ON public.documents (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_org_amount_ttc_idx
  ON public.documents (organization_id, amount_ttc);

CREATE INDEX IF NOT EXISTS sig_req_email_trgm_idx
  ON public.document_signature_requests USING gin (signer_email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS sig_req_doc_status_idx
  ON public.document_signature_requests (document_id, status);
CREATE INDEX IF NOT EXISTS payments_doc_status_idx
  ON public.document_payments (document_id, status);

-- Search function: returns rows + total_count (window) for pagination.
-- Respects RLS by being SECURITY INVOKER (default).
CREATE OR REPLACE FUNCTION public.search_documents(
  p_q              text    DEFAULT NULL,
  p_types          text[]  DEFAULT NULL,
  p_statuses       text[]  DEFAULT NULL,
  p_currencies     text[]  DEFAULT NULL,
  p_organization   uuid    DEFAULT NULL,
  p_from_date      date    DEFAULT NULL,
  p_to_date        date    DEFAULT NULL,
  p_min_amount     numeric DEFAULT NULL,
  p_max_amount     numeric DEFAULT NULL,
  p_signature      text    DEFAULT NULL,    -- 'any'|'none'|'pending'|'signed'
  p_payment        text    DEFAULT NULL,    -- 'any'|'none'|'partial'|'paid'
  p_archived       text    DEFAULT 'exclude', -- 'exclude'|'only'|'include'
  p_sort           text    DEFAULT 'created_at',
  p_dir            text    DEFAULT 'desc',
  p_limit          int     DEFAULT 25,
  p_offset         int     DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  type text,
  status text,
  title text,
  reference text,
  amount_ht numeric,
  amount_ttc numeric,
  currency text,
  third_party_name text,
  third_party_email text,
  issue_date date,
  due_date date,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz,
  retention_until date,
  organization_id uuid,
  organization_name text,
  signers_total bigint,
  signers_signed bigint,
  payments_total numeric,
  has_signed boolean,
  has_payment boolean,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      d.id, d.type::text, d.status::text, d.title, d.reference,
      d.amount_ht, d.amount_ttc, d.currency,
      d.third_party_name, d.third_party_email,
      d.issue_date, d.due_date, d.created_at, d.updated_at,
      d.archived_at, d.retention_until,
      d.organization_id, o.name AS organization_name,
      COALESCE(sr.total, 0)  AS signers_total,
      COALESCE(sr.signed, 0) AS signers_signed,
      COALESCE(pa.paid, 0)   AS payments_total,
      EXISTS (SELECT 1 FROM public.document_signatures s WHERE s.document_id = d.id) AS has_signed,
      EXISTS (SELECT 1 FROM public.document_payments p
              WHERE p.document_id = d.id AND p.status = 'succeeded') AS has_payment
    FROM public.documents d
    LEFT JOIN public.organizations o ON o.id = d.organization_id
    LEFT JOIN LATERAL (
      SELECT count(*)::bigint AS total,
             count(*) FILTER (WHERE status = 'signed')::bigint AS signed
      FROM public.document_signature_requests r WHERE r.document_id = d.id
    ) sr ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(amount), 0)::numeric AS paid
      FROM public.document_payments p
      WHERE p.document_id = d.id AND p.status = 'succeeded'
    ) pa ON TRUE
    WHERE
      (p_organization IS NULL OR d.organization_id = p_organization)
      AND (p_types IS NULL OR d.type::text = ANY(p_types))
      AND (p_statuses IS NULL OR d.status::text = ANY(p_statuses))
      AND (p_currencies IS NULL OR d.currency = ANY(p_currencies))
      AND (p_from_date IS NULL OR d.issue_date >= p_from_date)
      AND (p_to_date   IS NULL OR d.issue_date <= p_to_date)
      AND (p_min_amount IS NULL OR d.amount_ttc >= p_min_amount)
      AND (p_max_amount IS NULL OR d.amount_ttc <= p_max_amount)
      AND (
        p_archived = 'include'
        OR (p_archived = 'only'    AND d.status IN ('archived','cancelled'))
        OR (p_archived = 'exclude' AND d.status NOT IN ('archived','cancelled'))
      )
      AND (
        p_q IS NULL OR p_q = ''
        OR d.title             ILIKE '%' || p_q || '%'
        OR d.reference         ILIKE '%' || p_q || '%'
        OR d.third_party_name  ILIKE '%' || p_q || '%'
        OR d.third_party_email ILIKE '%' || p_q || '%'
        OR EXISTS (
          SELECT 1 FROM public.document_signature_requests r
          WHERE r.document_id = d.id
            AND (r.signer_email ILIKE '%' || p_q || '%' OR r.signer_name ILIKE '%' || p_q || '%')
        )
      )
  ),
  filtered AS (
    SELECT b.* FROM base b
    WHERE
      (p_signature IS NULL OR p_signature = 'any'
        OR (p_signature = 'none'    AND b.signers_total = 0 AND NOT b.has_signed)
        OR (p_signature = 'pending' AND b.signers_total > b.signers_signed)
        OR (p_signature = 'signed'  AND (b.has_signed OR (b.signers_total > 0 AND b.signers_total = b.signers_signed)))
      )
      AND (p_payment IS NULL OR p_payment = 'any'
        OR (p_payment = 'none'    AND b.payments_total = 0)
        OR (p_payment = 'partial' AND b.payments_total > 0 AND b.payments_total < COALESCE(b.amount_ttc, b.amount_ht, 0))
        OR (p_payment = 'paid'    AND b.payments_total > 0 AND b.payments_total >= COALESCE(b.amount_ttc, b.amount_ht, 0))
      )
  ),
  counted AS (
    SELECT f.*, count(*) OVER () AS total_count FROM filtered f
  )
  SELECT * FROM counted
  ORDER BY
    CASE WHEN p_sort = 'created_at' AND p_dir = 'asc'  THEN created_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'created_at' AND p_dir = 'desc' THEN created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'updated_at' AND p_dir = 'asc'  THEN updated_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'updated_at' AND p_dir = 'desc' THEN updated_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'issue_date' AND p_dir = 'asc'  THEN issue_date END ASC NULLS LAST,
    CASE WHEN p_sort = 'issue_date' AND p_dir = 'desc' THEN issue_date END DESC NULLS LAST,
    CASE WHEN p_sort = 'due_date'   AND p_dir = 'asc'  THEN due_date   END ASC NULLS LAST,
    CASE WHEN p_sort = 'due_date'   AND p_dir = 'desc' THEN due_date   END DESC NULLS LAST,
    CASE WHEN p_sort = 'amount_ttc' AND p_dir = 'asc'  THEN amount_ttc END ASC NULLS LAST,
    CASE WHEN p_sort = 'amount_ttc' AND p_dir = 'desc' THEN amount_ttc END DESC NULLS LAST,
    created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.search_documents(
  text, text[], text[], text[], uuid, date, date, numeric, numeric,
  text, text, text, text, text, int, int
) TO authenticated;