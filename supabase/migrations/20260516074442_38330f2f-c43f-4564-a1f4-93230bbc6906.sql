create or replace function public.list_pending_signature_documents(
  p_q text default null,
  p_org uuid default null,
  p_sort text default 'waiting',
  p_dir text default 'asc',
  p_limit int default 25,
  p_offset int default 0
)
returns table(
  document_id uuid,
  document_title text,
  document_reference text,
  document_type text,
  organization_id uuid,
  organization_name text,
  total_signers bigint,
  pending_signers bigint,
  signed_signers bigint,
  declined_signers bigint,
  oldest_pending_at timestamptz,
  earliest_expires_at timestamptz,
  next_signer_name text,
  next_signer_email text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with agg as (
    select
      d.id as document_id,
      d.title as document_title,
      d.reference as document_reference,
      d.type::text as document_type,
      d.organization_id,
      o.name as organization_name,
      count(*) as total_signers,
      count(*) filter (where r.status = 'pending') as pending_signers,
      count(*) filter (where r.status = 'signed') as signed_signers,
      count(*) filter (where r.status in ('declined','cancelled')) as declined_signers,
      min(case when r.status = 'pending' then r.created_at end) as oldest_pending_at,
      min(r.expires_at) as earliest_expires_at
    from public.document_signature_requests r
    join public.documents d on d.id = r.document_id
    left join public.organizations o on o.id = d.organization_id
    group by d.id, d.title, d.reference, d.type, d.organization_id, o.name
    having count(*) filter (where r.status = 'pending') > 0
  ),
  next_signer as (
    select distinct on (r.document_id)
      r.document_id, r.signer_name, r.signer_email
    from public.document_signature_requests r
    where r.status = 'pending'
    order by r.document_id, r.order_index asc, r.created_at asc
  ),
  filtered as (
    select a.*, n.signer_name as next_signer_name, n.signer_email as next_signer_email
    from agg a
    left join next_signer n on n.document_id = a.document_id
    where (p_org is null or a.organization_id = p_org)
      and (
        p_q is null or p_q = '' or
        a.document_title ilike '%' || p_q || '%' or
        coalesce(a.document_reference, '') ilike '%' || p_q || '%' or
        coalesce(a.organization_name, '') ilike '%' || p_q || '%' or
        exists (
          select 1 from public.document_signature_requests r2
          where r2.document_id = a.document_id
            and (r2.signer_name ilike '%' || p_q || '%' or r2.signer_email ilike '%' || p_q || '%')
        )
      )
  ),
  counted as (
    select f.*, count(*) over () as total_count from filtered f
  )
  select
    document_id, document_title, document_reference, document_type,
    organization_id, organization_name,
    total_signers, pending_signers, signed_signers, declined_signers,
    oldest_pending_at, earliest_expires_at,
    next_signer_name, next_signer_email,
    total_count
  from counted
  order by
    case when p_sort = 'waiting' and p_dir = 'asc' then oldest_pending_at end asc nulls last,
    case when p_sort = 'waiting' and p_dir = 'desc' then oldest_pending_at end desc nulls last,
    case when p_sort = 'expires' and p_dir = 'asc' then earliest_expires_at end asc nulls last,
    case when p_sort = 'expires' and p_dir = 'desc' then earliest_expires_at end desc nulls last,
    case when p_sort = 'organization' and p_dir = 'asc' then organization_name end asc nulls last,
    case when p_sort = 'organization' and p_dir = 'desc' then organization_name end desc nulls last,
    case when p_sort = 'document' and p_dir = 'asc' then document_title end asc nulls last,
    case when p_sort = 'document' and p_dir = 'desc' then document_title end desc nulls last
  limit p_limit offset p_offset;
$$;

create or replace function public.pending_signatures_totals()
returns table(documents bigint, pending_signers bigint, organizations bigint, overdue bigint)
language sql stable security invoker set search_path = public
as $$
  with agg as (
    select d.id, d.organization_id,
      count(*) filter (where r.status='pending') as pending_signers,
      min(r.expires_at) as earliest_expires_at
    from public.document_signature_requests r
    join public.documents d on d.id = r.document_id
    group by d.id, d.organization_id
    having count(*) filter (where r.status='pending') > 0
  )
  select coalesce(count(*),0)::bigint as documents,
         coalesce(sum(pending_signers),0)::bigint as pending_signers,
         coalesce(count(distinct organization_id),0)::bigint as organizations,
         coalesce(count(*) filter (where earliest_expires_at < now()),0)::bigint as overdue
  from agg;
$$;

create or replace function public.pending_signatures_orgs()
returns table(organization_id uuid, organization_name text)
language sql stable security invoker set search_path = public
as $$
  select distinct d.organization_id, o.name as organization_name
  from public.document_signature_requests r
  join public.documents d on d.id = r.document_id
  left join public.organizations o on o.id = d.organization_id
  where r.status = 'pending'
  order by o.name nulls last;
$$;