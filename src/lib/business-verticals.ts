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
  legal_mentions?: string;
  payment_terms?: string;
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

export const BUSINESS_VERTICALS: BusinessVerticalDefinition[] = [
  {
    id: "real_estate",
    label: "Agent immobilier",
    description:
      "Mandats, baux, états des lieux et compromis pour agences et indépendants.",
    documentTypes: ["contract", "quote", "invoice", "other"],
    variables: [
      { key: "client_name", label: "Nom du client" },
      { key: "property_address", label: "Adresse du bien" },
      { key: "property_type", label: "Type de bien" },
      { key: "property_surface", label: "Surface (m²)" },
      { key: "sale_price", label: "Prix de vente" },
      { key: "monthly_rent", label: "Loyer mensuel" },
      { key: "deposit", label: "Dépôt de garantie" },
      { key: "agency_fees", label: "Honoraires agence" },
      { key: "mandate_duration", label: "Durée du mandat" },
    ],
    documentTemplates: [
      {
        name: "Mandat de vente exclusif",
        document_type: "contract",
        primary_color: "#0f766e",
        header_html: `<h1>Mandat de vente exclusif n°{{reference}}</h1><p>Entre {{client_name}} (mandant) et {{company_name}} (mandataire).</p>`,
        footer_html: COMMON_FOOTER,
        legal_mentions:
          "Conforme à la loi Hoguet n°70-9 du 2 janvier 1970. Mandat à durée déterminée de {{mandate_duration}}, renouvelable par tacite reconduction.",
        payment_terms: "Honoraires de {{agency_fees}} % TTC à la charge du vendeur, payables à la signature de l'acte authentique.",
      },
      {
        name: "Bail d'habitation meublée",
        document_type: "contract",
        primary_color: "#0f766e",
        header_html: `<h1>Bail meublé — {{property_address}}</h1>`,
        footer_html: COMMON_FOOTER,
        legal_mentions:
          "Bail régi par la loi n°89-462 du 6 juillet 1989 modifiée. Loyer de {{monthly_rent}} €/mois, dépôt de garantie de {{deposit}} €.",
        payment_terms: "Loyer payable d'avance le 1er de chaque mois par virement.",
      },
      {
        name: "Compromis de vente",
        document_type: "contract",
        primary_color: "#0f766e",
        header_html: `<h1>Compromis de vente — {{property_address}}</h1>`,
        legal_mentions:
          "Délai de rétractation de 10 jours conformément à l'article L271-1 du Code de la construction et de l'habitation.",
      },
      {
        name: "Facture d'honoraires d'agence",
        document_type: "invoice",
        primary_color: "#0f766e",
        legal_mentions: "TVA non applicable, art. 293 B du CGI — ou TVA 20%.",
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
      "Contrats de location courte/longue durée, états des lieux et factures pour loueurs.",
    documentTypes: ["contract", "quote", "invoice"],
    variables: [
      { key: "client_name", label: "Nom du locataire" },
      { key: "client_license", label: "Numéro de permis" },
      { key: "vehicle_brand", label: "Marque" },
      { key: "vehicle_model", label: "Modèle" },
      { key: "vehicle_plate", label: "Immatriculation" },
      { key: "pickup_date", label: "Date de départ" },
      { key: "return_date", label: "Date de retour" },
      { key: "pickup_mileage", label: "Kilométrage initial" },
      { key: "daily_rate", label: "Tarif journalier" },
      { key: "deposit", label: "Caution" },
      { key: "insurance_option", label: "Option assurance" },
    ],
    documentTemplates: [
      {
        name: "Contrat de location véhicule",
        document_type: "contract",
        primary_color: "#1d4ed8",
        header_html: `<h1>Contrat de location n°{{reference}}</h1><p>Véhicule {{vehicle_brand}} {{vehicle_model}} — {{vehicle_plate}}</p>`,
        footer_html: COMMON_FOOTER,
        legal_mentions:
          "Caution de {{deposit}} € bloquée à la prise du véhicule. Franchise applicable en cas de sinistre selon l'option {{insurance_option}}.",
        payment_terms: "Tarif {{daily_rate}} €/jour TTC. Paiement par CB à la prise du véhicule.",
      },
      {
        name: "Devis location courte durée",
        document_type: "quote",
        primary_color: "#1d4ed8",
      },
      {
        name: "État des lieux véhicule",
        document_type: "other",
        primary_color: "#1d4ed8",
        header_html: `<h1>État des lieux — {{vehicle_plate}}</h1>`,
      },
      {
        name: "Facture location",
        document_type: "invoice",
        primary_color: "#1d4ed8",
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
      "Propositions commerciales, contrats de prestation et factures pour ESN, agences, freelances.",
    documentTypes: ["quote", "contract", "invoice"],
    variables: [
      { key: "client_name", label: "Nom du client" },
      { key: "client_company", label: "Société du client" },
      { key: "mission_title", label: "Intitulé de mission" },
      { key: "mission_scope", label: "Périmètre" },
      { key: "start_date", label: "Date de démarrage" },
      { key: "end_date", label: "Date de fin" },
      { key: "daily_rate", label: "TJM" },
      { key: "estimated_days", label: "Nombre de jours estimés" },
      { key: "total_ht", label: "Total HT" },
      { key: "total_ttc", label: "Total TTC" },
    ],
    documentTemplates: [
      {
        name: "Proposition commerciale",
        document_type: "quote",
        primary_color: "#7c3aed",
        header_html: `<h1>Proposition — {{mission_title}}</h1><p>Pour {{client_company}}</p>`,
        footer_html: COMMON_FOOTER,
        payment_terms: "Devis valable 30 jours. Acompte de 30% à la commande, solde à livraison.",
      },
      {
        name: "Contrat de prestation de service",
        document_type: "contract",
        primary_color: "#7c3aed",
        legal_mentions:
          "Obligation de moyens. Confidentialité réciproque. Propriété intellectuelle des livrables transférée au paiement intégral.",
      },
      {
        name: "Facture prestation",
        document_type: "invoice",
        primary_color: "#7c3aed",
        payment_terms: "Paiement à 30 jours fin de mois. Pénalités de retard : 3× taux légal. Indemnité forfaitaire de recouvrement : 40 €.",
        legal_mentions: "TVA sur les débits — n° TVA {{company_vat}}.",
      },
      {
        name: "Ordre de mission",
        document_type: "other",
        primary_color: "#7c3aed",
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
      "Bons de commande, bons de livraison et factures pour grossistes, distributeurs et e-commerce B2B.",
    documentTypes: ["purchase_order", "quote", "invoice", "other"],
    variables: [
      { key: "client_name", label: "Nom du client" },
      { key: "client_company", label: "Société" },
      { key: "delivery_address", label: "Adresse de livraison" },
      { key: "order_reference", label: "Réf. commande" },
      { key: "items_table", label: "Tableau articles" },
      { key: "subtotal_ht", label: "Sous-total HT" },
      { key: "vat_amount", label: "TVA" },
      { key: "total_ttc", label: "Total TTC" },
      { key: "delivery_date", label: "Date de livraison" },
      { key: "incoterm", label: "Incoterm" },
    ],
    documentTemplates: [
      {
        name: "Bon de commande",
        document_type: "purchase_order",
        primary_color: "#b45309",
        header_html: `<h1>Bon de commande n°{{order_reference}}</h1><p>Livraison : {{delivery_address}} — {{delivery_date}}</p>`,
        footer_html: COMMON_FOOTER,
        legal_mentions:
          "Commande ferme sous réserve d'acceptation par le fournisseur. Incoterm {{incoterm}}.",
        payment_terms: "Paiement à 30 jours fin de mois par virement.",
      },
      {
        name: "Devis marchandises",
        document_type: "quote",
        primary_color: "#b45309",
      },
      {
        name: "Bon de livraison",
        document_type: "other",
        primary_color: "#b45309",
        header_html: `<h1>Bon de livraison — {{order_reference}}</h1>`,
      },
      {
        name: "Facture marchandises",
        document_type: "invoice",
        primary_color: "#b45309",
        payment_terms: "Net 30 jours. Escompte 2% pour paiement comptant.",
        legal_mentions: "Réserve de propriété : les marchandises restent la propriété du vendeur jusqu'au paiement intégral (loi du 12 mai 1980).",
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
