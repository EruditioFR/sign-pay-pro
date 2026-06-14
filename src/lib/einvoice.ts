/**
 * E-invoicing constants & types (Factur-X / UBL / CII, PDP FR).
 *
 * Source de vérité côté code pour le module facture électronique.
 * Aligné sur la migration qui ajoute les colonnes/enums e-invoicing.
 *
 * ⚠️  Pragmatique : pas d'usine à gaz. Ce module ne génère pas encore
 * de XML Factur-X et n'appelle aucune PDP. Il fournit les types,
 * constantes et helpers de transition de statut pour que le reste
 * du produit (UI, exports, futurs services) parle un vocabulaire commun.
 */

// ---------------------------------------------------------------------------
// Format & profil (Factur-X / UBL / CII)
// ---------------------------------------------------------------------------

export type EinvoiceFormat = "factur_x" | "ubl" | "cii";

/** Profils Factur-X / EN 16931 du moins riche au plus riche. */
export type EinvoiceProfile =
  | "minimum"   // données minimales (statut, totaux)
  | "basic_wl"  // BASIC WL (sans lignes)
  | "basic"     // BASIC (avec lignes simplifiées)
  | "en16931"   // EN 16931 (profil européen complet)
  | "extended"; // EXTENDED (extensions FR)

// ---------------------------------------------------------------------------
// Cycle de vie e-invoicing
// ---------------------------------------------------------------------------

export type EinvoiceStatus =
  | "not_applicable"
  | "draft"
  | "ready"
  | "submitted"
  | "received"
  | "accepted"
  | "rejected"
  | "in_dispute"
  | "paid"
  | "archived";

/** Transitions autorisées (hors événements PDP qui peuvent forcer un statut). */
export const EINVOICE_TRANSITIONS: Record<EinvoiceStatus, EinvoiceStatus[]> = {
  not_applicable: ["draft"],
  draft:          ["ready", "not_applicable"],
  ready:          ["submitted", "draft"],
  submitted:      ["received", "rejected"],
  received:       ["accepted", "rejected", "in_dispute"],
  accepted:       ["paid", "in_dispute", "archived"],
  rejected:       ["draft", "archived"],
  in_dispute:     ["accepted", "rejected", "archived"],
  paid:           ["archived"],
  archived:       [],
};

export function canTransition(from: EinvoiceStatus, to: EinvoiceStatus): boolean {
  return EINVOICE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Codes UN/CEFACT et UN/EDIFACT (référencés par Factur-X / UBL / CII)
// ---------------------------------------------------------------------------

/** UN/CEFACT 1001 — type de document commercial. */
export const INVOICE_TYPE_CODES = {
  COMMERCIAL_INVOICE: "380",
  CREDIT_NOTE: "381",
  DEBIT_NOTE: "383",
  CORRECTED_INVOICE: "384",
  PREPAYMENT_INVOICE: "386",
  SELF_BILLED_INVOICE: "389",
} as const;
export type InvoiceTypeCode = (typeof INVOICE_TYPE_CODES)[keyof typeof INVOICE_TYPE_CODES];

/** UN/EDIFACT 4461 — moyen de paiement (sous-ensemble usuel). */
export const PAYMENT_MEANS_CODES = {
  CASH: "10",
  CHECK: "20",
  CREDIT_TRANSFER: "30",
  CARD: "48",
  SEPA_DIRECT_DEBIT: "49",
  SEPA_CREDIT_TRANSFER: "58",
} as const;
export type PaymentMeansCode = (typeof PAYMENT_MEANS_CODES)[keyof typeof PAYMENT_MEANS_CODES];

/** UNCL5305 — catégorie TVA (sous-ensemble FR). */
export const VAT_CATEGORIES = {
  STANDARD: "S",         // taux standard
  ZERO: "Z",             // taux zéro
  EXEMPT: "E",           // exonéré
  REVERSE_CHARGE: "AE",  // autoliquidation
  NOT_SUBJECT: "O",      // hors champ
  INTRA_COMMUNITY: "K",  // livraison intra-UE
  EXPORT: "G",           // exportation hors UE
} as const;
export type VatCategory = (typeof VAT_CATEGORIES)[keyof typeof VAT_CATEGORIES];

// ---------------------------------------------------------------------------
// Champs obligatoires pour qu'une facture soit "PDP-ready"
// (validation locale — pas d'appel réseau).
// ---------------------------------------------------------------------------

export interface EinvoiceSellerSnapshot {
  seller_legal_name?: string | null;
  seller_siret?: string | null;
  seller_vat_number?: string | null;
  seller_address?: unknown;
}

export interface EinvoiceBuyerSnapshot {
  buyer_legal_name?: string | null;
  buyer_siret?: string | null;
  buyer_vat_number?: string | null;
  buyer_address?: unknown;
}

export interface EinvoiceDocumentLike
  extends EinvoiceSellerSnapshot,
    EinvoiceBuyerSnapshot {
  invoice_number?: string | null;
  invoice_type_code?: string | null;
  issue_date?: string | null;
  currency?: string | null;
  amount_ht?: number | null;
  amount_ttc?: number | null;
  total_vat?: number | null;
}

export interface ReadinessIssue {
  field: string;
  message: string;
}

/**
 * Liste les champs manquants pour générer un Factur-X profil BASIC.
 * Tableau vide ⇒ la facture est prête à être structurée.
 */
export function checkEinvoiceReadiness(doc: EinvoiceDocumentLike): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const need = (field: string, value: unknown, message: string) => {
    if (value == null || (typeof value === "string" && value.trim() === "")) {
      issues.push({ field, message });
    }
  };

  need("invoice_number", doc.invoice_number, "Numéro de facture requis");
  need("invoice_type_code", doc.invoice_type_code, "Code type (ex. 380) requis");
  need("issue_date", doc.issue_date, "Date d'émission requise");
  need("currency", doc.currency, "Devise requise");
  need("amount_ht", doc.amount_ht, "Total HT requis");
  need("amount_ttc", doc.amount_ttc, "Total TTC requis");
  need("total_vat", doc.total_vat, "Total TVA requis");

  need("seller_legal_name", doc.seller_legal_name, "Raison sociale émetteur");
  need("seller_siret", doc.seller_siret, "SIRET émetteur");

  need("buyer_legal_name", doc.buyer_legal_name, "Raison sociale acheteur");
  // SIRET acheteur requis en B2B FR (réforme 2026). Optionnel ici → warning séparé côté UI.

  return issues;
}
