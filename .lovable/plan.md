# Refonte de la page « Nouveau document »

Transformer `/app/documents/new` en un sélecteur de point d'entrée clair, inspiré du bloc "Execution Actions" de Signova, avant d'arriver au formulaire détaillé.

## Objectif UX

Au lieu d'ouvrir directement un long formulaire, l'utilisateur arrive sur un écran qui présente **3 cartes d'action** côte à côte, chacune menant à un flux dédié :

1. **Partir d'un modèle existant** — choisir parmi les modèles PDF déjà importés (groupés par type métier comme sur `/app/pdf-templates`).
2. **Importer un modèle** — uploader un PDF/DOCX (facture, CERFA, contrat…) puis y poser les champs dynamiques + zones de signature.
3. **Créer depuis l'éditeur** — partir d'une page blanche dans l'éditeur WYSIWYG.

Le formulaire métier actuel (titre, montants, tiers, dates…) reste accessible comme **4ᵉ option « Saisie manuelle »** (ou via "Voir toutes les options") pour ne rien casser, mais n'est plus l'écran d'accueil.

## Structure de la page

```text
┌──────────────────────────────────────────────────────────────┐
│  NOUVEAU DOCUMENT                                            │
│  Choisissez comment démarrer votre document                  │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  📄      │  │  ⬆️       │  │  ✨      │  │  📝      │     │
│  │ Depuis   │  │ Importer │  │ Éditeur  │  │ Saisie   │     │
│  │ modèle   │  │ un PDF   │  │ WYSIWYG  │  │ manuelle │     │
│  │          │  │ /DOCX    │  │          │  │          │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
├──────────────────────────────────────────────────────────────┤
│  MODÈLES DISPONIBLES (si option 1 sélectionnée)              │
│  Groupés par type métier : Devis · Factures · Contrats…      │
└──────────────────────────────────────────────────────────────┘
```

- Style cohérent avec les cartes existantes (mêmes `Card` shadcn, icônes `lucide-react`, fond sombre pour la carte mise en avant à la Signova).
- En dessous : aperçu inline de la liste des modèles existants (toujours visible), regroupés par `document_type`, pour pouvoir cliquer directement sur un modèle sans passer par l'étape intermédiaire.

## Comportement des cartes

| Carte | Action |
|---|---|
| Depuis modèle | Scroll vers la grille de modèles + ouvre le sélecteur |
| Importer un PDF/DOCX | Ouvre le dialogue d'upload (réutilise `NewPdfTemplateDialog` de `/app/pdf-templates`) avec option « Utiliser pour ce document » |
| Éditeur WYSIWYG | Navigation vers `/app/documents/wysiwyg` |
| Saisie manuelle | Affiche le formulaire métier actuel (toggle inline ou route dédiée `/app/documents/new/manual`) |

## Fichiers à modifier / créer

- **`src/routes/_authenticated.app.documents.new.tsx`** — remplace le formulaire monolithique par le sélecteur 4 cartes + grille de modèles. Le formulaire actuel est extrait dans un composant `ManualDocumentForm` toggleable.
- **`src/components/documents/StartOptionCard.tsx`** (nouveau) — carte d'action réutilisable (icône, titre, description, badge optionnel).
- **`src/components/documents/TemplatePickerGrid.tsx`** (nouveau) — liste des modèles PDF groupés par `document_type`, factorisée depuis le code existant de `/app/pdf-templates`.
- **`src/components/documents/ManualDocumentForm.tsx`** (nouveau) — extraction du formulaire actuel de `new.tsx` (aucun changement de logique, juste déplacement).
- **`src/locales/fr.json` & `en.json`** — clés `documents.new.startFromTemplate`, `uploadPdf`, `wysiwygEditor`, `manualEntry`, sous-titres et descriptions.

## Détails techniques

- Réutiliser la query `listPdfTemplates` déjà appelée dans `/app/pdf-templates` (server fn dans `src/lib/pdf-templates.functions.ts`) pour la grille embarquée.
- Pour l'upload : importer et réutiliser `NewPdfTemplateDialog` du fichier `_authenticated.app.pdf-templates.index.tsx` (extraire au préalable dans `src/components/pdf-templates/NewPdfTemplateDialog.tsx` pour la partager).
- Aucune migration BDD, aucun changement de schéma : pur travail front + locales.
- Conserver les routes existantes (`/app/documents/wysiwyg`, `/app/pdf-templates`) inchangées.

## Hors-scope

- Pas de chaînage automatique « modèle PDF → document » s'il n'existe pas déjà côté serveur ; si seul le clic « Utiliser » mène à l'éditeur du modèle, on l'indique clairement dans le libellé.
- Pas de refonte du sidebar/header (déjà fait précédemment).
