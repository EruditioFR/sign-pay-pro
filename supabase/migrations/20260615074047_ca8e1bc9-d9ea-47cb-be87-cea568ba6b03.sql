
-- =====================================================================
-- DURCISSEMENT RLS — Correctifs d'audit
-- =====================================================================
-- 1. profiles : empêcher le saut d'organisation (org-hopping)
-- 2. user_roles : empêcher l'escalade de privilèges vers super_admin
-- 3. organizations : verrouiller les colonnes sensibles en UPDATE
-- 4. documents : verrouiller organization_id en UPDATE
-- 5. audit_logs : contraindre l'INSERT à l'org de l'utilisateur
-- =====================================================================

-- ---------- 1. profiles : UPDATE avec WITH CHECK ----------
DROP POLICY IF EXISTS "Utilisateur met à jour son propre profil" ON public.profiles;
CREATE POLICY "Utilisateur met à jour son propre profil"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  -- on interdit le changement d'organisation_id par l'utilisateur lui-même
  AND organization_id = public.get_user_org(auth.uid())
);

DROP POLICY IF EXISTS "Admins peuvent gérer les profils de leur organisation" ON public.profiles;
CREATE POLICY "Admins peuvent gérer les profils de leur organisation"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.is_org_admin(auth.uid(), organization_id))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_org_admin(auth.uid(), organization_id));

-- ---------- 2. user_roles : prévention privilege escalation ----------
DROP POLICY IF EXISTS "Admins peuvent attribuer des rôles dans leur organisation" ON public.user_roles;
CREATE POLICY "Admins peuvent attribuer des rôles dans leur organisation"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  -- super_admin peut tout faire
  public.is_super_admin(auth.uid())
  OR (
    -- org admin peut attribuer des rôles UNIQUEMENT :
    --   * dans sa propre org
    --   * à un user déjà membre de cette org
    --   * pour un rôle != super_admin (anti-escalade)
    public.is_org_admin(auth.uid(), organization_id)
    AND role <> 'super_admin'::public.app_role
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.organization_id = user_roles.organization_id
    )
  )
);

DROP POLICY IF EXISTS "Admins peuvent retirer des rôles dans leur organisation" ON public.user_roles;
CREATE POLICY "Admins peuvent retirer des rôles dans leur organisation"
ON public.user_roles FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.is_org_admin(auth.uid(), organization_id)
    AND role <> 'super_admin'::public.app_role
  )
);

-- ---------- 3. organizations : WITH CHECK sur UPDATE ----------
DROP POLICY IF EXISTS "Admins peuvent modifier leur organisation" ON public.organizations;
CREATE POLICY "Admins peuvent modifier leur organisation"
ON public.organizations FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.is_org_admin(auth.uid(), id))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_org_admin(auth.uid(), id));

-- Verrou : un admin client ne doit pas pouvoir changer reseller_id / is_guest / guest_session_id
CREATE OR REPLACE FUNCTION public.tg_organizations_guard_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.reseller_id IS DISTINCT FROM OLD.reseller_id
     OR NEW.is_guest IS DISTINCT FROM OLD.is_guest
     OR NEW.guest_session_id IS DISTINCT FROM OLD.guest_session_id THEN
    RAISE EXCEPTION 'Champs réservés : reseller_id / is_guest / guest_session_id non modifiables'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_guard_sensitive ON public.organizations;
CREATE TRIGGER organizations_guard_sensitive
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.tg_organizations_guard_sensitive_fields();

-- ---------- 4. documents : verrouillage organization_id ----------
DROP POLICY IF EXISTS "Auteur ou admin met à jour le document" ON public.documents;
CREATE POLICY "Auteur ou admin met à jour le document"
ON public.documents FOR UPDATE TO authenticated
USING (
  organization_id = public.get_user_org(auth.uid())
  AND (created_by = auth.uid() OR public.is_org_admin(auth.uid(), organization_id))
)
WITH CHECK (
  organization_id = public.get_user_org(auth.uid())
  AND (created_by = auth.uid() OR public.is_org_admin(auth.uid(), organization_id))
);

-- ---------- 5. audit_logs : contrainte d'org sur INSERT ----------
DROP POLICY IF EXISTS "Système peut écrire des logs" ON public.audit_logs;
CREATE POLICY "Membres écrivent des logs dans leur org"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR organization_id = public.get_user_org(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
);

-- =====================================================================
-- RAPPORT DE DURCISSEMENT
-- =====================================================================
-- ✅ profiles    : organization_id ne peut plus être modifié par l'utilisateur
-- ✅ user_roles  : impossible pour un admin_client d'auto-attribuer super_admin
--                  ; cible obligatoirement membre de l'org
-- ✅ organizations : WITH CHECK + trigger qui verrouille reseller_id/is_guest
-- ✅ documents   : WITH CHECK empêche le transfert vers une autre org
-- ✅ audit_logs  : INSERT scopé à l'org de l'utilisateur
-- Routes publiques (share/sign-request) : déjà sécurisées via service role
-- + validation token (audit précédent)
-- =====================================================================
