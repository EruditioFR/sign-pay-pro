
## Objectif

Permettre à un visiteur non connecté de créer un circuit complet (upload doc, signataires, paiement) et d'y revenir plus tard via un lien magique envoyé par email. À l'inscription avec le même email, ses circuits sont rattachés automatiquement à son nouveau compte.

## Architecture invité

```text
  ┌──────────────┐   email +    ┌──────────────────┐
  │  Visiteur    │── doc PDF ──▶│  /guest/new      │
  │  anonyme     │              │  (formulaire)    │
  └──────────────┘              └────────┬─────────┘
                                         │ crée guest_session + circuit
                                         ▼
                                ┌──────────────────┐
                                │ Email "votre     │
                                │ espace invité"   │
                                │ + lien magique   │
                                └────────┬─────────┘
                                         ▼
                              /guest/{token-session}
                              → liste de SES circuits
                              → suivi, relance, annulation
```

## 1. Modèle de données (migration)

Nouvelle table `guest_sessions` :
- `email` (unique, lowercased)
- `magic_token` (uuid, rotable)
- `token_expires_at` (renouvelé à 30 j à chaque clic, jamais expiré tant que activité)
- `last_seen_at`, `created_at`
- `claimed_by_user_id` (uuid null) — rempli quand un compte est créé/lié avec ce mail
- `claimed_at`

Modification `documents` et `document_workflows` :
- ajouter `guest_session_id uuid null`
- rendre `organization_id` / `created_by` nullables OU créer une "organisation fantôme" par session invité (option retenue ci-dessous : organisation fantôme `is_guest = true` sur `organizations`, pour ne pas réécrire toutes les RLS existantes).

Ajout `organizations.is_guest boolean default false` + `organizations.guest_session_id uuid null`.

GRANTs : `anon` reçoit `SELECT/INSERT/UPDATE` ciblé sur les rangées rattachées à sa session courante (validée côté serverFn par token, pas via auth.uid()).

## 2. Accès par token (pas de RLS pour anon)

Toutes les opérations invité passent par des **server functions publiques** (pas `requireSupabaseAuth`) qui :
1. Reçoivent `magic_token`.
2. Vérifient en base que la session existe, n'est pas révoquée, prolongent `token_expires_at = now() + 30j`, mettent à jour `last_seen_at`.
3. Utilisent `supabaseAdmin` pour lire/écrire UNIQUEMENT les ressources de `guest_session_id = session.id`.

Aucun accès direct depuis le navigateur à Supabase en mode invité → la RLS reste fermée à `anon`. La sécurité repose sur le token (256 bits) + scoping serveur.

## 3. Flux

### Création du premier circuit
- Route publique `/guest/new` (page) : nom, email, upload PDF, signataires, options paiement.
- ServerFn `createGuestCircuit({ email, file, signers, ... })` :
  - `upsert` `guest_sessions` par email, génère/rotate `magic_token`.
  - Crée org fantôme si absente, crée `document`, `document_files`, `document_signature_requests`.
  - Envoie email "Bienvenue, voici votre espace" avec lien `https://…/guest/{magic_token}`.

### Retour sur l'espace
- Route publique `/guest/$token` :
  - ServerFn `getGuestDashboard({ token })` → liste des circuits + statuts.
  - Actions disponibles : relancer un signataire, annuler une invitation, créer un nouveau circuit, télécharger le PDF signé.

### Renvoi du lien
- Page `/guest` (sans token) : champ email → ServerFn `requestGuestMagicLink({ email })` qui re-renvoie le lien si une session existe (silencieux sinon, anti-énumération).

## 4. Paiement

Encaisser nécessite un compte Stripe rattaché. Pour l'invité, deux niveaux :
- **Signature et suivi** : 100 % disponibles sans compte.
- **Encaisser** : on accepte la création du lien de paiement mais l'argent va sur le compte Stripe de la plateforme (compte central) avec note "fonds en attente de réclamation". À l'inscription/réclamation, on demande le RIB/connect Stripe pour transférer. Alternative simple : bloquer l'encaissement effectif tant que pas de compte (afficher CTA "Créez votre compte pour encaisser").

À confirmer avec l'utilisateur en phase build — ici on prévoit l'option "lien de paiement actif, fonds en attente".

## 5. Migration à l'inscription

Trigger dans `handle_new_user` (mis à jour) :
- Cherche `guest_sessions` où `email = NEW.email` et `claimed_by_user_id IS NULL`.
- Pour chaque circuit/doc rattaché à la session : `organization_id := new_org_id`, `created_by := NEW.id`, `guest_session_id := NULL`.
- Supprime l'organisation fantôme (vide).
- Marque la session `claimed_by_user_id = NEW.id, claimed_at = now()`.
- Révoque le `magic_token` (le user passe désormais par l'auth normale).

## 6. Emails (Resend déjà branché)

Trois templates :
- `guest_welcome` (création initiale + lien magique)
- `guest_magic_link` (renvoi sur demande)
- `guest_circuit_update` (signature/paiement reçus — récap)

Utilise `src/lib/email-sender.ts` existant.

## 7. Sécurité / abuse

- Rate-limit côté serverFn sur `requestGuestMagicLink` et `createGuestCircuit` (par IP + par email).
- Tokens 32 octets, regenerables.
- Upload PDF limité (taille, type) et stocké dans bucket `documents` existant sous préfixe `guest/{session_id}/…`.
- Politique Storage : aucun accès direct anon ; les URLs servies via serverFn signée à la volée.

## 8. UI à créer

- `src/routes/guest.new.tsx` — formulaire invité (upload + signataires).
- `src/routes/guest.$token.tsx` — dashboard invité (liste circuits, actions).
- `src/routes/guest.index.tsx` — "j'ai déjà un espace, renvoyez-moi le lien".
- CTA "Continuer sans compte" sur la home (`/`) et `/signup`.
- Bandeau persistant côté invité : "Créez un compte pour sécuriser vos circuits ➜".

## 9. Détails techniques (section dev)

- ServerFns sans middleware d'auth → fichier `src/lib/guest.functions.ts` (PAS sous `src/server/`).
- Validation Zod stricte sur email/token/payloads.
- `supabaseAdmin` pour toutes les écritures + scoping par `guest_session_id`.
- Nouvelle migration : `guest_sessions`, colonnes `guest_session_id` sur `documents`/`document_workflows`/`organizations.is_guest`, mise à jour de `handle_new_user`, GRANTs/RLS (anon : aucune ; authenticated : inchangé).
- Pas de modification des RLS existantes sur `documents` etc. — l'org fantôme garantit l'isolation.

## Hors scope (à valider plus tard)

- Encaissement réel sans compte (versement différé Stripe Connect).
- Limites d'usage (X circuits max en mode invité avant inscription forcée ?).
- Notifications email aux signataires : déjà couvertes par `signature_requests` existant.
