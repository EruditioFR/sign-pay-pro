# E-invoicing (Factur-X / UBL / CII) — PDP-ready

> État actuel : **socle prêt**, pas encore d'intégration PDP active.
> Cette page documente ce qui est en place et ce qui restera à faire le jour
> où l'on branche une Plateforme de Dématérialisation Partenaire (PDP).

## Ce qui est en place

### Schéma base de données

**`organizations`** — identité légale de l'émetteur :
`legal_name`, `legal_form`, `siren`, `siret`, `vat_number`, `naf_code`,
`address_line1/2`, `postal_code`, `city`, `country_code`, `iban`, `bic`, `peppol_id`.

**`documents`** — champs facture + e-invoicing :
- Numérotation / typage : `invoice_number`, `invoice_type_code` (UN/CEFACT 1001 — 380 facture, 381 avoir…), `payment_means_code` (UN/EDIFACT 4461 — 30 virement, 49 prélèvement…), `payment_terms`, `delivery_date`
- Totaux : `total_vat`, `total_discount`
- Avoir / facture corrective : `corrected_invoice_id`
- Snapshot émetteur figé : `seller_legal_name`, `seller_siret`, `seller_vat_number`, `seller_address` (jsonb)
- Acheteur : `buyer_legal_name`, `buyer_siret`, `buyer_vat_number`, `buyer_address` (jsonb), `buyer_chorus_service`, `buyer_peppol_id`
- E-invoicing : `einvoice_format`, `einvoice_profile`, `einvoice_status`, `einvoice_xml_path`, `einvoice_pdp_id`, `einvoice_submitted_at`, `einvoice_last_event_at`, `einvoice_payload`

**`document_invoice_lines`** — lignes de facture (optionnel, profil BASIC+) :
position, description, quantité, unité (UN/ECE Rec 20), prix HT, taux TVA,
catégorie TVA (UNCL5305), remise, totaux ligne.

**`document_vat_breakdown`** — ventilation TVA par taux/catégorie (requise EN 16931) :
`vat_rate`, `vat_category`, `base_ht`, `vat_amount`, `exemption_reason`.

**`einvoice_events`** — journal append-only des transitions de statut
(source `internal` / `pdp` / `chorus_pro` / `peppol`).

### Code

`src/lib/einvoice.ts` — types, codes UN/CEFACT/EDIFACT, table de transitions
de statut e-invoicing, et `checkEinvoiceReadiness()` pour valider les
champs minimaux avant émission.

## Cycle de vie e-invoicing

```
not_applicable ──► draft ──► ready ──► submitted ──► received
                                                      │
                                              ┌───────┴───────┐
                                              ▼               ▼
                                          accepted ────►   rejected
                                              │               │
                                  ┌───────────┼───────┐       │
                                  ▼           ▼       ▼       ▼
                              in_dispute    paid   archived  draft
```

## Ce qui reste pour brancher une PDP

1. **Génération XML Factur-X / UBL / CII** : profil BASIC suffit pour la
   réforme FR. À implémenter dans une server function dédiée
   (`src/lib/einvoice-xml.functions.ts`), à partir de `documents`
   + `document_invoice_lines` + `document_vat_breakdown`. Stocker le résultat
   dans le bucket `documents` et renseigner `einvoice_xml_path`.
2. **Connecteur PDP** : ajouter un secret par PDP (`PDP_API_KEY`, …),
   créer un client dans `src/lib/pdp/*.server.ts`, exposer un server
   route `POST /api/public/einvoice/webhook` qui consomme les statuts PDP
   et insère un `einvoice_events` + met à jour `documents.einvoice_status`.
3. **UI facture** : éditeur de lignes, ventilation TVA, sélection
   profil, bouton « Émettre vers PDP », badge statut e-invoicing (réutiliser
   le pattern de `PaymentStatusBadge`).
4. **Numérotation conforme** : générateur `invoice_number` par organisation
   (séquence annuelle continue, requis FR).
5. **Annuaire Chorus Pro / PEPPOL** : résolution `buyer_chorus_service` /
   `buyer_peppol_id` côté UI.
6. **Archivage légal 10 ans** : déjà couvert par `retention_until` +
   `archived_at` sur `documents`. Marquer `einvoice_status = 'archived'`.

## Choix pragmatiques

- **Tous les nouveaux champs sont nullable.** Aucun document existant
  n'est invalidé ; la valeur par défaut de `einvoice_status` est
  `not_applicable` pour ne pas polluer les statistiques.
- **Pas de table `invoices` séparée.** On reste sur le modèle unifié
  `documents` (type = `invoice`) avec des champs additionnels — évite la
  duplication de logique workflow / paiement / signature.
- **Snapshot émetteur figé sur le document** (`seller_*`) : conformité
  exige les données telles qu'elles étaient à l'émission, même si
  l'organisation change ensuite ses coordonnées.
- **Lignes & ventilation TVA optionnelles** : MVP peut continuer à
  fonctionner avec montants HT/TTC globaux. Elles deviennent obligatoires
  uniquement au moment de la génération XML.
