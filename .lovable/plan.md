
## Objectif

Dans l'éditeur WYSIWYG, ne pas demander les signataires et le paiement sur la page d'édition. À la place, ajouter une **étape suivante** après le clic sur *Générer PDF* : un écran de configuration où l'utilisateur saisit les signataires et le paiement Stripe, puis valide l'envoi.

## Parcours utilisateur

```text
[Éditeur WYSIWYG]
   └─ clic "Générer PDF"
        └─ création du document (silencieuse, sans envoi d'emails)
             └─ redirection vers [Étape "Configurer envoi"]
                  ├─ aperçu : titre + type + lien "Voir le PDF"
                  ├─ bloc Signataires (ordre séquentiel)
                  ├─ bloc Paiement Stripe (optionnel + montant)
                  ├─ bouton "Envoyer pour signature"  → applique + redirige vers l'éditeur du document
                  └─ bouton "Ignorer"                 → redirige vers l'éditeur du document sans envoi
```

## Changements

### 1. Nouvelle route `src/routes/_authenticated.app.documents.$id.configure.tsx`
- Charge le document (titre, type, lien PDF).
- Affiche le composant partagé `SignersPaymentFields` (déjà existant).
- Bouton **Envoyer pour signature** : appelle `applySignersAndPayment({ documentId, ... })` (helper déjà existant dans `SignersPaymentFields.tsx`) → toast → navigation vers `/app/documents/$id/editor`.
- Bouton **Ignorer** : navigation directe vers `/app/documents/$id/editor`.
- Header avec retour vers l'éditeur WYSIWYG (`?draftId=...`) pour revenir corriger le contenu.

### 2. `src/routes/_authenticated.app.documents.wysiwyg.tsx`
- Dans `finalizeMut.onSuccess`, remplacer la navigation actuelle :
  ```ts
  navigate({ to: "/app/documents/$id/editor", params: { id: res.documentId } })
  ```
  par :
  ```ts
  navigate({ to: "/app/documents/$id/configure", params: { id: res.documentId } })
  ```
- Aucun champ signataires/paiement ajouté à cette page (option 2 retenue).

### 3. Aucun changement nécessaire
- `SignersPaymentFields.tsx` et son helper `applySignersAndPayment` couvrent déjà ce besoin (utilisés par les 3 autres parcours).
- `finalizeWysiwygDocument` reste inchangé : il crée juste le document.

## Notes techniques
- La route `configure` est sous `_authenticated`, donc protégée.
- Si l'utilisateur ferme l'onglet à l'étape configure, le document existe déjà en brouillon — il pourra reprendre la config plus tard depuis la liste des documents (déjà possible via l'éditeur du document, inchangé).
