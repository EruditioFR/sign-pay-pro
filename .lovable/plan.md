# Bloc 1 — Fondations DocFlow Pro

## Réponse sur le déploiement on-premise

**Lovable Cloud = Supabase managé par Lovable.** L'instance elle-même n'est pas exportable vers un serveur client. **Mais** :

- Supabase est open-source → un client peut héberger sa propre instance (Docker Compose officiel) et obtenir exactement les mêmes APIs.
- Tout ce qu'on construit (schéma SQL, RLS, policies, edge functions, code React) est **100% portable**.
- Pour livrer en on-premise il suffira de : (1) exporter les migrations SQL, (2) déployer le front (Docker/Vercel chez le client), (3) brancher les variables d'env sur le Supabase self-hosted du client.

**Recommandation :** activer Lovable Cloud pour ce projet (rapide, zéro config). On garde une discipline stricte : toutes les modifs DB passent par des migrations versionnées, jamais de dépendance à un service Lovable-spécifique côté code. Le jour du on-prem, on rejoue les migrations sur le Supabase du client.

Si tu refuses cette approche, l'alternative est de connecter dès maintenant un Supabase externe que tu héberges toi-même (plus de friction, mais identique en contenu).

---

## Périmètre du Bloc 1

1. Authentification Supabase (email/password + magic link, MFA optionnel pour Admin)
2. Modèle de données multi-tenant avec RLS strict
3. Système de rôles hiérarchiques (5 niveaux)
4. Layout + navigation des 4 dashboards (Super Admin, Revendeur, Admin Client, Manager+Utilisateur)
5. i18n FR/EN (structure prête, pas de RTL pour l'instant)
6. Page d'accueil publique simple + pages /login, /signup
7. Création du premier tenant à l'inscription (l'inscrit devient Admin Client de son organisation)

**Hors périmètre Bloc 1 :** documents, workflows, signature, paiement, OCR, chatbot, conformité, dashboards analytiques détaillés, intégrations.

---

## Architecture

### Structure des routes (TanStack Start)

```
src/routes/
  __root.tsx                          shell + providers (i18n, auth, query)
  index.tsx                           landing publique
  login.tsx                           connexion
  signup.tsx                          inscription (crée organisation)
  _authenticated.tsx                  garde d'auth + chargement profil
  _authenticated/
    index.tsx                         redirige vers le dashboard du rôle
    super-admin/
      index.tsx                       dashboard super admin (placeholder)
      tenants.tsx                     liste tenants
    reseller/
      index.tsx                       portefeuille clients (placeholder)
    admin/
      index.tsx                       dashboard admin client
      users.tsx                       gestion utilisateurs
      roles.tsx                       gestion rôles personnalisés
      settings.tsx                    paramètres organisation
    app/
      index.tsx                       dashboard utilisateur/manager
      profile.tsx                     profil utilisateur
```

### Schéma DB (migrations SQL Bloc 1 uniquement)

```
-- enum rôles système
create type app_role as enum ('super_admin', 'reseller', 'admin_client', 'manager', 'user');

organizations (
  id uuid pk, name text, country text default 'FR',
  reseller_id uuid null references organizations(id),
  is_reseller bool default false,
  plan text default 'trial', active bool default true,
  created_at timestamptz
)

profiles (
  id uuid pk references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id),
  email text, full_name text, lang text default 'fr',
  created_at timestamptz
)

user_roles (
  id uuid pk, user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id),
  role app_role not null,
  unique(user_id, organization_id, role)
)

audit_logs (
  id uuid pk, organization_id uuid, user_id uuid,
  action text, resource text, metadata jsonb, created_at timestamptz
)
```

### Sécurité (security definer functions)

```
has_role(_user_id uuid, _role app_role) → bool
get_user_org(_user_id uuid) → uuid
is_super_admin(_user_id uuid) → bool
```

Toutes les RLS utilisent ces fonctions (pattern obligatoire — aucune sous-requête sur `user_roles` directement dans une policy pour éviter la récursion).

### RLS résumées

- `organizations` : SELECT si super_admin OR reseller propriétaire OR membre du tenant
- `profiles` : SELECT/UPDATE soi-même ; SELECT pour admin_client du même tenant
- `user_roles` : SELECT membres du même tenant ; INSERT/DELETE par admin_client+
- `audit_logs` : SELECT super_admin (tout) / admin_client (son tenant uniquement)

### Trigger d'inscription

`handle_new_user()` (security definer) : à la création d'un `auth.users`, crée `organizations` + `profiles` + `user_roles` (rôle `admin_client`). Le premier utilisateur d'un tenant en est automatiquement l'admin.

### Flow super_admin et reseller

- Pas de signup public pour ces rôles. Un compte super_admin de seed est créé manuellement (script SQL après mise en place).
- Un super_admin peut promouvoir un user en reseller, ou créer une organisation et y rattacher un admin_client.

---

## Détails techniques

- **Auth :** `supabase.auth.onAuthStateChange` câblé au root, invalidation queries + router.
- **Garde de routes :** `_authenticated.tsx` lit la session via `supabase.auth.getUser()` dans `beforeLoad`, charge profile + roles via server fn protégée par `requireSupabaseAuth`. Redirige `/login` sinon. Sous-gardes `super-admin/`, `reseller/`, `admin/` vérifient le rôle.
- **i18n :** `i18next` + `react-i18next`, JSON par langue dans `src/locales/{fr,en}.json`, sélecteur dans le header, langue persistée dans `profiles.lang`.
- **Design system :** Shadcn déjà installé. On définit dès maintenant les tokens (palette sobre B2B, Inter/JetBrains Mono évité, on prendra une paire pro). Je proposerai 3 directions design avant le build si tu valides.
- **Multi-tenant côté client :** un user peut n'appartenir qu'à une seule organisation pour le Bloc 1 (multi-org reporté).

---

## Livrables Bloc 1

- Migrations SQL complètes (organizations, profiles, user_roles, audit_logs, enum, fonctions, RLS, trigger)
- Pages : landing, login, signup, 4 dashboards squelettes avec navigation par rôle
- Composants : Header avec switch langue + menu user, Sidebar par rôle, Guard d'auth
- Page admin de gestion des utilisateurs (inviter, lister, changer rôle, désactiver) — fonctionnelle
- i18n FR/EN câblé sur toutes les chaînes UI
- Seed SQL pour créer un super_admin de test

## Hors-scope explicites (Bloc 2+)

Documents, upload, workflows, PDF, signature, paiement, notifications, OCR, chatbot, conformité, intégrations, RTL arabe, analytics, dashboards Revendeur/Super Admin riches.

---

## Question avant de lancer

Active-t-on **Lovable Cloud** dès le début du build (recommandé), ou préfères-tu connecter ton propre Supabase ?