# Refonte UX mobile — zéro scroll horizontal

Objectif : sur smartphone (≤ 767px), tout le contenu doit tenir dans la largeur du viewport, rester lisible et atteignable au pouce, sans aucun défilement horizontal.

## 1. Fondations responsive (transverse)

- Ajouter dans `src/styles.css` une garde globale : `html, body { overflow-x: hidden; max-width: 100vw; }` et passer les conteneurs principaux à `min-w-0`.
- Auditer `AppShell` et `main` : remplacer `p-4 md:p-6` par `px-3 py-4 md:p-6`, garantir `min-w-0` sur le `<main>` pour que les enfants `flex`/`grid` se contractent.
- Header mobile : compacter (logo + burger + cloche + avatar), masquer le nom utilisateur sous `sm:`.
- Utilitaire commun : remplacer toutes les `h-screen` par `h-dvh` pour les pleins écrans (notamment page signataire).

## 2. Back-office — tableaux & listes

Zones concernées : `/app/documents`, `/app/facturation/devis`, `/app/facturation/factures`, `/app/pending-signatures`, `/app/pdf-templates`, listes utilisateurs/audit.

Approche **card-on-mobile, table-on-desktop** :

- Sur `< md` : remplacer chaque ligne de `<table>` par une `Card` empilée avec titre, métadonnées en colonnes de 2, badges de statut et menu d'actions (`DropdownMenu`).
- Sur `≥ md` : conserver le tableau actuel.
- Implémentation : composant `<ResponsiveDataList rows columns mobileCard />` ou simplement deux blocs `hidden md:block` / `md:hidden` selon la page.
- Filtres / recherche : passer en `Sheet` (bottom-sheet) déclenché par un bouton « Filtres » sur mobile au lieu de la barre horizontale qui déborde.
- Pagination : boutons précédent/suivant pleine largeur empilés sur mobile.

## 3. Éditeur de document (`/app/documents/$id/editor`)

Problèmes actuels : palette latérale + canvas PDF + panneau propriétés = trop large, scroll horizontal.

Refonte :

- **Layout mobile** : canvas PDF en pleine largeur (zoom auto pour fit width), palette d'outils en **barre flottante en bas** (icônes : texte, date, case, signature, image), réglages d'un champ sélectionné en **bottom-sheet** au lieu du Popover latéral.
- Pinch-to-zoom + pan natifs sur le canvas (déjà géré par react-rnd, vérifier `touch-action`).
- Boutons « Enregistrer / Aperçu / Envoyer » dans une barre sticky en haut, condensés en icônes + label court.
- Sur `≥ md` : conserver l'expérience desktop actuelle.

## 4. Page signataire (`/s/$token`)

- Header sticky compact (logo + statut), PDF en pleine largeur avec viewer `PdfJsViewer` qui s'ajuste à `100vw`.
- Le panneau de saisie déjà ajouté devient **plein écran** (drawer) quand un champ est tapé : clavier visible + un seul champ à remplir à la fois, navigation « Précédent / Suivant ».
- Canvas de signature : plein écran rotatif (proposer mode paysage) avec bouton « Effacer / Valider ».
- CTA « Signer maintenant » en barre sticky bas, toujours visible, `min-h-12` pleine largeur.

## 5. Vérification

- Script Playwright (viewport 375×812) parcourant : `/admin`, `/app/documents`, `/app/facturation/factures`, éditeur, `/s/$token` de démo. Screenshot de chaque écran + assertion `document.documentElement.scrollWidth <= window.innerWidth`.

## Détails techniques

- Tailwind v4, breakpoint mobile = `< md` (767px).
- Pattern récurrent : `grid grid-cols-[minmax(0,1fr)_auto]` + `min-w-0` + `truncate` + `shrink-0` sur les éléments fixes.
- Tableaux : utiliser `<div className="md:hidden space-y-2">…cartes…</div>` + `<Table className="hidden md:table">…</Table>`.
- Bottom-sheets : `Sheet side="bottom"` shadcn.
- Cibles tactiles ≥ 44×44 (`min-h-11 min-w-11`).
- Aucun changement de logique métier ; uniquement présentation et composants UI.

## Hors périmètre

- Pas de redesign visuel (couleurs, typo conservées).
- Pas de modification des server functions ni du schéma DB.
- Pages super-admin / reseller laissées telles quelles sauf si triviales.
