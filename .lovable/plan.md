# Mentions légales obligatoires — Devis & Factures

Objectif : guider l'utilisateur à saisir toutes les mentions exigées par l'art. L441-9 du Code de commerce et le CGI, avec validation, pré-remplissage automatique depuis le profil émetteur, et indicateur de conformité.

## Lot 1 — Schéma de base (migration)

Une seule migration ajoute les colonnes manquantes (les colonnes déjà présentes comme `seller_*`, `buyer_*`, `payment_terms`, `delivery_date` sont conservées et réutilisées) :

**`organizations`** (profil émetteur)
- `legal_form`, `share_capital`, `siret`, `rcs_city`, `rm_number`, `naf_code`
- `vat_number`, `vat_regime` (default `'debits'`), `is_autoentrepreneur` (default `false`)
- `iban`, `bic`
- `late_penalty_rate` (default `12.0`), `recovery_indemnity` (default `40.0`)
- `default_payment_terms`, `default_early_discount` (default `'Pas d''escompte pour paiement anticipé'`)

**`documents`** (champs spécifiques au document, complètent `seller_*`/`buyer_*` déjà présents)
- `service_date`, `validity_date`, `transaction_type` (default `'B2B'`)
- `client_delivery_address`, `client_legal_form`, `client_reference`
- `payment_bank_details`, `late_penalty_rate`, `recovery_indemnity` (default `40.0`)
- `early_discount_text`, `advance_paid` (default `0`)
- `header_note`, `footer_note`, `internal_note`, `legal_mentions`

Note : `client_siret` et `client_vat_number` sont déjà disponibles via `buyer_siret`/`buyer_vat_number`.

Politiques RLS : héritées des tables (aucune nouvelle policy nécessaire, seules les colonnes sont ajoutées).

## Lot 2 — Bibliothèque de conformité

Nouveau fichier `src/lib/invoice-compliance.ts` :

```ts
export type ComplianceLevel = 'required' | 'recommended' | 'electronic_2026'
export interface ComplianceCheck {
  field: string; label: string; level: ComplianceLevel;
  satisfied: boolean; message?: string;
}
export function checkInvoiceCompliance(doc, org): ComplianceCheck[]
export function complianceSummary(checks): { status: 'ok'|'partial'|'ko'; required: number; satisfied: number }
export function buildLegalMentions(org, doc): string
```

Règles `required`, `recommended` et `electronic_2026` strictement comme spécifié.
`buildLegalMentions` génère automatiquement le bloc de mentions (forme + capital, RCS/RM, TVA, pénalités, indemnité 40 €, mention auto-entrepreneur art. 293 B).

## Lot 3 — Profil de facturation (Paramètres)

Nouvelle route `/_authenticated/app/settings/billing-profile.tsx` + entrée dans la nav settings :
- Sections : Identité, Adresse, Identifiants légaux, TVA, Coordonnées bancaires, Conditions de paiement par défaut
- Champ `is_autoentrepreneur` qui masque dynamiquement capital + RCS + TVA
- Sauvegarde via une nouvelle server fn `updateOrganizationBilling` (clé `requireSupabaseAuth` + check `is_org_admin`)
- Indicateur de complétude (réutilise `checkInvoiceCompliance` filtré sur champs émetteur)
- Aperçu de l'en-tête tel qu'il apparaîtra sur les documents

## Lot 4 — Stepper 4 étapes (devis & factures)

Nouveau composant partagé `src/components/facturation/DocumentStepper.tsx` utilisé par :
- `_authenticated.app.facturation.devis.$id.edit.tsx`
- `_authenticated.app.facturation.devis.new.tsx`
- `_authenticated.app.facturation.factures.$id.tsx` (mode édition pour brouillons)
- nouvelle route `_authenticated.app.facturation.factures.new.tsx`

Étapes :
1. **Émetteur & Destinataire** — bloc émetteur pré-rempli depuis l'org (modifiable, écrit dans `seller_*`), bloc client (`third_party_*`, `buyer_*`, `client_delivery_address`, `client_legal_form`, `client_reference`)
2. **Informations document** — n° (auto), dates émission/service/échéance/validité, objet, transaction_type, conditions de règlement (modes, IBAN/BIC, taux de pénalité, indemnité 40 €, escompte)
3. **Lignes & Montants** — table existante `InvoiceLineItems` enrichie : `unit`, `vat_exemption_reason` (si exonéré), drag-and-drop (HTML5 natif comme `SendQuoteDialog`), récap TVA par taux depuis `document_vat_breakdown`, sous-total, total HT net, total TTC, acompte, net à payer. Si `org.is_autoentrepreneur` : tous les `vat_rate` forcés à 0, colonnes TVA masquées, mention auto art. 293 B affichée
4. **Mentions & Finalisation** — `header_note`, `footer_note`, `internal_note`, `legal_mentions` (auto-générées par `buildLegalMentions`, éditables), sélection template PDF, `InvoiceComplianceIndicator`, actions "Brouillon" / "Émettre" / "Émettre et envoyer"

Navigation entre étapes via bouton précédent/suivant, libre lorsque le doc est en brouillon.

## Lot 5 — Composant `InvoiceComplianceIndicator`

`src/components/facturation/InvoiceComplianceIndicator.tsx` :
- Badge synthétique 🟢/🟡/🔴 + popover détaillant les checks groupés par niveau
- Variante compacte (page liste) et complète (formulaire / page détail)
- Affiché en haut du stepper et sur la page détail facture

## Lot 6 — Mentions automatiques sur les documents existants

- À l'enregistrement d'un devis/facture, si `legal_mentions` est vide, le pré-remplir via `buildLegalMentions`
- Affichage des mentions calculées dans la page détail (lecture seule si statut ≠ brouillon)

## Détails techniques

- Pas de table `organization_billing_profile` séparée : toutes les colonnes vivent dans `organizations` (cohérent avec l'existant `seller_*` côté `documents`).
- Validation côté serveur via Zod dans `updateOrganizationBilling` et `updateDocument` : `siret` regex 14 chiffres, `vat_number` regex `^[A-Z]{2}[A-Z0-9]{2,12}$`, `iban` regex IBAN.
- Calculs TVA factorisés dans `computeTotals` (déjà présent) ; ajout d'un helper `vatBreakdown(lines)` pour le tableau récap.
- Auto-entrepreneur : helper `applyAutoEntrepreneurMode(lines)` qui force `vat_rate=0`.
- Numérotation : conserve `allocate_document_number` existant ; "Émettre" déclenche la transition `draft → issued` puis appel RPC.
- Tests visuels via `browser--view_preview` après chaque lot.

## Ordre d'exécution

1. Migration (Lot 1) — attendre approbation
2. `invoice-compliance.ts` (Lot 2) + composant indicateur (Lot 5)
3. Page Profil de facturation (Lot 3)
4. Stepper 4 étapes partagé (Lot 4) — branche devis puis factures
5. Mentions automatiques (Lot 6)

## Hors périmètre (à valider ensuite si besoin)

- Génération PDF reformatée intégrant header/footer/legal_mentions
- Migration des organisations existantes pour remplir `legal_form`, `siret` etc. (à faire à la main par l'utilisateur via la nouvelle page Profil)
- Intégration PDP (facturation électronique 2026) — déjà partiellement présente via `einvoice_*`
