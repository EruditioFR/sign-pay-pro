## Cahier des charges — Plateforme de signature & paiement de documents

Livrable : un fichier **DOCX** unique, généré via `docx-js`, déposé dans `/mnt/documents/cahier-des-charges_v1.docx` et présenté via `<presentation-artifact>`.

### Structure du document (≈ 20-25 pages)

1. **Page de garde** — titre, date (16 juin 2026), version 1.0
2. **Sommaire** (TOC auto)
3. **Contexte & vision produit**
   - Problème adressé, cible (PME, indépendants, agents immobiliers)
   - Positionnement : alternative souveraine indépendante d'Adobe/DocuSign
   - Format de sortie : PDF uniquement, sans dépendance tierce propriétaire
4. **Personas & parcours utilisateurs**
   - Émetteur, signataire, payeur, administrateur, super-admin multi-tenant
5. **Périmètre fonctionnel — Cible complète (4 sprints)**
   - **Sprint 1 — Fondations** : auth (email + Google + reset), gestion utilisateurs, upload PDF, éditeur WYSIWYG, modèles métier (NDA, contrat de service, bon de commande, location véhicule, devis), vertical agent immobilier, base de données
   - **Sprint 2 — Signature électronique** : signature manuscrite/dessinée, envoi de docs déjà signés, partage à signer (lien + invité), historique, emails automatiques + relances J+3/J+7
   - **Sprint 3 — Paiement** : Stripe intégré, liens de paiement, statut payé/non payé, remboursements, acomptes / paiements partiels
   - **Sprint 4 — Archivage & pilotage** : archivage long terme, audit trail (eIDAS-ready), recherche documentaire, dashboard analytics
6. **Fonctionnalités bonus livrées**
   - Factur-X / e-invoicing PDP, chatbot agent immobilier, workflows multi-étapes, partage invité, super-admin multi-tenant, exports d'activité
7. **Exigences non-fonctionnelles**
   - Performance, sécurité (RLS, rôles séparés, audit), RGPD, accessibilité, i18n FR
8. **Architecture technique (annexe)**
   - Stack : TanStack Start v1 + React 19 + Vite 7 + Tailwind v4
   - Backend : Lovable Cloud (Postgres + Auth + Storage + Edge functions)
   - Paiement : Stripe ; Email : Resend ; PDF : pdf-lib / pdfjs
   - Modèle de données (30 tables) — diagramme simplifié
   - Sécurité : RLS, table `user_roles` + `has_role()`, middleware `requireSupabaseAuth`
9. **État d'avancement (tableau de synthèse)**

   | Sprint | Avancement | Reste à faire |
   |---|---|---|
   | 1 Fondations | ~80 % | reset password, packs modèles métier |
   | 2 Signature | ~90 % | relances auto, audit délivrabilité |
   | 3 Paiement | ~80 % | UI remboursement, acomptes |
   | 4 Archivage | ~90 % | horodatage qualifié eIDAS (optionnel) |

10. **Roadmap restante** — lots 1 à 4 (quick wins → conformité)
11. **Glossaire**

### Mise en forme

- Format US Letter, marges 1", Arial 12pt, titres en bleu sobre (#1E40AF), tableaux avec headers gris clair, TOC cliquable, page de garde sans header/footer, pieds de page numérotés.
- Pas de logo (non fourni).

### Plan d'exécution

1. Créer `/tmp/gen-cdc.js` qui assemble tout le document avec `docx`.
2. Exécuter le script → `/mnt/documents/cahier-des-charges_v1.docx`.
3. QA : convertir en PDF + images via LibreOffice et inspecter chaque page (mise en page, débordements, tableaux).
4. Corriger si besoin → v2, puis livrer via `<presentation-artifact>`.

Validez et je passe en build pour générer le document.