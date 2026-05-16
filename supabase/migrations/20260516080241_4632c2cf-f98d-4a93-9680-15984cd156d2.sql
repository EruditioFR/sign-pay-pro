-- Helper pour écrire un événement d'audit
create or replace function public.audit_log_event(
  _organization_id uuid,
  _user_id uuid,
  _action text,
  _resource text,
  _metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(organization_id, user_id, action, resource, metadata)
  values (_organization_id, _user_id, _action, _resource, coalesce(_metadata, '{}'::jsonb));
end;
$$;

-- Trigger générique pour documents
create or replace function public.tg_audit_documents()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_action text; v_meta jsonb; v_org uuid; v_actor uuid;
begin
  v_actor := auth.uid();
  if tg_op = 'INSERT' then
    v_action := 'document.created';
    v_org := new.organization_id;
    v_meta := jsonb_build_object('title', new.title, 'type', new.type, 'status', new.status);
    perform public.audit_log_event(v_org, v_actor, v_action, 'document:'||new.id::text, v_meta);
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.audit_log_event(new.organization_id, v_actor, 'document.status_changed',
        'document:'||new.id::text,
        jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if (new.title, new.amount_ttc, new.amount_ht, new.due_date, new.third_party_email)
       is distinct from (old.title, old.amount_ttc, old.amount_ht, old.due_date, old.third_party_email) then
      perform public.audit_log_event(new.organization_id, v_actor, 'document.updated',
        'document:'||new.id::text,
        jsonb_build_object(
          'changed', (select jsonb_object_agg(k, v) from jsonb_each(
            jsonb_build_object(
              'title', case when new.title is distinct from old.title then jsonb_build_array(old.title, new.title) end,
              'amount_ttc', case when new.amount_ttc is distinct from old.amount_ttc then jsonb_build_array(old.amount_ttc, new.amount_ttc) end,
              'due_date', case when new.due_date is distinct from old.due_date then jsonb_build_array(old.due_date, new.due_date) end
            )
          ) where v is not null)));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.audit_log_event(old.organization_id, v_actor, 'document.deleted',
      'document:'||old.id::text,
      jsonb_build_object('title', old.title, 'type', old.type));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_documents on public.documents;
create trigger audit_documents
after insert or update or delete on public.documents
for each row execute function public.tg_audit_documents();

-- Document files
create or replace function public.tg_audit_document_files()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_actor uuid;
begin
  v_actor := auth.uid();
  if tg_op in ('INSERT','DELETE') then
    select organization_id into v_org from public.documents
      where id = coalesce(new.document_id, old.document_id);
    if tg_op = 'INSERT' then
      perform public.audit_log_event(v_org, v_actor, 'document.file_uploaded',
        'document:'||new.document_id::text,
        jsonb_build_object('file_name', new.file_name, 'version', new.version, 'size', new.size_bytes));
    else
      perform public.audit_log_event(v_org, v_actor, 'document.file_deleted',
        'document:'||old.document_id::text,
        jsonb_build_object('file_name', old.file_name, 'version', old.version));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_document_files on public.document_files;
create trigger audit_document_files
after insert or delete on public.document_files
for each row execute function public.tg_audit_document_files();

-- Share links
create or replace function public.tg_audit_share_links()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_actor uuid;
begin
  v_actor := auth.uid();
  select organization_id into v_org from public.documents
    where id = coalesce(new.document_id, old.document_id);
  if tg_op = 'INSERT' then
    perform public.audit_log_event(v_org, v_actor, 'share_link.created',
      'document:'||new.document_id::text,
      jsonb_build_object('link_id', new.id, 'recipient_email', new.recipient_email,
                         'allow_sign', new.allow_sign, 'allow_pay', new.allow_pay,
                         'expires_at', new.expires_at));
  elsif tg_op = 'UPDATE' and new.revoked_at is not null and old.revoked_at is null then
    perform public.audit_log_event(v_org, v_actor, 'share_link.revoked',
      'document:'||new.document_id::text,
      jsonb_build_object('link_id', new.id));
  elsif tg_op = 'DELETE' then
    perform public.audit_log_event(v_org, v_actor, 'share_link.deleted',
      'document:'||old.document_id::text,
      jsonb_build_object('link_id', old.id));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_share_links on public.document_share_links;
create trigger audit_share_links
after insert or update or delete on public.document_share_links
for each row execute function public.tg_audit_share_links();

-- Signature requests
create or replace function public.tg_audit_signature_requests()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_actor uuid;
begin
  v_actor := auth.uid();
  select organization_id into v_org from public.documents
    where id = coalesce(new.document_id, old.document_id);
  if tg_op = 'INSERT' then
    perform public.audit_log_event(v_org, v_actor, 'signature_request.created',
      'document:'||new.document_id::text,
      jsonb_build_object('request_id', new.id, 'signer_email', new.signer_email,
                         'order_index', new.order_index, 'expires_at', new.expires_at));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.audit_log_event(v_org, v_actor,
      case new.status::text
        when 'signed' then 'signature_request.signed'
        when 'declined' then 'signature_request.declined'
        when 'cancelled' then 'signature_request.cancelled'
        when 'expired' then 'signature_request.expired'
        else 'signature_request.updated'
      end,
      'document:'||new.document_id::text,
      jsonb_build_object('request_id', new.id, 'from', old.status, 'to', new.status,
                         'signer_email', new.signer_email,
                         'decline_reason', new.decline_reason));
  elsif tg_op = 'DELETE' then
    perform public.audit_log_event(v_org, v_actor, 'signature_request.deleted',
      'document:'||old.document_id::text,
      jsonb_build_object('request_id', old.id));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_signature_requests on public.document_signature_requests;
create trigger audit_signature_requests
after insert or update or delete on public.document_signature_requests
for each row execute function public.tg_audit_signature_requests();

-- Roles
create or replace function public.tg_audit_user_roles()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  v_actor := auth.uid();
  if tg_op = 'INSERT' then
    perform public.audit_log_event(new.organization_id, v_actor, 'role.granted',
      'user:'||new.user_id::text,
      jsonb_build_object('role', new.role));
  elsif tg_op = 'DELETE' then
    perform public.audit_log_event(old.organization_id, v_actor, 'role.revoked',
      'user:'||old.user_id::text,
      jsonb_build_object('role', old.role));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_user_roles on public.user_roles;
create trigger audit_user_roles
after insert or delete on public.user_roles
for each row execute function public.tg_audit_user_roles();

-- Workflow templates
create or replace function public.tg_audit_workflow_templates()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  v_actor := auth.uid();
  if tg_op = 'INSERT' then
    perform public.audit_log_event(new.organization_id, v_actor, 'workflow_template.created',
      'workflow_template:'||new.id::text, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' then
    perform public.audit_log_event(new.organization_id, v_actor, 'workflow_template.updated',
      'workflow_template:'||new.id::text,
      jsonb_build_object('name', new.name, 'active', new.active));
  elsif tg_op = 'DELETE' then
    perform public.audit_log_event(old.organization_id, v_actor, 'workflow_template.deleted',
      'workflow_template:'||old.id::text, jsonb_build_object('name', old.name));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_workflow_templates on public.workflow_templates;
create trigger audit_workflow_templates
after insert or update or delete on public.workflow_templates
for each row execute function public.tg_audit_workflow_templates();

-- Document templates (PDF)
create or replace function public.tg_audit_document_templates()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  v_actor := auth.uid();
  if tg_op = 'INSERT' then
    perform public.audit_log_event(new.organization_id, v_actor, 'document_template.created',
      'document_template:'||new.id::text, jsonb_build_object('name', new.name));
  elsif tg_op = 'UPDATE' then
    perform public.audit_log_event(new.organization_id, v_actor, 'document_template.updated',
      'document_template:'||new.id::text,
      jsonb_build_object('name', new.name, 'active', new.active, 'is_default', new.is_default));
  elsif tg_op = 'DELETE' then
    perform public.audit_log_event(old.organization_id, v_actor, 'document_template.deleted',
      'document_template:'||old.id::text, jsonb_build_object('name', old.name));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_document_templates on public.document_templates;
create trigger audit_document_templates
after insert or update or delete on public.document_templates
for each row execute function public.tg_audit_document_templates();

-- Index pour la consultation
create index if not exists idx_audit_logs_org_created on public.audit_logs(organization_id, created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_user on public.audit_logs(user_id);
create index if not exists idx_audit_logs_metadata_gin on public.audit_logs using gin (metadata);

-- RPC de consultation paginée
create or replace function public.list_audit_logs(
  p_org uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_action text default null,
  p_user uuid default null,
  p_resource text default null,
  p_q text default null,
  p_limit int default 50,
  p_offset int default 0
) returns table(
  id uuid,
  created_at timestamptz,
  organization_id uuid,
  organization_name text,
  user_id uuid,
  user_email text,
  user_full_name text,
  action text,
  resource text,
  metadata jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select a.id, a.created_at, a.organization_id, o.name as organization_name,
           a.user_id, p.email as user_email, p.full_name as user_full_name,
           a.action, a.resource, a.metadata
    from public.audit_logs a
    left join public.organizations o on o.id = a.organization_id
    left join public.profiles p on p.id = a.user_id
    where (p_org is null or a.organization_id = p_org)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at <= p_to)
      and (p_action is null or p_action = '' or a.action ilike p_action || '%')
      and (p_user is null or a.user_id = p_user)
      and (p_resource is null or p_resource = '' or a.resource ilike '%' || p_resource || '%')
      and (
        p_q is null or p_q = ''
        or a.action ilike '%' || p_q || '%'
        or coalesce(a.resource, '') ilike '%' || p_q || '%'
        or coalesce(p.email, '') ilike '%' || p_q || '%'
        or coalesce(p.full_name, '') ilike '%' || p_q || '%'
        or a.metadata::text ilike '%' || p_q || '%'
      )
  ),
  counted as (
    select b.*, count(*) over () as total_count from base b
  )
  select * from counted
  order by created_at desc
  limit p_limit offset p_offset;
$$;