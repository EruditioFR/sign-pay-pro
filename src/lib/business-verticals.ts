// Shared client/server definitions for business verticals (sectors métier).
// Each vertical provides ready-to-use document templates, workflow templates,
// dynamic variables and a mapping of associated document types.

import type { Database } from "@/integrations/supabase/types";

export type DocumentType = Database["public"]["Enums"]["document_type"];

export type BusinessVerticalId =
  | "real_estate"
  | "car_rental"
  | "services"
  | "goods_sales";

export interface DocumentTemplatePreset {
  name: string;
  document_type: DocumentType;
  primary_color?: string;
  header_html?: string;
  footer_html?: string;
  /** Pre-filled body with {{placeholders}} */
  body_html?: string;
  legal_mentions?: string;
  payment_terms?: string;
  /** Variables that MUST be filled at instantiation time */
  required_fields?: string[];
}

export interface WorkflowStepPreset {
  position: number;
  name: string;
  approver_role:
    | "super_admin"
    | "reseller"
    | "admin_client"
    | "manager"
    | "user"
    | null;
  required: boolean;
}

export interface WorkflowTemplatePreset {
  name: string;
  document_type: DocumentType;
  steps: WorkflowStepPreset[];
}

export interface BusinessVerticalDefinition {
  id: BusinessVerticalId;
  label: string;
  description: string;
  /** Dynamic variables exposed to the editor (mustache-like {{var}}) */
  variables: { key: string; label: string }[];
  /** Document types relevant to this vertical */
  documentTypes: DocumentType[];
  documentTemplates: DocumentTemplatePreset[];
  workflowTemplates: WorkflowTemplatePreset[];
}

const COMMON_FOOTER = `<p style="font-size:11px;color:#6b7280;text-align:center">{{company_name}} — {{company_address}} — SIRET {{company_siret}}</p>`;

const SIGNATURE_BLOCK = `
<table style="width:100%;margin-top:32px;border-collapse:collapse">
  <tr>
    <td style="width:50%;padding:12px;border-top:1px solid #e5e7eb">
      <strong>{{company_name}}</strong><br/>
      Fait à __________________, le __________________<br/>
      Signature :
    </td>
    <td style="width:50%;padding:12px;border-top:1px solid #e5e7eb">
      <strong>{{client_name}}</strong><br/>
      Fait à __________________, le __________________<br/>
      Signature (précédée de « lu et approuvé ») :
    </td>
  </tr>
</table>`;

export const BUSINESS_VERTICALS: BusinessVerticalDefinition[] = [
  {
    id: "real_estate",
    label: "Agent immobilier",
    description:
      "Mandats, compromis, états des lieux et baux pour agences et indépendants.",
    documentTypes: ["contract", "quote", "invoice", "other"],
    variables: [
      { key: "client_name", label: "Nom du client" },
      { key: "client_address", label: "Adresse du client" },
      { key: "property_address", label: "Adresse du bien" },
      { key: "property_type", label: "Type de bien" },
      { key: "property_surface", label: "Surface (m²)" },
      { key: "property_rooms", label: "Nombre de pièces" },
      { key: "sale_price", label: "Prix de vente" },
      { key: "monthly_rent", label: "Loyer mensuel" },
      { key: "deposit", label: "Dépôt de garantie" },
      { key: "agency_fees", label: "Honoraires agence" },
      { key: "mandate_duration", label: "Durée du mandat" },
      { key: "inventory_date", label: "Date de l'état des lieux" },
      { key: "key_count", label: "Nombre de clés remises" },
      { key: "meter_electricity", label: "Compteur électricité" },
      { key: "meter_water", label: "Compteur eau" },
    ],
    documentTemplates: [
      {
        name: "Mandat de vente exclusif",
        document_type: "contract",
        primary_color: "#0f766e",
        required_fields: ["client_name", "property_address", "sale_price", "agency_fees", "mandate_duration"],
        header_html: `<h1>Mandat de vente exclusif n°{{reference}}</h1><p>Entre {{client_name}} (mandant) et {{company_name}} (mandataire).</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Article 1 — Objet du mandat</h2>
<p>Le mandant confie au mandataire, qui accepte, le mandat exclusif de rechercher un acquéreur pour le bien situé : <strong>{{property_address}}</strong> ({{property_type}}, {{property_surface}} m², {{property_rooms}} pièces).</p>

<h2>Article 2 — Prix de vente</h2>
<p>Le prix net vendeur est fixé à <strong>{{sale_price}} €</strong>, honoraires d'agence de {{agency_fees}} % TTC inclus à la charge de l'acquéreur.</p>

<h2>Article 3 — Durée</h2>
<p>Le présent mandat est consenti pour une durée de <strong>{{mandate_duration}}</strong> à compter de la signature, renouvelable par tacite reconduction par périodes de trois mois sans pouvoir excéder vingt-quatre mois au total.</p>

<h2>Article 4 — Exclusivité</h2>
<p>Pendant toute la durée du mandat, le mandant s'interdit de traiter directement ou par l'intermédiaire d'un autre professionnel.</p>

<h2>Article 5 — Honoraires</h2>
<p>En cas de réalisation de la vente, les honoraires de {{agency_fees}} % TTC seront dus au mandataire et payables le jour de la signature de l'acte authentique.</p>
${SIGNATURE_BLOCK}`,
        legal_mentions:
          "Conforme à la loi Hoguet n°70-9 du 2 janvier 1970. Carte professionnelle T n°{{company_card_number}}. Faculté de rétractation de 14 jours à compter de la signature, par lettre recommandée avec accusé de réception.",
        payment_terms: "Honoraires de {{agency_fees}} % TTC à la charge du vendeur, payables à la signature de l'acte authentique.",
      },
      {
        name: "Compromis de vente",
        document_type: "contract",
        primary_color: "#0f766e",
        required_fields: ["client_name", "property_address", "sale_price", "deposit"],
        header_html: `<h1>Compromis de vente — {{property_address}}</h1>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Article 1 — Désignation du bien</h2>
<p>Bien situé : <strong>{{property_address}}</strong> — {{property_type}} de {{property_surface}} m², {{property_rooms}} pièces.</p>

<h2>Article 2 — Prix</h2>
<p>Prix convenu : <strong>{{sale_price}} €</strong>. Un dépôt de garantie de <strong>{{deposit}} €</strong> est versé à la signature du présent compromis et séquestré.</p>

<h2>Article 3 — Conditions suspensives</h2>
<ul>
  <li>Obtention par l'acquéreur d'un prêt immobilier dans un délai de 45 jours.</li>
  <li>Absence de servitude grave non révélée.</li>
  <li>Purge du droit de préemption de la commune.</li>
</ul>

<h2>Article 4 — Délai de rétractation</h2>
<p>L'acquéreur dispose d'un délai de 10 jours pour se rétracter sans avoir à justifier de motif, conformément à l'article L271-1 du Code de la construction et de l'habitation.</p>

<h2>Article 5 — Acte authentique</h2>
<p>L'acte authentique sera signé chez le notaire {{notary_name}} au plus tard le {{closing_date}}.</p>
${SIGNATURE_BLOCK}`,
        legal_mentions:
          "Délai de rétractation de 10 jours conformément à l'article L271-1 du Code de la construction et de l'habitation. Dossier de diagnostics techniques annexé.",
      },
      {
        name: "État des lieux entrant",
        document_type: "other",
        primary_color: "#0f766e",
        required_fields: ["client_name", "property_address", "inventory_date", "key_count"],
        header_html: `<h1>État des lieux d'entrée — {{property_address}}</h1><p>Établi le {{inventory_date}}</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>1. Parties</h2>
<p>Bailleur : <strong>{{company_name}}</strong> — Locataire : <strong>{{client_name}}</strong>.</p>

<h2>2. Logement</h2>
<p>{{property_type}} situé {{property_address}} — {{property_surface}} m² — {{property_rooms}} pièces.</p>

<h2>3. Compteurs</h2>
<table style="width:100%;border-collapse:collapse;margin:8px 0">
  <tr><td style="border:1px solid #ddd;padding:6px"><strong>Électricité</strong></td><td style="border:1px solid #ddd;padding:6px">{{meter_electricity}}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:6px"><strong>Eau</strong></td><td style="border:1px solid #ddd;padding:6px">{{meter_water}}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:6px"><strong>Gaz</strong></td><td style="border:1px solid #ddd;padding:6px">______________</td></tr>
</table>

<h2>4. Clés</h2>
<p>Nombre de clés / badges remis : <strong>{{key_count}}</strong>.</p>

<h2>5. État pièce par pièce</h2>
<p><em>(À compléter pour chaque pièce : sols, murs, plafonds, équipements, observations.)</em></p>
<table style="width:100%;border-collapse:collapse">
  <tr><th style="border:1px solid #ddd;padding:6px">Pièce</th><th style="border:1px solid #ddd;padding:6px">Sols</th><th style="border:1px solid #ddd;padding:6px">Murs / plafond</th><th style="border:1px solid #ddd;padding:6px">Équipements</th><th style="border:1px solid #ddd;padding:6px">Observations</th></tr>
  <tr><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td></tr>
  <tr><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td></tr>
</table>
${SIGNATURE_BLOCK}`,
        legal_mentions: "Loi n°89-462 du 6 juillet 1989. Décret n°2016-382 du 30 mars 2016 relatif aux modalités d'établissement de l'état des lieux.",
      },
      {
        name: "État des lieux sortant",
        document_type: "other",
        primary_color: "#0f766e",
        required_fields: ["client_name", "property_address", "inventory_date", "key_count"],
        header_html: `<h1>État des lieux de sortie — {{property_address}}</h1><p>Établi le {{inventory_date}}</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>1. Parties</h2>
<p>Bailleur : <strong>{{company_name}}</strong> — Locataire sortant : <strong>{{client_name}}</strong>.</p>

<h2>2. Relevés de compteurs à la sortie</h2>
<table style="width:100%;border-collapse:collapse;margin:8px 0">
  <tr><td style="border:1px solid #ddd;padding:6px"><strong>Électricité</strong></td><td style="border:1px solid #ddd;padding:6px">{{meter_electricity}}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:6px"><strong>Eau</strong></td><td style="border:1px solid #ddd;padding:6px">{{meter_water}}</td></tr>
</table>

<h2>3. Restitution des clés</h2>
<p>{{key_count}} clé(s) / badge(s) restitué(s).</p>

<h2>4. Comparaison avec l'état des lieux d'entrée</h2>
<p><em>Dégradations imputables au locataire :</em></p>
<table style="width:100%;border-collapse:collapse">
  <tr><th style="border:1px solid #ddd;padding:6px">Pièce / élément</th><th style="border:1px solid #ddd;padding:6px">Description du dommage</th><th style="border:1px solid #ddd;padding:6px">Coût estimé</th></tr>
  <tr><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td></tr>
</table>

<h2>5. Restitution du dépôt de garantie</h2>
<p>Dépôt initial : <strong>{{deposit}} €</strong>. Montant restitué après déduction éventuelle : __________ €.</p>
${SIGNATURE_BLOCK}`,
        legal_mentions: "Restitution du dépôt de garantie sous 1 mois si état conforme, 2 mois sinon (art. 22 loi du 6 juillet 1989).",
      },
      {
        name: "Bail d'habitation meublée",
        document_type: "contract",
        primary_color: "#0f766e",
        required_fields: ["client_name", "property_address", "monthly_rent", "deposit"],
        header_html: `<h1>Bail meublé — {{property_address}}</h1>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Article 1 — Désignation du logement</h2>
<p>{{property_type}} meublé situé {{property_address}}, {{property_surface}} m², {{property_rooms}} pièces.</p>

<h2>Article 2 — Durée du bail</h2>
<p>Bail consenti pour une durée d'un an, à compter du {{start_date}}, reconductible tacitement.</p>

<h2>Article 3 — Loyer et charges</h2>
<p>Loyer mensuel : <strong>{{monthly_rent}} €</strong> hors charges. Provision sur charges : __________ €. Dépôt de garantie : <strong>{{deposit}} €</strong>.</p>

<h2>Article 4 — Obligations du locataire</h2>
<ul>
  <li>Payer le loyer aux échéances convenues.</li>
  <li>Souscrire une assurance habitation et en justifier annuellement.</li>
  <li>Jouir paisiblement des lieux.</li>
</ul>
${SIGNATURE_BLOCK}`,
        legal_mentions:
          "Bail régi par la loi n°89-462 du 6 juillet 1989 modifiée, articles 25-3 et suivants pour la location meublée.",
        payment_terms: "Loyer payable d'avance le 1er de chaque mois par virement.",
      },
      {
        name: "Facture d'honoraires d'agence",
        document_type: "invoice",
        primary_color: "#0f766e",
        required_fields: ["client_name", "property_address", "agency_fees", "sale_price"],
        legal_mentions: "TVA non applicable, art. 293 B du CGI — ou TVA 20%. Carte professionnelle T n°{{company_card_number}}.",
        payment_terms: "Paiement à 30 jours par virement.",
      },
    ],
    workflowTemplates: [
      {
        name: "Validation mandat immobilier",
        document_type: "contract",
        steps: [
          { position: 1, name: "Vérification négociateur", approver_role: "user", required: true },
          { position: 2, name: "Validation directeur d'agence", approver_role: "manager", required: true },
        ],
      },
    ],
  },
  {
    id: "car_rental",
    label: "Location de véhicules",
    description:
      "Contrats de location courte/longue durée, états des lieux véhicule et factures.",
    documentTypes: ["contract", "quote", "invoice", "other"],
    variables: [
      { key: "client_name", label: "Nom du locataire" },
      { key: "client_address", label: "Adresse du locataire" },
      { key: "client_license", label: "Numéro de permis" },
      { key: "client_license_date", label: "Date d'obtention du permis" },
      { key: "vehicle_brand", label: "Marque" },
      { key: "vehicle_model", label: "Modèle" },
      { key: "vehicle_plate", label: "Immatriculation" },
      { key: "vehicle_color", label: "Couleur" },
      { key: "pickup_date", label: "Date de départ" },
      { key: "pickup_location", label: "Lieu de prise en charge" },
      { key: "return_date", label: "Date de retour" },
      { key: "return_location", label: "Lieu de restitution" },
      { key: "pickup_mileage", label: "Kilométrage initial" },
      { key: "return_mileage", label: "Kilométrage retour" },
      { key: "fuel_level_pickup", label: "Niveau carburant départ" },
      { key: "fuel_level_return", label: "Niveau carburant retour" },
      { key: "daily_rate", label: "Tarif journalier" },
      { key: "rental_duration", label: "Durée location (jours)" },
      { key: "deposit", label: "Caution" },
      { key: "insurance_option", label: "Option assurance" },
    ],
    documentTemplates: [
      {
        name: "Contrat de location véhicule",
        document_type: "contract",
        primary_color: "#1d4ed8",
        required_fields: ["client_name", "client_license", "vehicle_plate", "pickup_date", "return_date", "daily_rate", "deposit"],
        header_html: `<h1>Contrat de location n°{{reference}}</h1><p>Véhicule {{vehicle_brand}} {{vehicle_model}} — {{vehicle_plate}}</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Article 1 — Parties</h2>
<p>Loueur : <strong>{{company_name}}</strong> — Locataire : <strong>{{client_name}}</strong>, titulaire du permis n°{{client_license}} délivré le {{client_license_date}}.</p>

<h2>Article 2 — Véhicule loué</h2>
<p>{{vehicle_brand}} {{vehicle_model}} — {{vehicle_color}} — Immatriculation : <strong>{{vehicle_plate}}</strong>.</p>

<h2>Article 3 — Durée et lieux</h2>
<p>Prise en charge le <strong>{{pickup_date}}</strong> à {{pickup_location}}. Restitution prévue le <strong>{{return_date}}</strong> à {{return_location}}. Durée totale : {{rental_duration}} jour(s).</p>

<h2>Article 4 — Tarif et caution</h2>
<p>Tarif : <strong>{{daily_rate}} €/jour TTC</strong>. Caution : <strong>{{deposit}} €</strong> bloquée sur la carte bancaire du locataire et libérée à la restitution conforme.</p>

<h2>Article 5 — Assurance et franchise</h2>
<p>Option choisie : <strong>{{insurance_option}}</strong>. Franchise applicable en cas de sinistre selon les conditions de cette option.</p>

<h2>Article 6 — Obligations du locataire</h2>
<ul>
  <li>Restituer le véhicule dans l'état initial, avec le même niveau de carburant.</li>
  <li>N'utiliser le véhicule que sur routes ouvertes à la circulation publique.</li>
  <li>Signaler immédiatement tout incident ou accident.</li>
</ul>
${SIGNATURE_BLOCK}`,
        legal_mentions:
          "Caution de {{deposit}} € bloquée à la prise du véhicule. Conditions générales de location remises et acceptées par le locataire.",
        payment_terms: "Tarif {{daily_rate}} €/jour TTC. Paiement par CB à la prise du véhicule.",
      },
      {
        name: "Devis location courte durée",
        document_type: "quote",
        primary_color: "#1d4ed8",
        required_fields: ["client_name", "vehicle_brand", "vehicle_model", "pickup_date", "return_date", "daily_rate"],
        body_html: `
<h2>Détail du devis</h2>
<table style="width:100%;border-collapse:collapse">
  <tr><th style="border:1px solid #ddd;padding:6px;text-align:left">Désignation</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Quantité</th><th style="border:1px solid #ddd;padding:6px;text-align:right">PU HT</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Total HT</th></tr>
  <tr><td style="border:1px solid #ddd;padding:6px">Location {{vehicle_brand}} {{vehicle_model}}</td><td style="border:1px solid #ddd;padding:6px;text-align:right">{{rental_duration}} j</td><td style="border:1px solid #ddd;padding:6px;text-align:right">{{daily_rate}} €</td><td style="border:1px solid #ddd;padding:6px;text-align:right"></td></tr>
  <tr><td style="border:1px solid #ddd;padding:6px">Option assurance {{insurance_option}}</td><td style="border:1px solid #ddd;padding:6px;text-align:right"></td><td style="border:1px solid #ddd;padding:6px;text-align:right"></td><td style="border:1px solid #ddd;padding:6px;text-align:right"></td></tr>
</table>
<p style="margin-top:16px"><strong>Devis valable 15 jours.</strong></p>`,
      },
      {
        name: "État des lieux véhicule — départ",
        document_type: "other",
        primary_color: "#1d4ed8",
        required_fields: ["client_name", "vehicle_plate", "pickup_date", "pickup_mileage", "fuel_level_pickup"],
        header_html: `<h1>État des lieux véhicule — Départ</h1><p>{{vehicle_brand}} {{vehicle_model}} — {{vehicle_plate}}</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Identification</h2>
<p>Locataire : <strong>{{client_name}}</strong> — Date : <strong>{{pickup_date}}</strong> — Lieu : {{pickup_location}}.</p>

<h2>Compteurs</h2>
<table style="width:100%;border-collapse:collapse">
  <tr><td style="border:1px solid #ddd;padding:6px"><strong>Kilométrage</strong></td><td style="border:1px solid #ddd;padding:6px">{{pickup_mileage}} km</td></tr>
  <tr><td style="border:1px solid #ddd;padding:6px"><strong>Niveau carburant</strong></td><td style="border:1px solid #ddd;padding:6px">{{fuel_level_pickup}}</td></tr>
</table>

<h2>État de la carrosserie</h2>
<p><em>Schéma véhicule à annoter (avant, arrière, côté gauche, côté droit, toit). Détailler ci-dessous les rayures, impacts, manquants :</em></p>
<table style="width:100%;border-collapse:collapse">
  <tr><th style="border:1px solid #ddd;padding:6px">Zone</th><th style="border:1px solid #ddd;padding:6px">Observation</th></tr>
  <tr><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td></tr>
  <tr><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td></tr>
</table>

<h2>Équipements vérifiés</h2>
<ul>
  <li>☐ Roue de secours / kit anti-crevaison</li>
  <li>☐ Triangle + gilet</li>
  <li>☐ Carte grise (copie) + carte verte</li>
  <li>☐ Tapis de sol</li>
</ul>
${SIGNATURE_BLOCK}`,
      },
      {
        name: "État des lieux véhicule — retour",
        document_type: "other",
        primary_color: "#1d4ed8",
        required_fields: ["client_name", "vehicle_plate", "return_date", "return_mileage", "fuel_level_return"],
        header_html: `<h1>État des lieux véhicule — Retour</h1><p>{{vehicle_brand}} {{vehicle_model}} — {{vehicle_plate}}</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Identification</h2>
<p>Locataire : <strong>{{client_name}}</strong> — Date retour : <strong>{{return_date}}</strong> — Lieu : {{return_location}}.</p>

<h2>Compteurs au retour</h2>
<table style="width:100%;border-collapse:collapse">
  <tr><td style="border:1px solid #ddd;padding:6px"><strong>Kilométrage</strong></td><td style="border:1px solid #ddd;padding:6px">{{return_mileage}} km</td></tr>
  <tr><td style="border:1px solid #ddd;padding:6px"><strong>Niveau carburant</strong></td><td style="border:1px solid #ddd;padding:6px">{{fuel_level_return}}</td></tr>
</table>

<h2>Comparaison départ / retour</h2>
<p>Kilomètres parcourus : ({{return_mileage}} - {{pickup_mileage}}) km.</p>
<p>Nouveaux dommages constatés : <em>(à détailler)</em></p>
<table style="width:100%;border-collapse:collapse">
  <tr><th style="border:1px solid #ddd;padding:6px">Zone</th><th style="border:1px solid #ddd;padding:6px">Dommage</th><th style="border:1px solid #ddd;padding:6px">Facturation</th></tr>
  <tr><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td></tr>
</table>

<h2>Caution</h2>
<p>Caution de <strong>{{deposit}} €</strong> : ☐ libérée intégralement &nbsp; ☐ retenue partielle de __________ €.</p>
${SIGNATURE_BLOCK}`,
      },
      {
        name: "Facture location",
        document_type: "invoice",
        primary_color: "#1d4ed8",
        required_fields: ["client_name", "vehicle_plate", "rental_duration", "daily_rate"],
        payment_terms: "Paiement comptant à la restitution du véhicule.",
      },
    ],
    workflowTemplates: [
      {
        name: "Validation contrat location",
        document_type: "contract",
        steps: [
          { position: 1, name: "Vérification agent comptoir", approver_role: "user", required: true },
          { position: 2, name: "Validation responsable d'agence", approver_role: "manager", required: false },
        ],
      },
    ],
  },
  {
    id: "services",
    label: "Société de services",
    description:
      "Devis, contrats de prestation, NDA et factures pour ESN, agences, freelances.",
    documentTypes: ["quote", "contract", "invoice", "other"],
    variables: [
      { key: "client_name", label: "Nom du client" },
      { key: "client_company", label: "Société du client" },
      { key: "client_address", label: "Adresse du client" },
      { key: "client_siret", label: "SIRET client" },
      { key: "mission_title", label: "Intitulé de mission" },
      { key: "mission_scope", label: "Périmètre" },
      { key: "deliverables", label: "Livrables" },
      { key: "start_date", label: "Date de démarrage" },
      { key: "end_date", label: "Date de fin" },
      { key: "daily_rate", label: "TJM" },
      { key: "estimated_days", label: "Nombre de jours estimés" },
      { key: "total_ht", label: "Total HT" },
      { key: "total_ttc", label: "Total TTC" },
      { key: "confidentiality_duration", label: "Durée confidentialité" },
    ],
    documentTemplates: [
      {
        name: "Proposition commerciale",
        document_type: "quote",
        primary_color: "#7c3aed",
        required_fields: ["client_company", "mission_title", "estimated_days", "daily_rate"],
        header_html: `<h1>Proposition — {{mission_title}}</h1><p>Pour {{client_company}}</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>1. Contexte</h2>
<p>{{client_company}} souhaite être accompagné par {{company_name}} sur la mission : <strong>{{mission_title}}</strong>.</p>

<h2>2. Périmètre</h2>
<p>{{mission_scope}}</p>

<h2>3. Livrables</h2>
<p>{{deliverables}}</p>

<h2>4. Planning</h2>
<p>Démarrage prévu le {{start_date}}, fin estimée le {{end_date}}.</p>

<h2>5. Budget</h2>
<table style="width:100%;border-collapse:collapse">
  <tr><th style="border:1px solid #ddd;padding:6px;text-align:left">Désignation</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Jours</th><th style="border:1px solid #ddd;padding:6px;text-align:right">TJM HT</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Total HT</th></tr>
  <tr><td style="border:1px solid #ddd;padding:6px">{{mission_title}}</td><td style="border:1px solid #ddd;padding:6px;text-align:right">{{estimated_days}}</td><td style="border:1px solid #ddd;padding:6px;text-align:right">{{daily_rate}} €</td><td style="border:1px solid #ddd;padding:6px;text-align:right">{{total_ht}} €</td></tr>
</table>
<p style="text-align:right;margin-top:8px"><strong>Total TTC : {{total_ttc}} €</strong></p>`,
        payment_terms: "Devis valable 30 jours. Acompte de 30% à la commande, solde à livraison.",
      },
      {
        name: "Contrat de prestation de service",
        document_type: "contract",
        primary_color: "#7c3aed",
        required_fields: ["client_company", "mission_title", "start_date", "end_date", "daily_rate"],
        body_html: `
<h2>Article 1 — Objet</h2>
<p>Le présent contrat a pour objet la réalisation par <strong>{{company_name}}</strong> au profit de <strong>{{client_company}}</strong> de la mission « {{mission_title}} ».</p>

<h2>Article 2 — Périmètre</h2>
<p>{{mission_scope}}. Livrables attendus : {{deliverables}}.</p>

<h2>Article 3 — Durée</h2>
<p>Du {{start_date}} au {{end_date}}.</p>

<h2>Article 4 — Prix et modalités</h2>
<p>Forfait facturé sur la base de {{estimated_days}} jours à {{daily_rate}} € HT/jour. Acompte 30% à la commande, solde à livraison.</p>

<h2>Article 5 — Obligations du prestataire</h2>
<p>Obligation de moyens. Respect des règles de l'art et des délais convenus.</p>

<h2>Article 6 — Confidentialité</h2>
<p>Chaque partie s'engage à préserver la confidentialité des informations échangées pendant toute la durée du contrat et {{confidentiality_duration}} après son terme.</p>

<h2>Article 7 — Propriété intellectuelle</h2>
<p>Les droits sur les livrables sont transférés au client au paiement intégral du prix.</p>
${SIGNATURE_BLOCK}`,
        legal_mentions:
          "Obligation de moyens. Confidentialité réciproque. Propriété intellectuelle des livrables transférée au paiement intégral.",
      },
      {
        name: "Accord de confidentialité (NDA)",
        document_type: "contract",
        primary_color: "#7c3aed",
        required_fields: ["client_company", "client_name", "mission_title", "confidentiality_duration"],
        header_html: `<h1>Accord de confidentialité</h1><p>Entre {{company_name}} et {{client_company}}</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Article 1 — Parties</h2>
<p>Entre <strong>{{company_name}}</strong>, ci-après « Partie divulgatrice », et <strong>{{client_company}}</strong>, représenté par {{client_name}}, ci-après « Partie réceptrice ».</p>

<h2>Article 2 — Objet</h2>
<p>Dans le cadre des discussions relatives à « {{mission_title}} », les parties pourront s'échanger des informations confidentielles. Le présent accord en encadre l'usage.</p>

<h2>Article 3 — Définition des informations confidentielles</h2>
<p>Toute information, technique, commerciale, financière ou stratégique communiquée, sous quelque forme que ce soit, et identifiée comme confidentielle ou dont le caractère confidentiel est raisonnablement présumé.</p>

<h2>Article 4 — Engagements</h2>
<ul>
  <li>Ne divulguer les informations confidentielles à aucun tiers sans accord écrit préalable.</li>
  <li>N'utiliser les informations qu'aux seules fins du projet visé à l'article 2.</li>
  <li>Restreindre l'accès aux seules personnes ayant besoin d'en connaître.</li>
  <li>Restituer ou détruire les informations sur simple demande.</li>
</ul>

<h2>Article 5 — Durée</h2>
<p>Le présent accord prend effet à sa signature et s'applique pendant <strong>{{confidentiality_duration}}</strong>, y compris après la fin des discussions ou du projet.</p>

<h2>Article 6 — Exceptions</h2>
<p>Ne sont pas considérées comme confidentielles les informations publiques, déjà connues du récepteur avant divulgation, ou obtenues légitimement d'un tiers non lié.</p>

<h2>Article 7 — Sanction</h2>
<p>Toute violation du présent accord engage la responsabilité de son auteur, sans préjudice de dommages-intérêts complémentaires.</p>

<h2>Article 8 — Droit applicable</h2>
<p>Le présent accord est soumis au droit français. Tout litige relèvera de la compétence exclusive des tribunaux du ressort du siège de {{company_name}}.</p>
${SIGNATURE_BLOCK}`,
        legal_mentions: "Accord de confidentialité unilatéral / bilatéral selon options retenues entre les parties.",
      },
      {
        name: "Ordre de mission",
        document_type: "other",
        primary_color: "#7c3aed",
        required_fields: ["client_company", "mission_title", "start_date", "end_date"],
        body_html: `
<h2>Mission</h2>
<p><strong>{{mission_title}}</strong> chez {{client_company}}.</p>
<h2>Périmètre</h2>
<p>{{mission_scope}}</p>
<h2>Période</h2>
<p>Du {{start_date}} au {{end_date}} — {{estimated_days}} jour(s) prévus.</p>`,
      },
      {
        name: "Facture prestation",
        document_type: "invoice",
        primary_color: "#7c3aed",
        required_fields: ["client_company", "mission_title", "total_ht", "total_ttc"],
        payment_terms: "Paiement à 30 jours fin de mois. Pénalités de retard : 3× taux légal. Indemnité forfaitaire de recouvrement : 40 €.",
        legal_mentions: "TVA sur les débits — n° TVA {{company_vat}}.",
      },
    ],
    workflowTemplates: [
      {
        name: "Validation devis service",
        document_type: "quote",
        steps: [
          { position: 1, name: "Revue commerciale", approver_role: "user", required: true },
          { position: 2, name: "Validation direction", approver_role: "admin_client", required: true },
        ],
      },
      {
        name: "Validation facture service",
        document_type: "invoice",
        steps: [
          { position: 1, name: "Contrôle compta", approver_role: "manager", required: true },
        ],
      },
    ],
  },
  {
    id: "goods_sales",
    label: "Vente de marchandises",
    description:
      "Bons de commande, bons de livraison, CGV et factures pour grossistes, distributeurs et e-commerce B2B.",
    documentTypes: ["purchase_order", "quote", "invoice", "other"],
    variables: [
      { key: "client_name", label: "Nom du client" },
      { key: "client_company", label: "Société" },
      { key: "client_siret", label: "SIRET client" },
      { key: "delivery_address", label: "Adresse de livraison" },
      { key: "billing_address", label: "Adresse de facturation" },
      { key: "order_reference", label: "Réf. commande" },
      { key: "items_table", label: "Tableau articles" },
      { key: "subtotal_ht", label: "Sous-total HT" },
      { key: "vat_amount", label: "TVA" },
      { key: "total_ttc", label: "Total TTC" },
      { key: "delivery_date", label: "Date de livraison" },
      { key: "incoterm", label: "Incoterm" },
      { key: "carrier", label: "Transporteur" },
    ],
    documentTemplates: [
      {
        name: "Bon de commande",
        document_type: "purchase_order",
        primary_color: "#b45309",
        required_fields: ["client_company", "order_reference", "delivery_address", "delivery_date", "total_ttc"],
        header_html: `<h1>Bon de commande n°{{order_reference}}</h1><p>Livraison : {{delivery_address}} — {{delivery_date}}</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Acheteur</h2>
<p><strong>{{client_company}}</strong> — {{billing_address}} — SIRET {{client_siret}}</p>

<h2>Livraison</h2>
<p>Adresse : {{delivery_address}}<br/>Date souhaitée : <strong>{{delivery_date}}</strong> — Incoterm : {{incoterm}} — Transporteur : {{carrier}}</p>

<h2>Articles commandés</h2>
<table style="width:100%;border-collapse:collapse">
  <tr><th style="border:1px solid #ddd;padding:6px;text-align:left">Référence</th><th style="border:1px solid #ddd;padding:6px;text-align:left">Désignation</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Qté</th><th style="border:1px solid #ddd;padding:6px;text-align:right">PU HT</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Total HT</th></tr>
  <tr><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td></tr>
</table>
<table style="width:100%;margin-top:8px">
  <tr><td style="text-align:right;padding:4px">Sous-total HT</td><td style="text-align:right;width:120px;padding:4px"><strong>{{subtotal_ht}} €</strong></td></tr>
  <tr><td style="text-align:right;padding:4px">TVA</td><td style="text-align:right;padding:4px">{{vat_amount}} €</td></tr>
  <tr><td style="text-align:right;padding:4px">Total TTC</td><td style="text-align:right;padding:4px"><strong>{{total_ttc}} €</strong></td></tr>
</table>`,
        legal_mentions:
          "Commande ferme sous réserve d'acceptation par le fournisseur. Incoterm {{incoterm}}.",
        payment_terms: "Paiement à 30 jours fin de mois par virement.",
      },
      {
        name: "Devis marchandises",
        document_type: "quote",
        primary_color: "#b45309",
        required_fields: ["client_company", "total_ht"],
      },
      {
        name: "Bon de livraison",
        document_type: "other",
        primary_color: "#b45309",
        required_fields: ["client_company", "order_reference", "delivery_address", "delivery_date"],
        header_html: `<h1>Bon de livraison — {{order_reference}}</h1>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Livraison</h2>
<p>Destinataire : <strong>{{client_company}}</strong><br/>Adresse : {{delivery_address}}<br/>Date : {{delivery_date}} — Transporteur : {{carrier}}</p>

<h2>Détail des articles livrés</h2>
<table style="width:100%;border-collapse:collapse">
  <tr><th style="border:1px solid #ddd;padding:6px">Référence</th><th style="border:1px solid #ddd;padding:6px">Désignation</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Qté commandée</th><th style="border:1px solid #ddd;padding:6px;text-align:right">Qté livrée</th></tr>
  <tr><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td><td style="border:1px solid #ddd;padding:18px"></td></tr>
</table>

<p style="margin-top:16px"><em>Toute réserve doit être formulée par écrit dans les 48 heures suivant la réception.</em></p>
${SIGNATURE_BLOCK}`,
      },
      {
        name: "Facture marchandises",
        document_type: "invoice",
        primary_color: "#b45309",
        required_fields: ["client_company", "order_reference", "subtotal_ht", "total_ttc"],
        payment_terms: "Net 30 jours. Escompte 2% pour paiement comptant.",
        legal_mentions: "Réserve de propriété : les marchandises restent la propriété du vendeur jusqu'au paiement intégral (loi du 12 mai 1980).",
      },
      {
        name: "Conditions générales de vente",
        document_type: "other",
        primary_color: "#b45309",
        required_fields: [],
        header_html: `<h1>Conditions générales de vente</h1><p>{{company_name}} — En vigueur au {{system.today}}</p>`,
        footer_html: COMMON_FOOTER,
        body_html: `
<h2>Article 1 — Objet et champ d'application</h2>
<p>Les présentes conditions générales de vente (CGV) régissent les relations contractuelles entre <strong>{{company_name}}</strong> et tout client professionnel pour la vente de marchandises. Toute commande emporte acceptation sans réserve des présentes.</p>

<h2>Article 2 — Commandes</h2>
<p>Les commandes ne sont définitives qu'après confirmation écrite du vendeur. Toute modification doit faire l'objet d'un accord écrit.</p>

<h2>Article 3 — Prix</h2>
<p>Les prix sont indiqués en euros hors taxes. La TVA et les éventuels frais de port sont facturés en sus selon le tarif en vigueur au jour de la commande.</p>

<h2>Article 4 — Livraison</h2>
<p>Les délais de livraison sont donnés à titre indicatif. Le transfert des risques s'effectue à la livraison selon l'Incoterm convenu (par défaut : EXW {{company_address}}).</p>

<h2>Article 5 — Réserves</h2>
<p>Toute réserve sur les marchandises livrées doit être notifiée au transporteur et au vendeur par écrit dans un délai de 48 heures.</p>

<h2>Article 6 — Paiement</h2>
<p>Sauf accord contraire, les factures sont payables à 30 jours date de facture. Tout retard de paiement entraîne, de plein droit, l'application de pénalités au taux de 3 fois le taux d'intérêt légal et d'une indemnité forfaitaire de recouvrement de 40 € (art. L441-10 du Code de commerce).</p>

<h2>Article 7 — Réserve de propriété</h2>
<p>Les marchandises livrées restent la propriété du vendeur jusqu'au paiement intégral du prix (loi du 12 mai 1980). Le risque est en revanche transféré à l'acheteur dès la livraison.</p>

<h2>Article 8 — Garantie</h2>
<p>Les marchandises bénéficient de la garantie légale de conformité et de la garantie des vices cachés. Toute réclamation doit être formulée par écrit dans les 30 jours suivant la découverte du défaut.</p>

<h2>Article 9 — Force majeure</h2>
<p>Les obligations des parties sont suspendues en cas de force majeure au sens de l'article 1218 du Code civil.</p>

<h2>Article 10 — Données personnelles</h2>
<p>Les données collectées sont traitées conformément au RGPD. Le client dispose d'un droit d'accès, de rectification et d'opposition.</p>

<h2>Article 11 — Loi applicable et juridiction</h2>
<p>Les présentes CGV sont soumises au droit français. En cas de litige, et à défaut d'accord amiable, compétence exclusive est attribuée aux tribunaux du ressort du siège de {{company_name}}.</p>`,
        legal_mentions: "CGV conformes aux articles L441-1 et suivants du Code de commerce.",
      },
    ],
    workflowTemplates: [
      {
        name: "Validation bon de commande",
        document_type: "purchase_order",
        steps: [
          { position: 1, name: "Validation acheteur", approver_role: "user", required: true },
          { position: 2, name: "Validation responsable achats", approver_role: "manager", required: true },
          { position: 3, name: "Validation finance (>10 k€)", approver_role: "admin_client", required: false },
        ],
      },
      {
        name: "Validation facture marchandises",
        document_type: "invoice",
        steps: [
          { position: 1, name: "Contrôle BL/Facture", approver_role: "manager", required: true },
        ],
      },
    ],
  },
];

export function getBusinessVertical(id: string): BusinessVerticalDefinition | undefined {
  return BUSINESS_VERTICALS.find((v) => v.id === id);
}
