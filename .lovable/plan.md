# Éditeur PDF — Phase 1 : PDF existant + zones

## Objectif
Permettre à l'auteur d'uploader un PDF existant, de placer visuellement des zones (texte, date, case à cocher, signature, paraphe), de les pré-remplir, puis d'exporter un PDF final aplati prêt à être présenté/envoyé aux signataires via le circuit existant.

> Phase 2 (éditeur WYSIWYG avancé → PDF) est volontairement repoussée — livrée séparément après validation de la phase 1.

## Parcours utilisateur
1. Depuis un document : bouton **"Éditer le PDF"** → ouvre l'éditeur plein écran.
2. L'éditeur affiche le PDF page par page (rendu via `pdfjs-dist`) avec un **canvas overlay** par page.
3. Palette à gauche : `Texte`, `Date`, `Case à cocher`, `Signature`, `Paraphe`.
4. Drag & drop d'un champ sur la page → zone redimensionnable/déplaçable.
5. Panneau de droite (zone sélectionnée) : libellé, valeur pré-remplie, police/taille, requis, page.
6. Bouton **"Enregistrer brouillon"** : persiste les zones + valeurs (JSON).
7. Bouton **"Générer PDF final"** : aplatit les zones dans le PDF (via `pdf-lib`) → nouveau `document_files` versionné, devient le fichier courant. Réutilisable dans les flows existants (circuit, signature, envoi).

## Architecture technique

### Données (migration)
Nouvelle table `document_pdf_fields` rattachée au `document_id` :
- `id`, `document_id`, `page_index` (int), `kind` (`text|date|checkbox|signature|initials`)
- `x`, `y`, `width`, `height` (float, **coordonnées PDF en points**, origine bas-gauche)
- `value` (text, nullable), `font_size` (int, défaut 11), `required` (bool), `label` (text)
- `position` (int, ordre d'affichage), timestamps
- RLS : accès via `organization_id` du document parent (helper existant).
- GRANTs : `authenticated` + `service_role`.

Aucun changement aux tables existantes.

### Librairies
- `pdfjs-dist` (déjà compatible Worker via build worker) — **rendu** dans l'éditeur côté client uniquement.
- `pdf-lib` (déjà installée, utilisée par `pdf.functions.ts`) — **aplatissage** côté serveur.
- Signature/paraphe : réutilisation du composant `sign-document-dialog` (canvas → image PNG) — stockée comme `value` (data URL) sur la zone.

### Côté client
- Nouvelle route `_authenticated.app.documents.$id.editor.tsx` (éditeur plein écran).
- Nouveau composant `pdf-editor/` :
  - `PdfCanvas.tsx` : rend chaque page + overlay absolute.
  - `FieldOverlay.tsx` : zones draggables (lib `react-rnd` ajoutée — légère, compat Workers car client-only).
  - `FieldPalette.tsx` / `FieldInspector.tsx`.
- Conversion coordonnées écran ↔ PDF (ratio `viewport.scale`).

### Côté serveur (nouveau `src/lib/pdf-editor.functions.ts`)
- `listPdfFields({ documentId })` → renvoie zones.
- `savePdfFields({ documentId, fields })` → upsert atomique (delete + insert).
- `flattenPdfWithFields({ documentId })` :
  1. Récupère le `document_files` courant + télécharge depuis Storage.
  2. Charge avec `pdf-lib`, pour chaque zone :
     - `text`/`date` → `page.drawText`
     - `checkbox` → carré + croix si `value === "true"`
     - `signature`/`initials` → `page.drawImage(embedPng(value))`
  3. Upload nouvelle version + insère `document_files` (`is_current = true`, `version + 1`).
  4. Log audit `document.pdf_flattened`.

### Bouton d'accès
- `src/routes/_authenticated.app.documents.$id.tsx` : ajout d'un bouton **"Éditer le PDF"** à côté de `GeneratePdfButton`, visible si un PDF courant existe.

## Sécurité
- Tous les serverFn sous `requireSupabaseAuth`, scoping par organisation via RLS.
- Validation Zod stricte (nb max de zones : 500/document, dimensions bornées).
- Aucune exposition aux invités dans cette phase (mode auteur uniquement).

## Hors scope (phase 1)
- Champs assignés à des signataires différents (l'auteur remplit tout).
- Édition WYSIWYG → PDF (phase 2).
- OCR / détection automatique de champs.
- Variables dynamiques `{{client.nom}}`.
- Multi-page templates réutilisables de zones.

## Fichiers touchés
- **Migration** : `document_pdf_fields` (+ RLS + GRANTs).
- **Nouveau** : `src/lib/pdf-editor.functions.ts`, `src/routes/_authenticated.app.documents.$id.editor.tsx`, `src/components/pdf-editor/*` (3-4 fichiers).
- **Modifiés** : `src/routes/_authenticated.app.documents.$id.tsx` (bouton), `package.json` (`react-rnd`, `pdfjs-dist`).
- Locales `fr.json` / `en.json` (clés UI).

Validation attendue avant lancement.
