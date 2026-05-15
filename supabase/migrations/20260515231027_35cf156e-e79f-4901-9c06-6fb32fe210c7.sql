
-- ============================================================
-- DOCFLOW PRO - BLOC 1 : FONDATIONS MULTI-TENANT
-- ============================================================

-- Enum des rôles applicatifs
create type public.app_role as enum (
  'super_admin',
  'reseller',
  'admin_client',
  'manager',
  'user'
);

-- ============================================================
-- TABLES
-- ============================================================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'FR',
  reseller_id uuid references public.organizations(id) on delete set null,
  is_reseller boolean not null default false,
  plan text not null default 'trial',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_organizations_reseller on public.organizations(reseller_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  email text not null,
  full_name text,
  lang text not null default 'fr',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_org on public.profiles(organization_id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, organization_id, role)
);

create index idx_user_roles_user on public.user_roles(user_id);
create index idx_user_roles_org on public.user_roles(organization_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_org on public.audit_logs(organization_id);
create index idx_audit_logs_created on public.audit_logs(created_at desc);

-- ============================================================
-- SECURITY DEFINER FUNCTIONS (anti-récursion RLS)
-- ============================================================

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_super_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = 'super_admin'
  )
$$;

create or replace function public.get_user_org(_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = _user_id
$$;

create or replace function public.is_org_admin(_user_id uuid, _org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and organization_id = _org_id
      and role in ('admin_client', 'super_admin')
  )
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Mise à jour automatique de updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated
  before update on public.organizations
  for each row execute function public.touch_updated_at();

create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- À l'inscription : créer organisation + profil + rôle admin_client
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  default_org_name text;
begin
  default_org_name := coalesce(
    new.raw_user_meta_data->>'organization_name',
    split_part(new.email, '@', 2),
    'Mon organisation'
  );

  insert into public.organizations (name, country)
  values (default_org_name, coalesce(new.raw_user_meta_data->>'country', 'FR'))
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, email, full_name, lang)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'lang', 'fr')
  );

  insert into public.user_roles (user_id, organization_id, role)
  values (new.id, new_org_id, 'admin_client');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS POLICIES
-- ============================================================

alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.user_roles    enable row level security;
alter table public.audit_logs    enable row level security;

-- ORGANIZATIONS
create policy "Super admins peuvent tout voir des organisations"
  on public.organizations for select
  to authenticated
  using (public.is_super_admin(auth.uid()));

create policy "Membres peuvent voir leur organisation"
  on public.organizations for select
  to authenticated
  using (id = public.get_user_org(auth.uid()));

create policy "Revendeurs peuvent voir leurs clients"
  on public.organizations for select
  to authenticated
  using (
    reseller_id = public.get_user_org(auth.uid())
    and public.has_role(auth.uid(), 'reseller')
  );

create policy "Super admins peuvent créer des organisations"
  on public.organizations for insert
  to authenticated
  with check (public.is_super_admin(auth.uid()));

create policy "Admins peuvent modifier leur organisation"
  on public.organizations for update
  to authenticated
  using (
    public.is_super_admin(auth.uid())
    or public.is_org_admin(auth.uid(), id)
  );

create policy "Super admins peuvent supprimer des organisations"
  on public.organizations for delete
  to authenticated
  using (public.is_super_admin(auth.uid()));

-- PROFILES
create policy "Utilisateur voit son propre profil"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Membres voient les profils de leur organisation"
  on public.profiles for select
  to authenticated
  using (organization_id = public.get_user_org(auth.uid()));

create policy "Super admins voient tous les profils"
  on public.profiles for select
  to authenticated
  using (public.is_super_admin(auth.uid()));

create policy "Utilisateur met à jour son propre profil"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

create policy "Admins peuvent gérer les profils de leur organisation"
  on public.profiles for update
  to authenticated
  using (
    public.is_super_admin(auth.uid())
    or public.is_org_admin(auth.uid(), organization_id)
  );

-- USER_ROLES
create policy "Membres voient les rôles de leur organisation"
  on public.user_roles for select
  to authenticated
  using (
    organization_id = public.get_user_org(auth.uid())
    or user_id = auth.uid()
    or public.is_super_admin(auth.uid())
  );

create policy "Admins peuvent attribuer des rôles dans leur organisation"
  on public.user_roles for insert
  to authenticated
  with check (
    public.is_super_admin(auth.uid())
    or public.is_org_admin(auth.uid(), organization_id)
  );

create policy "Admins peuvent retirer des rôles dans leur organisation"
  on public.user_roles for delete
  to authenticated
  using (
    public.is_super_admin(auth.uid())
    or public.is_org_admin(auth.uid(), organization_id)
  );

-- AUDIT_LOGS
create policy "Super admins voient tous les logs"
  on public.audit_logs for select
  to authenticated
  using (public.is_super_admin(auth.uid()));

create policy "Admins voient les logs de leur organisation"
  on public.audit_logs for select
  to authenticated
  using (public.is_org_admin(auth.uid(), organization_id));

create policy "Système peut écrire des logs"
  on public.audit_logs for insert
  to authenticated
  with check (user_id = auth.uid());
