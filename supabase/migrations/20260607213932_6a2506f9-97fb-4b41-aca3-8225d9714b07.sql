
-- Guest sessions
CREATE TABLE public.guest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  magic_token uuid NOT NULL DEFAULT gen_random_uuid(),
  token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  claimed_by_user_id uuid,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX guest_sessions_email_unique ON public.guest_sessions (lower(email)) WHERE claimed_by_user_id IS NULL;
CREATE UNIQUE INDEX guest_sessions_token_unique ON public.guest_sessions (magic_token);

GRANT ALL ON public.guest_sessions TO service_role;
ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: all access via service_role from server functions.

CREATE TRIGGER guest_sessions_touch
  BEFORE UPDATE ON public.guest_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Organizations: flag guest orgs
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_session_id uuid REFERENCES public.guest_sessions(id) ON DELETE SET NULL;

-- Documents & workflows: rattachement invité
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS guest_session_id uuid REFERENCES public.guest_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.document_workflows
  ADD COLUMN IF NOT EXISTS guest_session_id uuid REFERENCES public.guest_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_guest_session_idx ON public.documents(guest_session_id);
CREATE INDEX IF NOT EXISTS workflows_guest_session_idx ON public.document_workflows(guest_session_id);

-- Migration auto à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  new_org_id uuid;
  default_org_name text;
  v_guest_session record;
  v_guest_org_id uuid;
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

  -- Récupération de circuits invités déjà créés avec cet email
  select * into v_guest_session
    from public.guest_sessions
    where lower(email) = lower(new.email) and claimed_by_user_id is null
    limit 1;

  if v_guest_session.id is not null then
    -- Trouver l'org fantôme liée à cette session
    select id into v_guest_org_id
      from public.organizations
      where guest_session_id = v_guest_session.id and is_guest = true
      limit 1;

    -- Rattacher les documents et workflows à la nouvelle org
    update public.documents
      set organization_id = new_org_id,
          created_by = new.id,
          guest_session_id = null
      where guest_session_id = v_guest_session.id;

    update public.document_workflows
      set guest_session_id = null
      where guest_session_id = v_guest_session.id;

    -- Marquer la session comme réclamée
    update public.guest_sessions
      set claimed_by_user_id = new.id,
          claimed_at = now(),
          magic_token = gen_random_uuid(),
          token_expires_at = now()
      where id = v_guest_session.id;

    -- Supprimer l'organisation fantôme
    if v_guest_org_id is not null then
      delete from public.organizations where id = v_guest_org_id;
    end if;
  end if;

  return new;
end;
$function$;
