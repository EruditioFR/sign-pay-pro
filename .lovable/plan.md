
## Objectif

Aligner l'expérience signature sur un upload PDF avec zones éditables :
1. Le signataire **clique directement** sur chaque zone autorisée et l'édite/signe sur place.
2. Le PDF final ne contient **plus de page récapitulative** ajoutée à la fin.
3. L'émetteur reçoit le PDF signé **en pièce jointe du mail** + une **notification in-app** (cloche) pointant vers `/app/documents/$id?view=signed`.

---

## 1. Page signataire `src/routes/s.$token.tsx` — édition au clic

Refonte du composant `SignWithPlacement` :

- **Texte / Date** : l'`<input>` est déjà dans la zone overlay → focus auto au clic + scroll-into-view + `font-size:16px` (pas de zoom iOS). Supprimer le panneau d'édition dupliqué sous le PDF (lignes 696-746).
- **Checkbox** : toggle direct au clic sur la zone (un seul clic = coché/décoché). Pas de panneau séparé.
- **Signature / Paraphe** : un clic sur la zone ouvre un **mini-modal** (Dialog shadcn) contenant `ResponsiveSignatureCanvas` + boutons « Effacer » / « Valider ». À la validation, la dataURL est stockée dans `fieldValues[id]` et **rendue en aperçu inline** dans la zone (`<img>` au lieu de l'icône « tracez ci-dessous »).
- Une **seule** signature globale n'est plus nécessaire quand l'émetteur a placé des zones signature : on supprime le pavé « Tracez votre signature » du bas et on n'envoie plus `signature_image_b64` global si toutes les zones signature sont remplies (envoyer la 1ʳᵉ image de signature trouvée pour satisfaire le schéma backend).
- Bandeau récap des zones restantes (compteur + boutons « Aller à la zone X ») conservé, mais sans champs d'édition dupliqués.
- Indicateur visuel : zone **non remplie** = bordure dashed ambre + pulse ; **remplie** = bordure verte + ✓.
- Bouton « Signer maintenant » désactivé tant qu'il reste une zone obligatoire vide (en plus du consentement).

## 2. Suppression des pages annexes ajoutées au PDF

Dans `src/routes/api/public/sign-request.$token.ts` :
- Supprimer le bloc « page récapitulative » (lignes ~457-469).
- Supprimer le bloc « SIGNATURE CLIENT / PRESTATAIRE » (lignes ~471-509).
- Conserver uniquement l'apposition des zones placées par l'émetteur + le `body.placement` libre éventuel.

Dans `src/routes/api/public/share.$token.ts` :
- Supprimer le bloc `addPage` (ligne 244) qui ajoute la page « SIGNATURE CLIENT ».

La preuve de conformité (hash, IP, UA, consentement, evidence JSON) reste intégralement enregistrée en base — elle n'a pas besoin d'être imprimée sur le PDF.

## 3. Mail à l'émetteur avec PDF signé en pièce jointe

Dans `src/lib/email-sender.ts` : étendre `sendResendEmail` pour accepter un paramètre optionnel `attachments: [{ filename, content (base64) }]` (Resend supporte nativement le champ `attachments`).

Dans `src/lib/signature-notifications.server.ts` :
- `notifyDocumentSigned` et `notifySignatureCompleted` téléchargent le PDF signé depuis le bucket `signed-documents` (via `pdf_storage_path` de la signature), le convertissent en base64, et l'ajoutent en `attachments` du mail destiné au **créateur uniquement** (pas aux signataires, ils l'ont déjà à l'écran).
- Le mail conserve aussi le lien `?view=signed` vers la page de synthèse.

## 4. Notification in-app pour l'émetteur

Nouvelle table `public.user_notifications` (id, user_id, organization_id, type, title, body, link_url, document_id, read_at, created_at) avec RLS « le user voit ses notifs ». GRANT authenticated SELECT/UPDATE (pour marquer lu), service_role ALL.

- Insérer une ligne lors de `notifyDocumentSigned` (type = `document.signed`, link = `/app/documents/{id}?view=signed`).
- Nouveau composant `<NotificationBell />` dans `src/components/app-shell.tsx` (header) : badge avec compteur non-lu, Popover listant les 10 dernières, clic → navigue vers `link_url` et marque comme lue. Polling 60 s via TanStack Query.
- Server fns `listMyNotifications` / `markNotificationRead` dans `src/lib/notifications.functions.ts` (avec `requireSupabaseAuth`).

---

## Détails techniques

- Aucun changement de schéma signature/évidence ; seul l'apposition visuelle change.
- Le hash SHA-256 du PDF signé reste calculé après apposition mais sans pages annexes — l'evidence devient plus simple.
- Pour la pièce jointe Resend : limite 40 Mo ; si > 20 Mo, fallback automatique sur lien seul.
- Migration SQL : `user_notifications` + index `(user_id, read_at, created_at desc)`.

## Hors scope

- Notifications push web (Service Worker).
- Refonte des autres parcours (paiement, archive).
