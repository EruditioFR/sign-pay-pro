## Cause racine

Pour chaque document signé examiné en base, on trouve la signature (avec `pdf_storage_path` dans le bucket `signed-documents`) mais **aucune ligne `-signed.pdf` dans `document_files`**, et **toutes les lignes existantes ont `is_current = false`**.

En traçant `publishSignedPdfAsCurrentFile` (`src/lib/signed-pdf-publish.server.ts`) :

1. Il fait `update document_files set is_current=false` (réussit, d'où l'état observé).
2. Il fait `insert into document_files (... uploaded_by: null ...)`.
3. La colonne `document_files.uploaded_by` est **`NOT NULL`** → l'insert échoue silencieusement (`console.error` uniquement, pas d'exception).

Conséquence :
- Le détail document n'a plus de fichier "courant" → la modale `?view=signed` ouverte depuis le mail ou la cloche de notification n'a rien à afficher.
- La rubrique "Titre — fichiers" ne montre pas le PDF signé.
- Le backfill `ensureSignedPdfInFiles` reproduit exactement le même bug (`uploadedBy: null`).

## Correctifs

### 1. Migration — rendre `uploaded_by` nullable

```sql
ALTER TABLE public.document_files ALTER COLUMN uploaded_by DROP NOT NULL;
```

(Les inserts système — PDF signé, factur-X — n'ont pas d'utilisateur authentifié.)

### 2. `src/lib/signed-pdf-publish.server.ts`

- Renseigner `uploaded_by` avec `documents.created_by` quand le caller passe `null`, en fallback de la colonne nullable.
- **Réordonner** : insérer d'abord la nouvelle version `is_current=true`, puis seulement basculer les autres lignes à `is_current=false`. Évite l'état "aucun fichier courant" si un insert échoue à nouveau.
- Si l'upload storage échoue avec un conflit `Duplicate`, basculer en `upsert: true` plutôt que d'abandonner.
- Logguer explicitement les erreurs d'insert (actuellement on ne capture pas le retour de `.insert`).

### 3. Rétroactif — réparer les documents déjà signés

Une requête de réparation ponctuelle (via `supabase--insert`) pour les documents `status in (signed, paid, partially_paid, archived)` sans ligne `-signed.pdf` : remettre `is_current=true` sur la version la plus récente actuelle. À la prochaine ouverture du document, `ensureSignedPdfInFiles` (corrigé) publiera le vrai PDF signé.

Plus simple et suffisant : 

```sql
UPDATE document_files f
SET is_current = true
WHERE f.id IN (
  SELECT DISTINCT ON (document_id) id
  FROM document_files
  WHERE document_id IN (
    SELECT id FROM documents WHERE status IN ('signed','paid','partially_paid','archived')
  )
  ORDER BY document_id, version DESC
)
AND NOT EXISTS (
  SELECT 1 FROM document_files g
  WHERE g.document_id = f.document_id AND g.is_current = true
);
```

Puis, à la prochaine ouverture du document détail, le backfill (qui marche désormais) ajoutera la version signée et la marquera courante.

### 4. Vérification

- Lister un document signé existant et confirmer qu'après ouverture une ligne `…-signed.pdf` apparaît avec `is_current=true`.
- Le lien email (`/app/documents/{id}?view=signed`) et la cloche de notification ouvrent la modale sur le PDF signé.
- La rubrique "Titre — fichiers" affiche le PDF signé téléchargeable.

Aucun changement nécessaire côté template email ni côté `NotificationBell` : le lien est déjà correct, c'est uniquement la donnée sous-jacente qui manquait.
