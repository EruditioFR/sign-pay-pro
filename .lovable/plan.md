# Enrichissement des verticals métiers

## Constat

Le système existe déjà (`business-verticals.ts` + `seedBusinessVerticalTemplates`), mais :
- Certains modèles demandés manquent (état des lieux immobilier, NDA, CGV)
- Les templates n'ont que header/footer/mentions légales — pas de **corps de document** avec placeholders prêts à l'emploi
- Pas de notion de **champs requis** par template
- L'UI admin n'affiche qu'un compteur, pas la liste des modèles ni leur statut individuel

## Livrables

### 1. Enrichir `src/lib/business-verticals.ts`

Ajouter à chaque preset deux champs :
- `body_html` : corps de document pré-rempli avec placeholders `{{var}}` (clauses, tableaux, signatures)
- `required_fields: string[]` : variables obligatoires à saisir lors de l'instanciation

Compléter les modèles manquants par vertical :

| Vertical | Templates finaux |
|---|---|
| real_estate | Mandat vente exclusif, Compromis de vente, **État des lieux entrant**, **État des lieux sortant**, Bail meublé, Facture honoraires |
| car_rental | Contrat location, Devis CD, État des lieux véhicule (départ + retour), Facture |
| services | Proposition, Contrat prestation, **NDA / accord de confidentialité**, Ordre de mission, Facture |
| goods_sales | Bon de commande, Devis, Bon de livraison, Facture, **Conditions générales de vente** |

Chaque `body_html` contient des sections HTML structurées (parties, objet, durée, prix, signatures) avec les `{{placeholders}}` du vertical.

### 2. Migration SQL

Ajouter sur `document_templates` :
- `body_html TEXT` (corps long de document)
- `required_fields TEXT[]` (variables obligatoires)

Pas de nouvelle table — on réutilise la table existante avec son RLS / GRANT déjà en place.

### 3. Mise à jour `seedBusinessVerticalTemplates`

- Insérer `body_html` et `required_fields` lors du seed
- Mode **upsert sur conflit (organization_id + business_vertical + name)** plutôt que skip, pour permettre la mise à jour du contenu si l'utilisateur re-seed après une nouvelle version

Ajouter une nouvelle fonction `listVerticalTemplates({ vertical })` qui retourne pour un vertical donné la liste des templates de l'org (id, name, document_type, seeded boolean), pour l'UI.

### 4. UI admin `/admin/business-verticals`

- Remplacer le `<details>` "Variables dynamiques" par un panneau dépliable listant **les modèles du vertical** : nom, type document, badge "Importé" / "À importer", lien vers `/app/templates/$id/edit` si importé
- Ajouter pour chaque template un mini-aperçu des `required_fields`
- Conserver le bouton "Importer les modèles" en bulk + ajouter une icône pour ré-importer/mettre à jour

## Détails techniques

### Schéma SQL
```sql
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS required_fields text[] DEFAULT ARRAY[]::text[];
```
GRANT déjà en place sur `document_templates`. Pas de RLS à modifier.

### Forme d'un preset enrichi
```ts
{
  name: "Accord de confidentialité (NDA)",
  document_type: "contract",
  required_fields: ["client_company", "mission_title", "start_date", "end_date"],
  body_html: `
    <h2>Article 1 — Parties</h2>
    <p>Entre {{company_name}} et {{client_company}}, représenté par {{client_name}}…</p>
    <h2>Article 2 — Objet</h2>
    <p>Dans le cadre de la mission « {{mission_title}} »…</p>
    <h2>Article 3 — Durée</h2>
    <p>Du {{start_date}} au {{end_date}}, prolongé de 3 ans après expiration.</p>
    …
  `,
  legal_mentions: "…",
}
```

### Compatibilité
- Les templates existants déjà seedés gardent leur ligne ; `body_html`/`required_fields` restent NULL et sont remplis lors d'un nouveau "Importer" (mode upsert).
- L'éditeur visuel (`/app/templates/$id/edit`) n'est pas modifié — `body_html` reste exploitable par les flux PDF/HTML qui lisent déjà header/footer (à utiliser dans la prochaine itération de rendu si besoin).

## Fichiers touchés

- `supabase/migrations/<timestamp>_template_body_required_fields.sql` (nouvelle)
- `src/lib/business-verticals.ts` (enrichi + nouveaux templates)
- `src/lib/business-verticals.functions.ts` (upsert + `listVerticalTemplates`)
- `src/routes/_authenticated.admin.business-verticals.index.tsx` (UI listing)
- `src/integrations/supabase/types.ts` (régénéré post-migration)

## Hors scope

- Refonte de l'éditeur visuel pour exploiter `body_html` (à voir séparément)
- Validation des `required_fields` au moment de l'instanciation (à brancher dans `instantiateTemplate` plus tard)
