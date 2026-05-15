# Bloc 3 — Édition, signature, envoi & paiement

## Périmètre

Transformer un document validé en pièce officielle : génération PDF depuis template, envoi au tiers, signature électronique (signature dessinée + horodatage + preuve), et collecte de paiement via un lien public sécurisé (sans compte).

### Inclus
1. **Templates PDF** par organisation et par type (header/footer, logo, mentions légales, IBAN, CGV)
2. **Génération PDF** d'un document validé (devis, facture, bon de commande, contrat)
3. **Envoi au tiers** : génération d'un lien public signé (token UUID + expiration)
4. **Page publique** `/p/{token}` : visualisation du PDF, signature, paiement — sans compte
5. **Signature électronique simple** : canvas, IP, user-agent, horodatage, hash du PDF signé → stocké comme nouvelle version + entrée `signatures`
6. **Paiement** : enregistrement d'un paiement (montant, devise, méthode, statut) — provider abstrait, MVP avec marquage manuel "payé" + intégration Stripe Checkout en option
7. **Statuts étendus** : `sent`, `signed`, `paid`, `partially_paid`
8. **Notifications email** au tiers (envoi du lien) — via Lovable Cloud (Resend) si dispo, sinon log
9. **Audit complet** de chaque action publique (vue, signature, paiement)
10. **i18n FR/EN** sur toutes les nouvelles chaînes + page publique localisée

### Hors-scope (Blocs ultérieurs)
- Signature qualifiée eIDAS (DocuSign, Yousign)
- OCR / extraction automatique de factures reçues
- Comptabilité, exports SAGE/FEC
- Chatbot, intégrations CRM
- Multi-signataires séquentiels (MVP = 1 signataire = le tiers du document)

---

## Schéma DB (migration)

```
-- enums étendus
alter type document_status add value 'sent';
alter type document_status add value 'signed';
alter type document_status add value 'paid';
alter type document_status add value 'partially_paid';

-- templates PDF par organisation
document_templates (
  id, organization_id, name, document_type,
  logo_url text, primary_color text,
  header_html text, footer_html text,
  legal_mentions text, payment_terms text,
  iban text, bic text, vat_number text,
  active bool, created_at, updated_at
)

-- liens publics signés (envoi tiers)
document_share_links (
  id, document_id, token uuid unique,
  recipient_email text, recipient_name text,
  expires_at timestamptz, max_views int,
  view_count int default 0,
  allow_sign bool, allow_pay bool,
  revoked_at timestamptz null,
  created_by uuid, created_at
)

-- signatures
document_signatures (
  id, document_id, share_link_id,
  signer_name text, signer_email text,
  signature_image_b64 text,  -- PNG canvas
  signed_at timestamptz, ip text, user_agent text,
  pdf_hash_sha256 text,       -- hash du PDF signé
  pdf_storage_path text       -- nouvelle version stockée
)

-- paiements
document_payments (
  id, document_id, share_link_id null,
  amount numeric, currency text,
  method text,                -- 'manual' | 'stripe' | 'bank_transfer'
  status text,                -- 'pending' | 'succeeded' | 'failed' | 'refunded'
  provider_ref text,          -- id Stripe etc.
  paid_at timestamptz, recorded_by uuid null,
  metadata jsonb
)
```

### Sécurité
- RLS standard sur tables internes (isolation org).
- `document_share_links` : SELECT public via `token` UNIQUEMENT (policy `using (true)` filtrée par token côté server fn `getPublicDocument`), INSERT/UPDATE org-scoped.
- Vérif `expires_at > now()` et `revoked_at is null` et `view_count < max_views` dans la server fn publique.
- Bucket storage `signed-documents` privé, accès via URL signée 5 min même côté public (le server fn génère).
- Trigger : MAJ `documents.status` automatique sur insert signature → `signed`, sur insert payment succeeded → `paid` ou `partially_paid` selon somme.
- Toutes les actions publiques (view/sign/pay) loggées dans `audit_logs` avec `user_id = null` et metadata IP/UA.

---

## Server Functions (TanStack)

`src/lib/templates.functions.ts`
- `listDocumentTemplates`, `getDocumentTemplate`, `createDocumentTemplate`, `updateDocumentTemplate`, `deleteDocumentTemplate`

`src/lib/pdf.functions.ts`
- `generateDocumentPdf({ documentId, templateId? })` — render HTML → PDF, upload comme nouvelle `document_files` version, retourne signedUrl
  - Stack PDF : `@react-pdf/renderer` (pure JS, compatible Workers) — composants React → PDF directement (pas de chrome/puppeteer interdits sur Workers)

`src/lib/sharing.functions.ts`
- `createShareLink({ documentId, recipient, expiresInDays, allowSign, allowPay })` — protégée
- `revokeShareLink({ id })`
- `sendShareLinkEmail({ shareLinkId })` — envoi via Resend (si secret dispo) sinon retourne URL à copier

## Server Routes publiques (pas d'auth)

`src/routes/api/public/share/$token.ts`
- GET → métadonnées document (titre, montant, tiers, PDF signedUrl), incrémente `view_count`
- POST (action=sign) → enregistre signature + génère PDF signé
- POST (action=pay) → crée un `document_payments` pending + (option) Stripe Checkout session

`src/routes/p.$token.tsx` (route publique React)
- Page mobile-first : viewer PDF + bouton "Signer" + bouton "Payer"
- Pas de sidebar, pas d'auth, layout dédié

---

## Routes ajoutées

```
src/routes/
  _authenticated.admin.templates.index.tsx     liste templates PDF
  _authenticated.admin.templates.new.tsx
  _authenticated.admin.templates.$id.tsx
  _authenticated.app.documents.$id.tsx         + bouton "Générer PDF", "Envoyer", liste signatures/paiements
  p.$token.tsx                                  page publique (signature + paiement)
  api/public/share.$token.ts                    endpoint REST public
```

Sidebar admin : ajout "Modèles PDF".
Page document : 3 nouvelles actions selon statut → Générer PDF (validated) → Envoyer (avec PDF) → suivi signature/paiement.

---

## Composants UI

- `DocumentTemplateEditor` : form + preview live (logo, couleurs, mentions)
- `PdfPreview` : iframe URL signée
- `ShareLinkDialog` : email destinataire, options, copie du lien généré
- `SignaturePad` : `react-signature-canvas` (compatible web + mobile, pure JS)
- `PaymentDialog` : montant, méthode, marquage manuel (MVP) ou Stripe
- `PublicDocumentPage` : layout dédié mobile-first, viewer + actions
- `DocumentActionBar` mis à jour avec génération PDF + envoi

---

## Choix techniques

- **PDF** : `@react-pdf/renderer` (works in Cloudflare Workers, pure JS, ~600 ko)
- **Signature** : canvas HTML5 (`react-signature-canvas`), PNG base64 incrusté dans le PDF
- **Paiement MVP** : marquage manuel "payé" par l'org + champ pour ref bancaire. Si secret `STRIPE_SECRET_KEY` présent → bouton "Payer par carte" qui crée une Checkout Session ; webhook `/api/public/webhooks/stripe` met à jour le paiement. Demander la clé seulement si l'utilisateur veut activer Stripe (sinon mode manuel).
- **Email** : si Resend configuré (Lovable Cloud Email) → envoi auto ; sinon affichage du lien à copier
- **Page publique RTL-ready** : déjà préparée pour l'arabe via locale URL

---

## Plan d'exécution

1. Migration SQL : enums étendus, 4 nouvelles tables, RLS, triggers, bucket `signed-documents`
2. `bun add @react-pdf/renderer react-signature-canvas`
3. Server fns templates + PDF + sharing
4. Route publique `/p/$token` + endpoint `/api/public/share/$token`
5. UI admin templates + actions document (générer/envoyer/suivre)
6. SignaturePad + flux signature complet (hash, audit, nouvelle version)
7. PaymentDialog mode manuel ; Stripe optionnel derrière secret
8. i18n FR/EN
9. Vérifications : compilation, lint Supabase, parcours bout-en-bout (créer → valider → générer PDF → envoyer → signer côté public → payer)

---

## Questions

1. **Paiement** : on part en MVP **manuel** (marquage "payé" + ref bancaire) avec Stripe en option si tu fournis la clé plus tard, OK ?
2. **Email** : tu as déjà un domaine vérifié pour Resend ou on log juste le lien à copier au départ ?
3. **Templates PDF** : un template "par défaut" auto-créé par organisation, ou laisser l'admin créer le sien ?
