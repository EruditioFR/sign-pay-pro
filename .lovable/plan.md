Contexte : La page `/admin/settings` est actuellement un placeholder "Coming soon". L'utilisateur veut qu'un `admin_client` puisse modifier le nom de son organisation.

Implémentation :

1. **Backend** — Créer `src/lib/organization.functions.ts` avec :
   - `getMyOrganization` : renvoie `id, name, country` de l'organisation de l'utilisateur connecté (via `get_user_org()` ou jointure sur `profiles`).
   - `updateOrganization` : valide Zod (`name: string.min(1).max(120)`) et met à jour `public.organizations` avec `eq('id', callerOrgId)`. La RLS existante (`is_org_admin`) autorise déjà cette modification.

2. **Frontend** — Réécrire `src/routes/_authenticated.admin.settings.tsx` :
   - Charger l'organisation via `useQuery` + `getMyOrganization`.
   - Afficher un formulaire avec :
     - Label "Nom de l'organisation"
     - Input pré-rempli avec le nom actuel
     - Bouton "Enregistrer"
   - Utiliser `useMutation` (ou `useServerFn` direct) pour appeler `updateOrganization`.
   - Feedback `toast` succès/erreur.
   - Invalider `queryKey: ["me"]` pour que le nom affiché dans la sidebar (`AppShell`) se mette à jour sans rechargement.

3. **Traductions** — Ajouter les clés manquantes dans `src/locales/fr.json` et `src/locales/en.json` :
   - `settings.org_name`
   - `settings.save`
   - `settings.saved`
   - `settings.error`

Pas de migration requise : la RLS sur `organizations` autorise déjà les admins à modifier leur org.