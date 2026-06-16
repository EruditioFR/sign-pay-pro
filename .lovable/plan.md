# Module Facturation — Plan d'implémentation

## Diagnostic (rapide)

Côté backend, tout existe déjà : table `documents` avec `type='quote'|'invoice'`, tables `document_invoice_lines` et `document_vat_breakdown`, `invoice-lifecycle.ts` (state machine + tones), `transitionInvoiceStatus`, `createDocumentPaymentLink`, `PaymentDialog`, `ExportFacturXButton`, `allocate_document_number` (Postgres). Il manque l'UX dédiée et 2-3 server fns d'agrégat. Aucune migration de schéma nécessaire.

La sidebar vit dans `src/components/app-shell.tsx` (fonction `navGroupsForRole`) — on y branche le nouveau groupe.

## Identité visuelle

Token couleur dédié : on ajoute `--facturation` / `--facturation-foreground` dans `src/styles.css` (palette emerald). Toutes les surfaces du module (cards KPI, badges statut, CTAs primaires) consomment ce token, pas un `bg-emerald-600` en dur — pour respecter le design system.

## Livrables par lot (ordre demandé)

### Lot 1 — Sidebar + structure de routes
- Dans `app-shell.tsx`, pour `admin_client` et `user/manager`, ajouter un groupe **Facturation** entre Documents et Workflows :
  - Icône : `Receipt` (lucide), couleur emerald via `text-[hsl(var(--facturation))]` sur l'icône active.
  - 3 entrées : `/app/facturation` (Tableau de bord), `/app/facturation/devis`, `/app/facturation/factures`.
  - Badge sur "Factures" = nombre de factures `sent`+`viewed`+`partially_paid` (via une server fn de comptage, mêmes patterns que `listMyPendingApprovals`).
- Créer les 6 fichiers routes vides (squelettes `createFileRoute` + composant placeholder) :
  - `_authenticated.app.facturation.index.tsx`
  - `_authenticated.app.facturation.devis.index.tsx`
  - `_authenticated.app.facturation.devis.new.tsx`
  - `_authenticated.app.facturation.devis.$id.edit.tsx`
  - `_authenticated.app.facturation.factures.index.tsx`
  - `_authenticated.app.facturation.factures.$id.tsx`

### Lot 2 — Server fns d'agrégat
Nouveau fichier `src/lib/facturation.functions.ts` :
- `listQuotes({ search?, status?, from?, to? })` — wrap `listDocuments` avec `type='quote'`.
- `listInvoices({ search?, status?, from?, to? })` — wrap `listDocuments` avec `type='invoice'`.
- `getFacturationStats()` — 4 KPI sur le mois courant (total facturé, en attente, payé, devis en cours), basé sur `documents` + `document_payments`.
- `createInvoiceFromQuote({ quoteId, dueDate, sendImmediately })` — copie le devis (`documents` + `document_invoice_lines` + `document_vat_breakdown`) en `type='invoice', status='draft'`, écrit `corrected_invoice_id`/équivalent dans une colonne dédiée si présente (sinon `metadata.origin_quote_id`), bascule le devis vers `paid` (= accepté) via `updateDocument`.
- `sendInvoiceToClient({ invoiceId, includeStripeLink, subject?, body? })` — réutilise `createDocumentPaymentLink` si demandé puis `transitionInvoiceStatus` vers `sent`, envoie l'email (réutiliser `email-sender.ts`).

Création de devis/facture en brouillon : on réutilise `createDocument` existant (pas de nouvelle fn `createQuote`).

### Lot 3 — Dashboard `/app/facturation`
- 4 `FacturationKPICards` (composant à créer) consommant `getFacturationStats` — surfaces emerald.
- 2 mini-tableaux côte à côte (Derniers devis / Dernières factures, 5 lignes) avec CTA "+ Nouveau devis" / "+ Nouvelle facture".

### Lot 4 — Liste Devis `/app/facturation/devis`
- Filtres (statut, recherche client, date), tableau colonnes `N° / Client / Date / HT / Statut / Actions`.
- Nouveau composant `QuoteStatusBadge` (tons emerald-friendly distincts du `DocumentStatusBadge`).
- Actions ligne : Aperçu, Modifier (si `draft`), Envoyer (réutilise `ShareLinkDialog` ou nouveau `SendQuoteDialog` léger), **Convertir en facture** (si `sent`/`viewed`), Annuler.

### Lot 5 — Liste Factures `/app/facturation/factures`
- Mêmes patterns. Nouveau composant `InvoiceStatusBadge` qui consomme `INVOICE_STATUS_TONE` (déjà exporté par `invoice-lifecycle.ts`) en mode emerald-first.
- Colonne paiement = `PaymentStatusBadge` existant.
- Actions ligne : Aperçu, Envoyer (`SendInvoiceDialog`), Créer lien Stripe (`createDocumentPaymentLink`), Exporter Factur-X (`ExportFacturXButton`), Marquer payée (`transitionInvoiceStatus → paid`), Archiver (`archiveDocument`).

### Lot 6 — Formulaires Devis (`new` + `$id/edit`)
Stepper horizontal 3 étapes :
- **Étape 1** — Infos générales (numéro auto via `allocate_document_number` au moment de l'émission, dates, objet, client, conditions de paiement).
- **Étape 2** — Lignes éditables (nouveau composant `InvoiceLineItems` + `InvoiceTotals`) avec calcul TVA multi-taux (0/5.5/10/20) et remise globale ; persistance via `document_invoice_lines` + `document_vat_breakdown` (déjà en base).
- **Étape 3** — Note interne, CGV (textarea ou modèle), choix du template PDF (réutilise `pdf_templates`), aperçu PDF, CTA "Brouillon" / "Émettre" (transition `draft → issued`).

### Lot 7 — Conversion Devis → Facture
- `ConvertToInvoiceDialog` : montre le numéro de facture prévisualisé, date, échéance (30j par défaut), toggle "envoyer immédiatement".
- Valide → `createInvoiceFromQuote` → redirige vers `/app/facturation/factures/$id`.

### Lot 8 — Détail Facture `/app/facturation/factures/$id`
**Strictement zéro composant signature** (pas de `MultiSignersDialog`, `SignDocumentDialog`, etc.).
- Colonne gauche (2/3) : viewer PDF (`SignedPdfPreview`/`pdf.functions`) + boutons Télécharger PDF / Exporter Factur-X.
- Colonne droite (1/3) :
  - Statut (`InvoiceStatusBadge`) + `InvoiceTimeline` (nouveau composant : transitions calculées depuis `audit_logs` filtrés par `action='invoice.transition'` qui existe déjà via le trigger `tg_audit_invoice_transition`).
  - Actions contextuelles selon statut courant (utilise `manualNextStatuses` de `invoice-lifecycle.ts`).
  - Bloc Paiement : montant TTC, lien Stripe avec bouton Copier, `PaymentDialog` réutilisé pour saisie manuelle, montant restant dû.
  - Bloc Client : nom/email/adresse + bouton "Envoyer un rappel" (si en retard).
  - Bloc Infos : n° facture, dates, lien vers devis d'origine (via `metadata.origin_quote_id`).

### Lot 9 — Cloisonnement du module Documents existant
- `listDocuments` : ajouter un filtre `excludeTypes?: DocumentType[]` (ou un toggle côté UI) — passé depuis `/app/documents` pour exclure `quote` et `invoice`.
- Sur `/app/documents` : bannière info "Les devis et factures sont dans le module Facturation →" (lien vers `/app/facturation`).
- Sur `/app/documents/new` : retirer les options `quote` et `invoice` du sélecteur de type ; remplacer par un lien vers `/app/facturation/devis/new`.

## Détails techniques

- **Routing** : aucun `_authenticated.app.facturation.tsx` (layout) requis — chaque page est autonome. Les fichiers suivent la convention dot (`facturation.devis.index.tsx`).
- **Data** : tous les loaders/components utilisent le pattern canonique `ensureQueryData` + `useSuspenseQuery`.
- **Numérotation** : déjà gérée par `allocate_document_number` (Postgres) — appelée à l'émission (`draft → issued`).
- **TVA / lignes** : tables existantes — pas de migration. On vérifie juste les GRANTs/RLS au moment d'écrire les server fns (déjà OK d'après le schéma).
- **Couleurs** : un seul token CSS `--facturation` à ajouter ; tout le reste consomme `bg-[hsl(var(--facturation))]` / `text-...` — pas de `emerald-600` en dur.
- **i18n** : nouvelles clés sous `nav_extra.facturation`, `facturation.*` (dashboard/devis/factures/dialogs). FR + EN.

## Hors périmètre (non livré)

- CRM clients (sélecteur avec recherche : saisie libre dans Lot 6, intégration CRM ultérieure).
- Relances automatiques par cron.
- Webhook Stripe (déjà en place via `STRIPE_WEBHOOK_SECRET` — on ne touche pas).
- Modèles d'email personnalisables côté admin (envoi standard FR pour l'instant).

## Validation

Après chaque lot, vérifier :
1. Build propre + types OK.
2. Navigation visible et active state correct sur les 3 entrées Facturation.
3. Une facture créée depuis `/app/facturation/factures/...` n'apparaît PAS dans `/app/documents`, et inversement, un contrat n'apparaît PAS dans Facturation.
4. Conversion devis → facture : devis passe en `paid`, facture créée en `draft` avec mêmes lignes/TVA, redirection OK.
5. Page détail facture : aucun composant signature monté (grep du fichier confirme).
