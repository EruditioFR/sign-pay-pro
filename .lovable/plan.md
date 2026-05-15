# Bloc 2 — Documents, Upload & Workflows de validation

## Périmètre

Couvre la création, le stockage, la circulation et la validation des documents commerciaux (bons de commande, devis, factures, contrats). Tout le reste (signature électronique, paiement, OCR, notifications email, PDF généré) reste hors-scope et fera partie des Blocs 3+.

### Inclus
1. Modèle de données documents multi-tenant (types, statuts, versions)
2. Upload de fichiers (PDF, images, Office) vers Lovable Cloud Storage
3. CRUD documents avec RLS strict par organisation
4. Métadonnées : type, n° pièce, montant HT/TTC, devise, tiers, dates, tags
5. Workflows de validation configurables (étapes séquentielles)
6. Tâches d'approbation par utilisateur (file d'attente "À valider")
7. Historique complet (versions + audit_logs enrichis)
8. Recherche & filtres (type, statut, période, tiers, montant)
9. UI : liste, détail, création, upload, viewer PDF/image, timeline workflow
10. i18n FR/EN sur toutes les nouvelles chaînes

### Hors-scope (Blocs ultérieurs)
- Signature électronique qualifiée
- Génération PDF (devis/facture depuis template)
- Paiement par lien public
- OCR / extraction automatique
- Notifications email/push
- Chatbot, conformité avancée, intégrations comptables

---

## Schéma DB

```
-- enums
document_type   : purchase_order | quote | invoice | contract | other
document_status : draft | pending_validation | validated | rejected | archived
workflow_step_status : pending | approved | rejected | skipped

-- table principale
documents (
  id, organization_id, type, status, title, reference, description,
  amount_ht numeric, amount_ttc numeric, currency text default 'EUR',
  third_party_name, third_party_email,
  issue_date date, due_date date,
  tags text[],
  created_by uuid, current_workflow_id uuid null,
  created_at, updated_at
)

-- fichiers (versionnés)
document_files (
  id, document_id, version int, storage_path text, file_name,
  mime_type, size_bytes, uploaded_by, uploaded_at,
  is_current bool
)

-- définitions de workflow par organisation
workflow_templates (
  id, organization_id, name, document_type, active,
  created_at, updated_at
)

workflow_template_steps (
  id, template_id, position int, name,
  approver_role app_role null, approver_user_id uuid null,
  required bool default true
)

-- instance de workflow attachée à un document
document_workflows (
  id, document_id, template_id, status, current_step int,
  started_at, completed_at
)

document_workflow_steps (
  id, workflow_id, position int, name,
  approver_user_id uuid, status workflow_step_status,
  decided_at, comment text
)
```

### Sécurité
- RLS sur toutes les tables : isolation par `organization_id` via `get_user_org()`.
- Storage bucket `documents` privé : path `{org_id}/{document_id}/{filename}`. Policies RLS : SELECT/INSERT/UPDATE/DELETE uniquement si l'utilisateur appartient à l'org du dossier.
- Functions security definer ajoutées : `can_approve_step(_user_id, _step_id)`, `is_org_member(_user_id, _org_id)`.
- Triggers : `updated_at` auto, `audit_logs` à chaque changement de statut document/workflow, avancement automatique du workflow quand toutes les étapes obligatoires sont approuvées.

---

## Server Functions (TanStack)

`src/lib/documents.functions.ts`
- `listDocuments({ filters })` — liste filtrée de l'org courante
- `getDocument({ id })` — détail + fichiers + workflow
- `createDocument({ ... })` — crée + log audit
- `updateDocument({ id, patch })`
- `deleteDocument({ id })` — admin uniquement
- `getDocumentFileSignedUrl({ fileId })` — URL signée 5 min

`src/lib/workflows.functions.ts`
- `listWorkflowTemplates()`
- `createWorkflowTemplate({ ... })`, `updateWorkflowTemplate`, `deleteWorkflowTemplate`
- `submitDocumentForValidation({ documentId, templateId })`
- `approveStep({ stepId, comment })`
- `rejectStep({ stepId, comment })`
- `listMyPendingApprovals()`

Toutes protégées par `requireSupabaseAuth`. Vérifications de rôles + appartenance org dans le handler.

---

## Routes ajoutées

```
src/routes/_authenticated/
  app.documents.tsx              liste + filtres (manager/user)
  app.documents.new.tsx          création (upload + métadonnées)
  app.documents.$id.tsx          détail (viewer + timeline workflow + actions)
  app.approvals.tsx              "À valider" (file utilisateur)
  admin.workflows.tsx            liste templates de workflow
  admin.workflows.new.tsx        création template
  admin.workflows.$id.tsx        édition template (étapes)
```

Sidebar mise à jour : ajout "Documents", "À valider" (badge compteur), "Workflows" (admin).

---

## Composants UI (Shadcn)

- `DocumentList` (table avec tri/pagination)
- `DocumentFilters` (type, statut, période, tiers, montant min/max)
- `DocumentForm` (création/édition)
- `DocumentUploader` (drag & drop, multi-fichiers, progress)
- `DocumentViewer` (PDF via `<iframe>` URL signée, images natives)
- `WorkflowTimeline` (étapes verticales avec statut, validateur, date, commentaire)
- `WorkflowTemplateEditor` (drag & drop des étapes)
- `ApprovalActionBar` (boutons Approuver/Rejeter + commentaire)
- `StatusBadge`, `DocumentTypeIcon`

---

## Détails techniques

- **Upload :** côté client → `supabase.storage.from('documents').upload(...)` puis server fn `registerDocumentFile` qui insère la ligne `document_files`. Limite 20 Mo/fichier.
- **Versioning :** chaque nouvel upload sur un document existant crée une nouvelle ligne `document_files` (`version = max+1`, `is_current = true`, ancien repassé à false).
- **Workflow auto :** trigger Postgres après update sur `document_workflow_steps` ; quand toutes les étapes obligatoires sont approuvées → `documents.status = 'validated'`. Si une étape est rejetée → `status = 'rejected'` et workflow stoppé.
- **i18n :** ajout des clés `documents.*`, `workflows.*`, `approvals.*` dans `fr.json` et `en.json`.
- **Audit :** chaque action (create/update/submit/approve/reject/delete) logge dans `audit_logs` avec `resource = 'document:{id}'` et `metadata` contextuelle.
- **Portabilité on-premise :** tout reste en migrations SQL standard + APIs Supabase, aucune dépendance Lovable-spécifique.

---

## Plan d'exécution (ordre)

1. Migration SQL : enums + tables + RLS + functions + triggers + bucket storage
2. Server functions documents + workflows
3. Routes & composants admin (workflow templates)
4. Routes & composants documents (liste, création, détail, upload, viewer)
5. Route "À valider" + actions approve/reject
6. i18n FR/EN
7. Mise à jour sidebar + redirections par rôle
8. Vérifications : compilation, lint Supabase, parcours bout-en-bout

---

## Question

Tu valides ce périmètre et je lance la migration + l'implémentation, ou tu veux ajuster (ex. retirer le versioning, réduire les filtres, intégrer dès maintenant la génération PDF) ?
