# Phase E — Conformité & i18n

Objectif : amener DocFlow Pro au niveau « prêt pour audit conformité » (RGPD, eIDAS, Maroc 53-05, FR Factur-X) et utilisable en FR/EN/AR.

Ordre proposé (du moins risqué au plus structurant) :
**12 → 15 → 14 → 16 → 13**

---

## 12. Audit logs systématiques + page de consultation

**État actuel** : table `audit_logs` existe (RLS OK : admin org + super-admin). Quelques triggers écrivent déjà (`document.signed`, `document.rejected`, `document.validated`, `document.payment_recorded`, `document.multi_signed`). Beaucoup d'actions ne sont **pas** loggées : création/modification de document, upload de fichier, génération de lien de partage, création de demande de signature, changement de rôle, modifications de template/workflow, login/logout.

**Travaux** :
- Migration SQL : triggers `AFTER INSERT/UPDATE/DELETE` sur `documents`, `document_files`, `document_share_links`, `document_signature_requests`, `user_roles`, `workflow_templates`, `document_templates`. Helper `log_event(action, resource, metadata)`.
- Server fn `logAuthEvent` appelé depuis `auth-context` sur `SIGNED_IN`/`SIGNED_OUT`/`PASSWORD_RECOVERY` (IP + user-agent via `getRequest()`).
- Capture systématique IP + user-agent côté server fn pour toutes mutations sensibles (signature, partage, paiement).
- Nouvelle route `/_authenticated/app/audit` (admin org) et `/_authenticated/super-admin/audit` (global) avec :
  - Filtres : période, utilisateur, action, ressource, organisation
  - Recherche full-text sur `metadata`
  - Pagination serveur (RPC `list_audit_logs`)
  - Export CSV
- Lien dans `app-shell` (visible si `is_org_admin` ou `is_super_admin`).

**Livrable** : toute action sensible traçable + 1 page consultable.

---

## 15. i18n complète FR/EN/AR (RTL)

**État actuel** : `src/lib/i18n.ts` + `language-switcher.tsx` existent (bootstrap). À vérifier : couverture des clés, support RTL.

**Travaux** :
- Audit des chaînes en dur dans `src/routes/**` et `src/components/**` (script ripgrep). Extraction vers les fichiers de langue (`fr.json`, `en.json`, `ar.json`).
- Ajout des traductions EN et AR pour toutes les clés.
- Support RTL :
  - `<html dir="rtl">` quand `lang === 'ar'` (via `useEffect` au root)
  - Audit des classes Tailwind directionnelles : remplacer `ml-/mr-/pl-/pr-/left-/right-` par leurs équivalents logiques `ms-/me-/ps-/pe-/start-/end-`
  - Vérifier les composants shadcn (Sheet, Dropdown, Toast) pour RTL
- Stockage de la langue dans `profiles.lang` (déjà présent) + cookie pour SSR.
- Format dates/nombres via `Intl.DateTimeFormat` + `Intl.NumberFormat` avec la locale active.
- Switcher accessible dans le header app.

**Livrable** : UI complète en FR/EN/AR, basculement RTL fonctionnel.

---

## 14. Country packs (FR Factur-X + MA loi 53-05) + vérif mentions légales

**État actuel** : `organizations.country` existe. `document_templates` a `legal_mentions`, `vat_number`, `iban`. Aucune vérif automatique.

**Travaux** :
- Nouvelle table `country_packs` (code pays, nom, rules JSONB) + seed FR / MA / DZ / TN.
- Nouvelle table `document_compliance_checks` (document_id, rule_code, status pass/fail/warn, message). Re-générée à chaque update de document.
- Moteur de règles côté server fn (`runComplianceChecks(documentId)`):
  - **FR** : pour `invoice` → SIRET émetteur (numéro 14 chiffres), TVA intracom valide, mentions légales obligatoires (date émission, date échéance, numéro, taux TVA, total HT/TTC), CGV présentes.
  - **MA** : pour `invoice` → ICE émetteur (15 chiffres), IF, RC, mention « facture libellée en dirhams », loi 53-05 pour signatures (vérif certificat).
  - **Universel** : montant > 0, devise valide.
- **Factur-X (FR)** : génération d'un PDF/A-3 avec XML CII embarqué via une librairie pure-JS compatible Worker (à valider — sinon fallback : générer le XML CII en pièce jointe et marquer le doc « Factur-X ready »).
- UI :
  - Sur `/app/documents/$id` : panneau « Conformité » avec checks ✅/⚠️/❌ et bouton « Re-vérifier ».
  - Sur `/admin/settings` : sélecteur de country pack actif + édition des champs légaux (SIRET/ICE/etc.).
  - Bloquer l'envoi en signature si un check critique est ❌ (toggle « strict mode » par org).

**Livrable** : factures conformes FR/MA, vérif automatique, génération Factur-X (ou XML attaché).

**Risque** : Factur-X complet (PDF/A-3 + ZUGFeRD) est complexe sans dépendance native. À discuter : fallback acceptable ou besoin strict ?

---

## 16. RGPD — Export données + droit à l'oubli

**État actuel** : aucun mécanisme.

**Travaux** :
- **Export** : server fn `exportUserData(userId)` (auth = soi-même OU admin org) qui produit un ZIP contenant :
  - `profile.json` (profil + rôles)
  - `documents.json` + fichiers du bucket `documents` que l'utilisateur a créés
  - `signatures.json` (signatures apposées par l'utilisateur)
  - `audit_logs.json` (logs liés à l'utilisateur)
  - `README.md` expliquant le format
  - Téléchargement via URL signée Supabase Storage (bucket `gdpr-exports` créé, expiration 24h).
- **Droit à l'oubli** : server fn `requestAccountDeletion(userId)` :
  - Crée une demande `account_deletion_requests` (statut `pending`, `confirmed`, `executed`)
  - Email de confirmation (token signé)
  - Après confirmation : anonymisation (pas de DELETE direct pour préserver l'audit légal) :
    - `profiles.full_name` → `"Utilisateur supprimé"`, `email` → `deleted-{id}@redacted.local`
    - `document_signatures.signer_name/email` → `"Redacted"`
    - `document_signature_requests.signer_name/email` → idem
    - Suppression des fichiers du bucket `documents` créés par l'utilisateur (sauf si liés à un document signé/archivé légalement — règle de rétention 10 ans à confirmer)
    - Logout forcé + `auth.users.delete()` via service role
  - Trace `audit_logs.action = 'user.deleted'` (anonymisée).
- **Consentement** : à l'inscription, checkbox CGU + politique de confidentialité (table `consent_logs` : user_id, version, accepted_at, ip).
- UI :
  - `/app/profile` : section « Mes données » avec 2 boutons « Exporter mes données » et « Supprimer mon compte » (confirmation 2 étapes).
  - Admin : `/admin/users` page « Demandes de suppression » pour traiter.

**Livrable** : conformité RGPD articles 15 (accès), 17 (oubli), 20 (portabilité).

---

## 13. MFA pour Super Admin / Admin Client

**État actuel** : auth Supabase email/password (+ Google). Pas de MFA.

**Travaux** :
- Activer MFA TOTP côté Supabase (`supabase--configure_auth`).
- Server fn pour vérifier `aal2` (Authenticator Assurance Level 2) sur les routes sensibles.
- Nouvelle route `/_authenticated/app/profile/security` :
  - Si MFA non configuré : QR code (via `supabase.auth.mfa.enroll`) + saisie code 6 chiffres pour activer
  - Liste des facteurs MFA actifs + bouton « Supprimer »
  - Codes de récupération générés à l'activation (10 codes one-shot, stockés hashés dans `mfa_recovery_codes`)
- **Enforcement** :
  - Server fn `requireAAL2` middleware → si user a rôle `super_admin` ou `admin_client` et `aal !== 'aal2'` → throw 403
  - Sur login : si l'utilisateur a un facteur MFA configuré, page intermédiaire `/login/mfa` qui demande le code
  - Si admin sans MFA configuré : bandeau de rappel + bloqueur au bout de N jours (configurable par super-admin)
- Audit log dédié : `mfa.enrolled`, `mfa.disabled`, `mfa.challenge_succeeded`, `mfa.challenge_failed`.

**Livrable** : MFA TOTP obligatoire pour admins.

**Risque** : impacte le flow de login existant — à tester finement.

---

## Découpage en livraisons

Je propose **5 commits/lots séparés** dans l'ordre 12 → 15 → 14 → 16 → 13. Chaque lot est testable indépendamment.

## Questions avant de lancer

1. **Factur-X** : version complète PDF/A-3 obligatoire, ou XML CII attaché suffit pour un MVP ?
2. **Rétention RGPD** : durée légale de conservation des documents signés que vous voulez appliquer (5 ans, 10 ans) ?
3. **MFA** : obligatoire dès le premier login admin, ou délai de grâce de X jours ?
4. **Ordre** : OK pour 12 → 15 → 14 → 16 → 13, ou vous voulez prioriser autrement (ex : MFA en premier pour la sécurité immédiate) ?

Confirmez et je commence par le **lot 12 (audit logs)**.
