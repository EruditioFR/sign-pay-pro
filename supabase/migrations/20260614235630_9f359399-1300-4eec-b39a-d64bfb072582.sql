create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('business','technical','user')),
  severity text not null check (severity in ('info','warning','error','critical')),
  source text not null,
  code text,
  message text not null,
  fingerprint text,
  context jsonb not null default '{}'::jsonb,
  stack text
);

create index if not exists idx_error_logs_created_at on public.error_logs(created_at desc);
create index if not exists idx_error_logs_org on public.error_logs(organization_id, created_at desc);
create index if not exists idx_error_logs_fingerprint on public.error_logs(fingerprint);

grant select on public.error_logs to authenticated;
grant all on public.error_logs to service_role;

alter table public.error_logs enable row level security;

drop policy if exists "error_logs_select_org_admin" on public.error_logs;
create policy "error_logs_select_org_admin"
on public.error_logs for select to authenticated
using (
  organization_id is not null
  and (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    or public.has_role(auth.uid(), 'admin_client'::app_role)
    or public.has_role(auth.uid(), 'manager'::app_role)
  )
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.organization_id = error_logs.organization_id
  )
);