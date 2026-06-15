# Tests automatisés

Stratégie pragmatique : **tests unitaires Vitest** ciblés sur la logique métier
pure de `src/lib/` — pas d'orchestration DB ni d'environnement Supabase factice.

## Pourquoi pas plus ?

- Les `*.functions.ts` (serveur) sont fortement couplés à Supabase + middleware
  TanStack Start. Les mocker apporte peu de valeur et masque les bugs réels
  (les vraies erreurs viennent du SQL/RLS, testés en intégration manuelle).
- La génération PDF (`pdf-lib`) et l'XML Factur-X dépendent de binaires/fonts.
  On teste le **mapping métier** (champs facture → statuts e-invoicing) plutôt
  que le rendu binaire.
- Le E2E sur les routes publiques nécessite une vraie DB seedée → trop coûteux
  pour un premier filet. À envisager plus tard avec Playwright contre un
  environnement de staging.

## Couverture actuelle (haute valeur, faible maintenance)

| Fichier | Flux critique couvert |
|---|---|
| `payment-status.test.ts` | Calcul statut paiement (unpaid/partial/paid/overdue/refunded), agrégation paiements manuels + Stripe + remboursements |
| `invoice-lifecycle.test.ts` | Cycle de vie facture B2B (draft → issued → … → paid), transitions interdites, manual vs auto |
| `einvoice.test.ts` | Cycle e-invoicing (PDP) : draft → submitted → accepted, rejet, terminaux |
| `public-routes-security.test.ts` | Durcissement endpoints publics : validation token UUID, clamping montant paiement (anti-injection via lien de partage), bornage IP/UA |
| `errors.test.ts` | Taxonomie d'erreurs : `AppError`, messages UI safe (jamais de PII), fingerprinting |

## Lancer les tests

```bash
# Tous les tests
bunx vitest run

# Mode watch (dev)
bunx vitest

# Avec couverture
bunx vitest run --coverage
```

## Ajouter un test

1. Créer `src/lib/__tests__/<module>.test.ts`.
2. Importer la fonction métier via `@/lib/...` (alias configuré dans
   `vitest.config.ts`).
3. Tester des cas pertinents — pas de tests "smoke" sans assertion utile.

## Évolutions possibles plus tard

- **Tests d'intégration server fns** : harness léger qui appelle les
  `createServerFn` contre une DB éphémère (`supabase start`).
- **E2E Playwright** sur 3 parcours : créer doc → partager → signer → encaisser,
  contre un environnement de staging.
- **Tests de génération PDF** : snapshot binaire trop fragile ; à la place,
  extraire le texte avec `pdf-parse` et asserter sur le contenu.
