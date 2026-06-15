## Objectif

Dans l'éditeur PDF (`/app/documents/$id/editor`) :
1. Permettre de **placer une zone en traçant un rectangle à la souris** sur la page (UX type DocuSign/Signova).
2. Permettre d'insérer dans les zones texte/date des **variables dynamiques** (`{{third_party_name}}`, `{{amount_ttc}}`, `{{today}}`…) qui sont remplacées au moment de la génération du PDF final par les valeurs du document.

## Changements UI — éditeur

Fichier : `src/routes/_authenticated.app.documents.$id.editor.tsx`

- Palette gauche : remplacer le bouton "ajouter" par un sélecteur d'outil (Texte / Date / Case / Signature / Paraphe + outil "Sélection"). Le type actif est mis en surbrillance.
- Calque au-dessus du canvas PDF :
  - Quand un outil est actif, le curseur passe en `crosshair`.
  - `mousedown` → début du tracé, `mousemove` → rectangle fantôme, `mouseup` → création de la zone aux coordonnées tracées (conversion CSS px → points PDF, origine bas-gauche).
  - Tracé minimum (ex. 12 px) : sinon on retombe sur la taille par défaut centrée à l'endroit du clic.
  - Outil revient automatiquement à "Sélection" après création.
- Conserver les `Rnd` existants pour déplacer / redimensionner ensuite.
- Conserver le bouton "Ajouter centré" comme repli (clic simple dans la palette).

## Champs dynamiques

### Catalogue des variables (résolu côté serveur lors du flatten)

Issu de la table `documents` :
- `{{title}}`, `{{reference}}`, `{{document_number}}`
- `{{third_party_name}}`, `{{third_party_email}}`
- `{{amount_ht}}`, `{{amount_ttc}}`, `{{currency}}`
- `{{issue_date}}`, `{{due_date}}`
- `{{invoice_number}}`
Et global : `{{today}}`, `{{now}}`.

### Inspector (zone Texte/Date sélectionnée)

- Ajouter un `Select` "Insérer une variable…" listant le catalogue : insère le token `{{xxx}}` à la position courante du champ `Valeur`.
- Aperçu en direct : si la valeur contient des `{{…}}`, le rendu dans la zone affiche le token avec un fond légèrement coloré (badge) pour signaler "dynamique".

### Résolution côté serveur

Fichier : `src/lib/pdf-editor.functions.ts`, fonction `flattenPdfWithFields` :
- Charger les colonnes utiles de `documents` (déjà fait pour `id, type, reference` — étendre).
- Construire une map `variables` (formats : montants au format FR avec devise, dates en `dd/MM/yyyy`).
- Avant `page.drawText`, remplacer toutes les occurrences `{{key}}` (insensible aux espaces) par la valeur ; token inconnu → laissé vide.
- Même résolution appliquée aux zones de type `date` (permet `{{today}}`, `{{issue_date}}`).

Aucun changement de schéma DB : on stocke toujours le `value` brut avec tokens, la résolution est faite à la génération.

## Détails techniques

- Conversion souris → points PDF : `x_pdf = cssX / renderScale`, `y_pdf = pageDims.h - (cssY + cssH) / renderScale`. Clamp dans `[0, pageDims.w/h]`.
- État local : `activeTool: PdfFieldKind | "select"`, `draft: {startX, startY, x, y, w, h} | null` pendant le tracé.
- Le calque d'overlay ne doit pas être recouvert par les `Rnd` quand un outil de tracé est actif (les `Rnd` passent en `pointerEvents: none`) — sinon impossible de tracer par-dessus une zone existante.
- Format montant : `new Intl.NumberFormat('fr-FR', { style: 'currency', currency: doc.currency || 'EUR' })`.

## Fichiers modifiés

- `src/routes/_authenticated.app.documents.$id.editor.tsx` — outil actif, tracé à la souris, sélecteur de variable dans l'inspector, rendu badge des tokens.
- `src/lib/pdf-editor.functions.ts` — étendre `select` documents + helper `resolveVariables(value, ctx)` appliqué dans la boucle de rendu.

## Hors périmètre

- Assignation par signataire (workflow multi-parties) — non demandé.
- Calculs/formules et listes déroulantes — non demandés.
- Champs à remplir par le signataire dans une page publique — non demandé.
