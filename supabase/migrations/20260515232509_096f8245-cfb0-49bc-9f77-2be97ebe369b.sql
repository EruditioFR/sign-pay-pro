
-- =========================
-- ENUMS
-- =========================
create type public.document_type as enum ('purchase_order', 'quote', 'invoice', 'contract', 'other');
create type public.document_status as enum ('draft', 'pending_validation', 'validated', 'rejected', 'archived');
create type public.workflow_step_status as enum ('pending', 'approved', 'rejected', 'skipped');

-- =========================
-- HELPER FUNCTIONS
-- =========================
create or replace function public.is_org_member(_user_id uuid, _org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = _user_id and organization_id = _org_id
  )
$$;

-- =========================
-- DOCUMENTS
-- =========================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type public.document_type not null default 'other',
  status public.document_status not null default 'draft',
  title text not null,
  reference text,
  description text,
  amount_ht numeric(14,2),
  amount_ttc numeric(14,2),
  currency text not null default 'EUR',
  third_party_name text,
  third_party_email text,
  issue_date date,
  due_date date,
  tags text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  current_workflow_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_documents_org on public.documents(organization_id);
create index idx_documents_status on public.documents(status);
create index idx_documents_type on public.documents(type);
create index idx_documents_created_by on public.documents(created_by);

alter table public.documents enable row level security;

create policy "Membres voient les documents de leur organisation"
on public.documents for select to authenticated
using (organization_id = get_user_org(auth.uid()) or is_super_admin(auth.uid()));

create policy "Membres créent des documents dans leur organisation"
on public.documents for insert to authenticated
with check (organization_id = get_user_org(auth.uid()) and created_by = auth.uid());

create policy "Auteur ou admin met à jour le document"
on public.documents for update to authenticated
using (
  organization_id = get_user_org(auth.uid())
  and (created_by = auth.uid() or is_org_admin(auth.uid(), organization_id))
);

create policy "Admin supprime un document"
on public.documents for delete to authenticated
using (is_org_admin(auth.uid(), organization_id) or is_super_admin(auth.uid()));

create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.touch_updated_at();

-- =========================
-- DOCUMENT FILES (versioned)
-- =========================
create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version int not null default 1,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  is_current boolean not null default true
);

create index idx_document_files_doc on public.document_files(document_id);

alter table public.document_files enable row level security;

create policy "Membres voient les fichiers de leur organisation"
on public.document_files for select to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = document_id
    and (d.organization_id = get_user_org(auth.uid()) or is_super_admin(auth.uid()))
));

create policy "Membres ajoutent des fichiers dans leur organisation"
on public.document_files for insert to authenticated
with check (exists (
  select 1 from public.documents d
  where d.id = document_id
    and d.organization_id = get_user_org(auth.uid())
) and uploaded_by = auth.uid());

create policy "Auteur ou admin met à jour les fichiers"
on public.document_files for update to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = document_id
    and d.organization_id = get_user_org(auth.uid())
    and (d.created_by = auth.uid() or is_org_admin(auth.uid(), d.organization_id))
));

create policy "Auteur ou admin supprime les fichiers"
on public.document_files for delete to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = document_id
    and d.organization_id = get_user_org(auth.uid())
    and (d.created_by = auth.uid() or is_org_admin(auth.uid(), d.organization_id))
));

-- =========================
-- WORKFLOW TEMPLATES
-- =========================
create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  document_type public.document_type,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_workflow_templates_org on public.workflow_templates(organization_id);

alter table public.workflow_templates enable row level security;

create policy "Membres voient les modèles de leur organisation"
on public.workflow_templates for select to authenticated
using (organization_id = get_user_org(auth.uid()) or is_super_admin(auth.uid()));

create policy "Admin gère les modèles de workflow (insert)"
on public.workflow_templates for insert to authenticated
with check (is_org_admin(auth.uid(), organization_id));

create policy "Admin gère les modèles de workflow (update)"
on public.workflow_templates for update to authenticated
using (is_org_admin(auth.uid(), organization_id));

create policy "Admin gère les modèles de workflow (delete)"
on public.workflow_templates for delete to authenticated
using (is_org_admin(auth.uid(), organization_id));

create trigger trg_workflow_templates_updated_at
before update on public.workflow_templates
for each row execute function public.touch_updated_at();

create table public.workflow_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workflow_templates(id) on delete cascade,
  position int not null,
  name text not null,
  approver_role public.app_role,
  approver_user_id uuid references auth.users(id) on delete set null,
  required boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_workflow_template_steps_template on public.workflow_template_steps(template_id);

alter table public.workflow_template_steps enable row level security;

create policy "Membres voient les étapes de modèles de leur org"
on public.workflow_template_steps for select to authenticated
using (exists (
  select 1 from public.workflow_templates t
  where t.id = template_id
    and (t.organization_id = get_user_org(auth.uid()) or is_super_admin(auth.uid()))
));

create policy "Admin gère les étapes (insert)"
on public.workflow_template_steps for insert to authenticated
with check (exists (
  select 1 from public.workflow_templates t
  where t.id = template_id and is_org_admin(auth.uid(), t.organization_id)
));

create policy "Admin gère les étapes (update)"
on public.workflow_template_steps for update to authenticated
using (exists (
  select 1 from public.workflow_templates t
  where t.id = template_id and is_org_admin(auth.uid(), t.organization_id)
));

create policy "Admin gère les étapes (delete)"
on public.workflow_template_steps for delete to authenticated
using (exists (
  select 1 from public.workflow_templates t
  where t.id = template_id and is_org_admin(auth.uid(), t.organization_id)
));

-- =========================
-- DOCUMENT WORKFLOWS (instances)
-- =========================
create table public.document_workflows (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  template_id uuid references public.workflow_templates(id) on delete set null,
  status public.document_status not null default 'pending_validation',
  current_step int not null default 1,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_document_workflows_doc on public.document_workflows(document_id);

alter table public.document_workflows enable row level security;

create policy "Membres voient les workflows de leurs documents"
on public.document_workflows for select to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = document_id
    and (d.organization_id = get_user_org(auth.uid()) or is_super_admin(auth.uid()))
));

create policy "Membres créent un workflow sur un de leurs documents"
on public.document_workflows for insert to authenticated
with check (exists (
  select 1 from public.documents d
  where d.id = document_id
    and d.organization_id = get_user_org(auth.uid())
));

create policy "Système met à jour les workflows (membres org)"
on public.document_workflows for update to authenticated
using (exists (
  select 1 from public.documents d
  where d.id = document_id
    and d.organization_id = get_user_org(auth.uid())
));

create table public.document_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.document_workflows(id) on delete cascade,
  position int not null,
  name text not null,
  approver_role public.app_role,
  approver_user_id uuid references auth.users(id) on delete set null,
  required boolean not null default true,
  status public.workflow_step_status not null default 'pending',
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

create index idx_doc_wf_steps_workflow on public.document_workflow_steps(workflow_id);
create index idx_doc_wf_steps_approver on public.document_workflow_steps(approver_user_id);

alter table public.document_workflow_steps enable row level security;

create policy "Membres voient les étapes de leurs workflows"
on public.document_workflow_steps for select to authenticated
using (exists (
  select 1 from public.document_workflows dw
  join public.documents d on d.id = dw.document_id
  where dw.id = workflow_id
    and (d.organization_id = get_user_org(auth.uid()) or is_super_admin(auth.uid()))
));

create policy "Membres créent des étapes pour leurs workflows"
on public.document_workflow_steps for insert to authenticated
with check (exists (
  select 1 from public.document_workflows dw
  join public.documents d on d.id = dw.document_id
  where dw.id = workflow_id
    and d.organization_id = get_user_org(auth.uid())
));

create policy "Validateur assigné met à jour son étape"
on public.document_workflow_steps for update to authenticated
using (
  exists (
    select 1 from public.document_workflows dw
    join public.documents d on d.id = dw.document_id
    where dw.id = workflow_id
      and d.organization_id = get_user_org(auth.uid())
      and (
        approver_user_id = auth.uid()
        or (approver_role is not null and has_role(auth.uid(), approver_role))
        or is_org_admin(auth.uid(), d.organization_id)
      )
  )
);

-- =========================
-- AUTO ADVANCE / FINISH WORKFLOW
-- =========================
create or replace function public.advance_document_workflow()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_doc_id uuid;
  v_workflow_status public.document_status;
  v_remaining int;
  v_rejected int;
begin
  -- only react to status transitions out of 'pending'
  if new.status = old.status then
    return new;
  end if;

  select dw.document_id into v_doc_id
  from public.document_workflows dw where dw.id = new.workflow_id;

  -- count rejected required + remaining required
  select count(*) into v_rejected from public.document_workflow_steps
  where workflow_id = new.workflow_id and status = 'rejected' and required;

  select count(*) into v_remaining from public.document_workflow_steps
  where workflow_id = new.workflow_id and status = 'pending' and required;

  if v_rejected > 0 then
    update public.document_workflows
      set status = 'rejected', completed_at = now()
      where id = new.workflow_id;
    update public.documents set status = 'rejected', updated_at = now()
      where id = v_doc_id;

    insert into public.audit_logs(organization_id, user_id, action, resource, metadata)
    select d.organization_id, auth.uid(), 'document.rejected', 'document:' || d.id::text,
           jsonb_build_object('workflow_id', new.workflow_id, 'step_id', new.id)
    from public.documents d where d.id = v_doc_id;

  elsif v_remaining = 0 then
    update public.document_workflows
      set status = 'validated', completed_at = now()
      where id = new.workflow_id;
    update public.documents set status = 'validated', updated_at = now()
      where id = v_doc_id;

    insert into public.audit_logs(organization_id, user_id, action, resource, metadata)
    select d.organization_id, auth.uid(), 'document.validated', 'document:' || d.id::text,
           jsonb_build_object('workflow_id', new.workflow_id)
    from public.documents d where d.id = v_doc_id;
  end if;

  return new;
end;
$$;

create trigger trg_advance_document_workflow
after update on public.document_workflow_steps
for each row execute function public.advance_document_workflow();

-- =========================
-- STORAGE BUCKET
-- =========================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Membres lisent les fichiers de leur org"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (
    is_super_admin(auth.uid())
    or (storage.foldername(name))[1] = get_user_org(auth.uid())::text
  )
);

create policy "Membres uploadent dans leur org"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = get_user_org(auth.uid())::text
);

create policy "Membres mettent à jour leurs fichiers"
on storage.objects for update to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = get_user_org(auth.uid())::text
);

create policy "Membres suppriment leurs fichiers"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = get_user_org(auth.uid())::text
);
