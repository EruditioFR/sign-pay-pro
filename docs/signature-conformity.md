# Conformité signature électronique — sign-pay-pro

> Version du module : `2026.06.01` — Niveau couvert aujourd'hui : **SES**
> (Signature Électronique Simple — eIDAS art. 25 §1, Code civil art. 1366 & 1367).

## 1. Niveaux eIDAS et stratégie produit

| Niveau | Statut | Mécanique cible |
|--------|--------|-----------------|
| **SES** (Simple) | ✅ Couvert | Lien email unique, consentement explicite, horodatage serveur, hash SHA-256, journal d'événements. |
| **AES** (Avancée) | 🛠️ Architecture prête | Second facteur (OTP), certificat éphémère, PAdES, horodatage qualifié RFC 3161. |
| **QES** (Qualifiée) | ⏳ Roadmap | Certificat qualifié émis par un PSCo, KYC strict. |

Source de vérité TS : [`src/lib/signature-conformity.ts`](../src/lib/signature-conformity.ts)
(`SIGNATURE_LEVELS`, `SES_TO_AES_GAPS`).

## 2. Parcours SES actuel (étape par étape)

1. L'auteur crée une `document_signature_requests` (token UUID, `signature_level = 'ses'`,
   `auth_method_required = 'email_link'`).
2. Le signataire reçoit le lien `/s/<token>` — l'authentification SES repose sur la
   possession exclusive de cette URL à usage unique (eIDAS niveau 1).
3. La page publique affiche : identité du signataire, document, **case de consentement
   explicite** versionnée (`CONSENT_TEXT_VERSION`) et badge du niveau.
4. À la soumission, la route `/api/public/sign-request/$token` :
   - vérifie l'ordre séquentiel (`isNextInLine`) ;
   - calcule l'**empreinte SHA-256 du PDF d'origine** (`original_pdf_hash_sha256`) ;
   - appose le tracé manuscrit, ajoute une page récap + horodatage ;
   - calcule l'**empreinte SHA-256 du PDF signé** (`pdf_hash_sha256`) ;
   - stocke le PDF signé dans le bucket privé `signed-documents` ;
   - écrit la ligne `document_signatures` avec le bloc `evidence` JSON complet ;
   - met l'invitation en `signed` + horodatage ;
   - les triggers `tg_audit_signature_requests`, `on_signature_request_signed`,
     `on_document_signed` alimentent `audit_logs`.

## 3. Champs de preuve persistés

### `document_signature_requests` (ajouts)

| Colonne | Rôle |
|---------|------|
| `signature_level` (`ses`/`aes`/`qes`) | Niveau exigé à l'invitation. |
| `auth_method_required` | Méthode d'auth (aujourd'hui `email_link`). |

### `document_signatures` (ajouts)

| Colonne | Rôle |
|---------|------|
| `signature_level` | Niveau réellement appliqué. |
| `auth_method` | Méthode d'auth utilisée. |
| `consent_text` + `consent_accepted_at` | Texte exact accepté + horodatage. |
| `original_pdf_hash_sha256` | Intégrité du document soumis (avant tracé). |
| `pdf_hash_sha256` | Intégrité du PDF signé final. |
| `country`, `timezone` | Contexte géographique (optionnel). |
| `evidence` (jsonb) | Bundle de preuves complet, conforme à `SignatureEvidence`. |

Le bundle `evidence` permet de **reconstituer toute la preuve sans parser le PDF** :
identité, consentement versionné, horodatage, hash avant/après, IP, user-agent,
token tronqué, placement, version du module.

## 4. Écarts couverts par la SES actuelle

| Exigence eIDAS SES | Couverture |
|--------------------|-----------|
| Identification raisonnable du signataire | ✅ Nom + email + lien unique à usage unique. |
| Consentement explicite | ✅ Case obligatoire + texte versionné stocké. |
| Horodatage | ✅ Serveur (Worker + Postgres). |
| Intégrité du document | ✅ SHA-256 avant ET après apposition. |
| Journal d'événements | ✅ `audit_logs` + triggers + `evidence` jsonb. |
| Recevabilité juridique (art. 1366) | ✅ |

## 5. Roadmap vers AES (sans casser la SES)

Cf. `SES_TO_AES_GAPS` exporté par `signature-conformity.ts`. Les points-clés :

- **Auth forte** : ajouter `email_otp` / `sms_otp` (déjà déclaré dans `AuthMethod`).
  `assertAuthMethodAllowed` impose la cohérence niveau ↔ méthode dès aujourd'hui.
- **Certificat éphémère** : émettre un X.509 par session ; signer le PDF en
  **PAdES B-T** plutôt qu'un simple drawImage. Le hash actuel reste un fallback.
- **Horodatage qualifié** : remplacer `signedAt = new Date()` par un appel TSA
  RFC 3161 ; le retour signé est stocké dans `evidence.timestamp_token`.
- **Scellement du journal** : chaîner les `audit_logs` par hash (Merkle / hash chain)
  pour rendre l'historique inviolable.
- **KYC pour QES** : intégration d'un PSCo qualifié (DocuSign QES, Universign…).

L'enum DB `signature_level` accepte déjà `aes` et `qes` ; les colonnes existantes
suffisent à héberger les nouvelles preuves dans `evidence`. Aucune migration
destructive n'est requise pour la montée en niveau.

## 6. Surface de code à connaître

- `src/lib/signature-conformity.ts` — types, constantes, helpers (`sha256Hex`,
  `assertAuthMethodAllowed`, `buildConsentRecord`, `tokenHint`).
- `src/routes/api/public/sign-request.$token.ts` — orchestration serveur.
- `src/routes/s.$token.tsx` — UI publique (consentement + badge niveau).
- `src/lib/signature-requests.functions.ts` / `signatures-overview.functions.ts`
  — lectures côté admin (à enrichir au besoin pour afficher `evidence`).
- Migration : `supabase/migrations/*signature_level*` — schéma SES + AES-ready.

## 7. Tests de non-régression conseillés

- [ ] Invitation existante (sans `signature_level`) → défaut `ses`, parcours OK.
- [ ] Refus sans consentement coché → bouton désactivé, pas d'appel API.
- [ ] Signature OK → `evidence.original_pdf_hash_sha256` ≠
      `evidence.signed_pdf_hash_sha256`, les deux présents en base.
- [ ] Audit log `document.signed` créé via trigger.
- [ ] Tentative d'invitation `signature_level='aes'` + `auth_method='email_link'`
      → rejet via `assertAuthMethodAllowed` au moment du POST.
