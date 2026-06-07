# Phase 2 — Création de documents via éditeur WYSIWYG

## Objectif
Créer un document depuis zéro dans un éditeur de texte riche (style Word), insérer des **placeholders de champs** (texte, date, case, signature, paraphe) directement dans le flux du texte, puis générer un PDF qui s'ouvre automatiquement dans l'éditeur PDF de la phase 1 pour positionner les zones interactives finales.

## Parcours utilisateur
1. **Documents → Nouveau → "Créer avec éditeur WYSIWYG"** (en plus de l'upload PDF existant).
2. Page A4 paginée dans le navigateur, toolbar de mise en forme (titres, gras, italique, listes, alignement, tableaux simples).
3. Bouton **"Insérer un champ"** → menu : Texte / Date / Case / Signature / Paraphe → insère un placeholder visuel inline (badge coloré avec label éditable).
4. Bouton **"Enregistrer brouillon"** : persiste le HTML + meta des champs (réouverture/édition ultérieure).
5. Bouton **"Générer PDF"** :
   - Conversion côté client (html2canvas + jsPDF) → PDF A4 multipage.
   - Upload comme `document_files` du document créé.
   - Pré-création des `document_pdf_fields` aux coordonnées détectées (bbox des placeholders → points PDF).
   - Redirection vers l'éditeur PDF (phase 1) pour ajuster/valider les zones.
6. Ensuite, parcours standard : aplatissage → envoi aux signataires (déjà en place).

## Architecture technique

### Librairies
- `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-placeholder` (éditeur).
- `html2canvas` + `jspdf` (rendu PDF client — pas de dépendance Worker côté serveur).
- Custom TipTap **inline node** `field-placeholder` (attributs : `kind`, `label`, `width`, `height`).

### Données
Nouvelle table `wysiwyg_drafts` :
- `id`, `document_id` (nullable jusqu'à génération), `organization_id`, `title`, `html` (text), `created_by`, timestamps.
- RLS par organisation + GRANTs `authenticated`/`service_role`.

Aucune modification de `document_pdf_fields` : on insère normalement après génération PDF.

### Côté client
- Nouvelle route `_authenticated.app.documents.new.wysiwyg.tsx`.
- Composant `WysiwygEditor.tsx` (TipTap + toolbar + insertion de champs).
- Custom node React `FieldPlaceholder` qui rend un span/div positionné, avec `data-field-kind`, `data-field-label`.
- Fonction `htmlToPdfWithFields(htmlEl)` :
  1. `html2canvas` page par page (découpe par hauteur A4).
  2. `jsPDF.addImage` pour chaque page.
  3. Avant capture, lecture des `getBoundingClientRect()` de chaque placeholder → conversion mm → points PDF (origine bas-gauche).
  4. Retourne `{ pdfBlob, fields: [{ page_index, kind, x, y, w, h, label }] }`.

### Côté serveur (`src/lib/wysiwyg-documents.functions.ts`)
- `saveWysiwygDraft({ id?, title, html, documentId? })`.
- `listWysiwygDrafts()` / `getWysiwygDraft({ id })` / `deleteWysiwygDraft({ id })`.
- `finalizeWysiwygDocument({ draftId, pdfBytes (base64), fields })` :
  1. Crée `documents` (+ destinataire vide) si pas encore lié.
  2. Upload PDF dans Storage → `document_files` v1 `is_current=true`.
  3. Insère `document_pdf_fields` pré-calculés.
  4. Log audit `document.wysiwyg_created`.
  5. Renvoie `documentId`.

### Entrée utilisateur
- `_authenticated.app.documents.new.tsx` : ajout d'un onglet/bouton **"Créer depuis un éditeur"** à côté de "Importer un PDF".
- Sidebar : nouveau lien **"Brouillons"** listant `wysiwyg_drafts`.

## Sécurité
- Tous serverFn sous `requireSupabaseAuth`.
- Validation Zod : `html` max 500 ko, `fields` max 500 entrées, dimensions bornées.
- HTML sanitization côté serveur (sanitize-html léger) avant stockage — empêche `<script>` injectés.

## Hors scope
- Variables dynamiques (`{{client.nom}}` auto-rempli depuis CRM) — à traiter plus tard.
- Édition collaborative temps réel.
- Import Word/DOCX.
- Tableaux avancés / images uploadées dans l'éditeur (v2 si besoin).

## Fichiers touchés
- **Migration** : `wysiwyg_drafts` + RLS + GRANTs.
- **Nouveaux** :
  - `src/lib/wysiwyg-documents.functions.ts`
  - `src/components/wysiwyg/WysiwygEditor.tsx`
  - `src/components/wysiwyg/FieldPlaceholderNode.tsx`
  - `src/components/wysiwyg/html-to-pdf.ts`
  - `src/routes/_authenticated.app.documents.new.wysiwyg.tsx`
  - `src/routes/_authenticated.app.drafts.index.tsx`
- **Modifiés** :
  - `src/routes/_authenticated.app.documents.new.tsx` (lien)
  - `src/components/app-shell.tsx` (Brouillons)
  - `package.json` (tiptap, html2canvas, jspdf, sanitize-html)

Validation attendue avant lancement.
