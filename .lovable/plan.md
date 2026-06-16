# Audit d'avancement — Plateforme Sign/Pay Pro

Analyse basée sur l'exploration du code (`src/routes`, `src/lib`, `src/components`) et de la base de données (30 tables Supabase). Les statuts utilisent : ✅ Fait & testable · 🟡 Partiel / à consolider · ⚠️ Présent mais non vérifié end-to-end · ❌ Absent.

---

## Sprint 1 — Fondations

| # | Tâche | Statut | Détail / Preuve |
|---|---|---|---|
| 1.1 | Authentification (email/password) | ✅ | `routes/login.tsx`, `signup.tsx`, `lib/auth.functions.ts`, `auth-context.tsx`, layout `_authenticated.tsx` |
| 1.2 | Auth Google / OAuth | 🟡 | Intégration Supabase prête — provider Google à confirmer en config |
| 1.3 | Reset password (`/reset-password`) | ❌ | Aucune route `reset-password.tsx` détectée |
| 1.4 | Gestion des utilisateurs (rôles, admin) | ✅ | `user_roles`, `admin.users.tsx`, `admin.roles.tsx`, `super-admin.*` |
| 1.5 | Multi-tenant / organisations | ✅ | Table `organizations`, `org-users.functions.ts`, `super-admin.tenants.tsx` |
| 1.6 | Upload de documents par l'utilisateur | ✅ | `document-uploader.tsx`, `documents.new.tsx`, `document_files` |
| 1.7 | Format propre plateforme (modèle interne) | ✅ | `document_templates`, `pdf_templates`, `wysiwyg_drafts`, éditeurs WYSIWYG et overlay |
| 1.8 | Création de devis | ✅ | Type devis dans `documents` + `document_invoice_lines` + numérotation |
| 1.9 | Business case — Agent immobilier | 🟡 | `realtor-chatbot.functions.ts`, `business-verticals.ts` — vertical présent, parcours dédié à vérifier |
| 1.10 | Business case — Location de voiture | ⚠️ | Pas de template / vertical dédié identifié |
| 1.11 | Business case — Société de service | 🟡 | Couvert par devis/facture génériques, pas de parcours dédié |
| 1.12 | Business case — Bon de commande / marchandise | ⚠️ | Pas de type "bon de commande" explicite |
| 1.13 | Création de documents — Devis | ✅ | Voir 1.8 |
| 1.14 | Création de documents — NDA | 🟡 | Possible via templates, pas de modèle NDA pré-livré confirmé |
| 1.15 | Création de documents — Factures | ✅ | `invoice-lifecycle.ts`, `document_invoice_lines`, `document_vat_breakdown`, Factur-X (`export-factur-x-button.tsx`, `einvoice-*`) |
| 1.16 | Création de documents — Contrat juridique | 🟡 | Via templates personnalisés, pas de modèle dédié |
| 1.17 | Génération PDF maison (sans Adobe) | ✅ | `pdf.functions.ts`, `generate-pdf-button.tsx`, pipeline interne |
| 1.18 | Base de données (schéma complet) | ✅ | 30 tables, RLS, migrations |

**Avancement Sprint 1 : ~80 %** — fondations solides ; manquent surtout : reset password, modèles métier prêts-à-l'emploi (NDA, contrat, bon de commande, location véhicule).

---

## Sprint 2 — Signature électronique

| # | Tâche | Statut | Détail / Preuve |
|---|---|---|---|
| 2.1 | Signature électronique (capture) | ✅ | `sign-document-dialog.tsx`, `signature_drafts`, `signature-drafts.functions.ts` |
| 2.2 | Multi-signataires | ✅ | `multi-signers-dialog.tsx`, `document_signature_requests` |
| 2.3 | Workflow / ordre de signature | ✅ | `document_workflows`, `workflow_template_steps`, `workflow-timeline.tsx` |
| 2.4 | Envoi de documents déjà signés | ✅ | Upload + `submit-document-button.tsx` |
| 2.5 | Partage de documents à signer (liens) | ✅ | `share-link-dialog.tsx`, `document_share_links`, routes `s.$token`, `p.$token`, `guest.$token` |
| 2.6 | Signature invité (sans compte) | ✅ | `guest_sessions`, `guest.*.tsx`, `guest-approvals.functions.ts` |
| 2.7 | Historique des signatures | ✅ | `document_signatures`, `signatures-overview.functions.ts`, `signature-integrity-panel.tsx` |
| 2.8 | Vérification d'intégrité / conformité | ✅ | `signature-conformity.ts`, `signature-verification.functions.ts` |
| 2.9 | Étape "Configurer signataires & paiement" après création | ✅ | Route `documents.$id.configure.tsx` créée récemment |
| 2.10 | Affichage signature dans l'éditeur (refresh) | ✅ | Récemment corrigé dans `documents.$id.editor.tsx` (polling 15 s + bandeau) |
| 2.11 | Emails automatiques (invitation signature) | 🟡 | `signature-notifications.server.ts`, `email-sender.ts` présents — délivrabilité / template à vérifier en prod |
| 2.12 | Emails automatiques (relances, complétion) | ⚠️ | Relances automatiques non confirmées dans le code |

**Avancement Sprint 2 : ~90 %** — fonctionnalité cœur livrée ; reste à fiabiliser/auditer la chaîne email (relances).

---

## Sprint 3 — Paiement

| # | Tâche | Statut | Détail / Preuve |
|---|---|---|---|
| 3.1 | Paiement intégré (Stripe) | ✅ | `stripe-client.server.ts`, `payment-dialog.tsx`, `pay.success.tsx`, `pay.cancelled.tsx` |
| 3.2 | Liens de paiement | ✅ | `stripe-payment-links.functions.ts` |
| 3.3 | Webhooks Stripe | ✅ | `stripe_webhook_events`, route `api/public/*` |
| 3.4 | Statut payé / non payé | ✅ | `payment-status.ts`, `payment-status-badge.tsx`, `document_payments` |
| 3.5 | Notifications paiement (email) | 🟡 | `payment-notifications.server.ts` — à valider end-to-end |
| 3.6 | Remboursements / annulations | ⚠️ | Outils Stripe disponibles, UI dédiée non identifiée |
| 3.7 | Paiements partiels / acomptes | ❌ | Non détecté |

**Avancement Sprint 3 : ~80 %** — flow Stripe nominal complet ; manquent cas avancés (remboursement, acompte).

---

## Sprint 4 — Archivage & pilotage

| # | Tâche | Statut | Détail / Preuve |
|---|---|---|---|
| 4.1 | Archivage de documents | ✅ | `archive-actions.tsx`, statuts dans `documents` |
| 4.2 | Audit trail | ✅ | Table `audit_logs`, `audit-logs.functions.ts`, route `app.audit.tsx`, `document-activity-pdf-button.tsx` |
| 4.3 | Export audit (PDF/CSV) | ✅ | `activity-exports-menu.tsx`, `exports.functions.ts` |
| 4.4 | Recherche documentaire | ✅ | `documents-search.functions.ts`, `document-filters-bar.tsx`, `filter-presets.ts` |
| 4.5 | Dashboard utilisateur | ✅ | `_authenticated.dashboard.tsx`, `dashboard/`, `dashboard.functions.ts` |
| 4.6 | Analytics avancés | ✅ | `app.analytics.tsx`, `analytics.functions.ts` |
| 4.7 | Dashboard admin / super-admin | ✅ | `admin.index.tsx`, `super-admin.index.tsx`, `reseller.index.tsx` |
| 4.8 | Logs d'erreur / observabilité | ✅ | `error_logs`, `error-capture.ts`, `observability.server.ts` |
| 4.9 | Rétention légale / horodatage qualifié | ⚠️ | Conformité eIDAS avancée non confirmée |
| 4.10 | Export comptable / e-invoice (Factur-X / PDP) | ✅ | `einvoice-*`, `pdp/`, `admin.pdp-queue.tsx`, `einvoice_transmissions` — bonus hors scope initial |

**Avancement Sprint 4 : ~90 %** — pilotage et archivage solides ; e-invoicing en bonus.

---

## Synthèse globale

| Sprint | Avancement estimé | Blocages restants |
|---|---|---|
| 1 — Fondations | ~80 % | Reset password, modèles métier (NDA, contrat, bon de commande, location voiture) |
| 2 — Signature | ~90 % | Relances email auto, audit délivrabilité |
| 3 — Paiement | ~80 % | Remboursements UI, acomptes / paiements partiels |
| 4 — Archivage & pilotage | ~90 % | Horodatage qualifié eIDAS (si requis) |
| **Global** | **~85 %** | Voir ci-dessus |

Bonus livrés non prévus initialement : Factur-X / e-invoicing PDP, chatbot agent immobilier, workflows multi-étapes, partage invité, super-admin multi-tenant, exports d'activité.

---

## Prochaines actions recommandées (à arbitrer)

1. **Combler Sprint 1** : route `/reset-password`, packs de modèles métier (NDA, contrat de service, bon de commande, contrat location véhicule).
2. **Finaliser Sprint 2** : relances email automatiques (J+3, J+7) + test de délivrabilité.
3. **Compléter Sprint 3** : UI remboursement, gestion acompte / paiement partiel.
4. **Durcir Sprint 4** : décider conformité eIDAS (horodatage qualifié, archivage à valeur probante) si cible réglementaire.

Souhaitez-vous que je détaille un sprint en particulier, ou que je transforme un des "❌ / ⚠️" en plan d'implémentation ?
