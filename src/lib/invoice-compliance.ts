// Vérification des mentions légales obligatoires (Art. L441-9 C.com + CGI)
// Utilisé par le formulaire devis/facture, la page profil de facturation
// et l'indicateur de conformité.

export type ComplianceLevel = "required" | "recommended" | "electronic_2026";

export interface ComplianceCheck {
  field: string;
  label: string;
  level: ComplianceLevel;
  satisfied: boolean;
  message?: string;
  /** When true, the check belongs to the seller (organization) scope only. */
  scope?: "seller" | "client" | "document";
}

export interface OrgProfile {
  name?: string | null;
  legal_form?: string | null;
  share_capital?: number | string | null;
  siret?: string | null;
  rcs_city?: string | null;
  rm_number?: string | null;
  naf_code?: string | null;
  vat_number?: string | null;
  vat_regime?: string | null;
  is_autoentrepreneur?: boolean | null;
  iban?: string | null;
  bic?: string | null;
  late_penalty_rate?: number | string | null;
  recovery_indemnity?: number | string | null;
  default_payment_terms?: string | null;
  default_early_discount?: string | null;
  // Address fields are stored as a structured object in seller_address jsonb on documents,
  // but on org we use simple text fields if present (legacy column = country only).
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface InvoiceDoc {
  id?: string;
  type?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  service_date?: string | null;
  validity_date?: string | null;
  transaction_type?: string | null;
  third_party_name?: string | null;
  third_party_email?: string | null;
  client_legal_form?: string | null;
  client_reference?: string | null;
  client_delivery_address?: string | null;
  buyer_siret?: string | null;
  buyer_vat_number?: string | null;
  buyer_address?: Record<string, unknown> | string | null;
  amount_ht?: number | string | null;
  amount_ttc?: number | string | null;
  payment_terms?: string | null;
  payment_bank_details?: string | null;
  late_penalty_rate?: number | string | null;
  recovery_indemnity?: number | string | null;
  early_discount_text?: string | null;
  legal_mentions?: string | null;
  header_note?: string | null;
  footer_note?: string | null;
  // optional line count for documents that pass it
  line_count?: number;
}

const nonEmpty = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return !Number.isNaN(v);
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function isSiretValid(siret: string | null | undefined): boolean {
  if (!siret) return false;
  return /^\d{14}$/.test(siret.replace(/\s+/g, ""));
}

export function isVatNumberValid(v: string | null | undefined): boolean {
  if (!v) return false;
  return /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(v.replace(/\s+/g, "").toUpperCase());
}

export function isIbanValid(v: string | null | undefined): boolean {
  if (!v) return false;
  const cleaned = v.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(cleaned);
}

/** Checks restricted to the seller (organization) profile. */
export function checkSellerCompliance(org: OrgProfile | null | undefined): ComplianceCheck[] {
  const o = org ?? {};
  const isAE = Boolean(o.is_autoentrepreneur);
  const checks: ComplianceCheck[] = [];

  checks.push({
    field: "name",
    label: "Dénomination sociale ou nom/prénom",
    level: "required",
    scope: "seller",
    satisfied: nonEmpty(o.name),
  });

  if (!isAE) {
    checks.push({
      field: "legal_form",
      label: "Forme juridique",
      level: "required",
      scope: "seller",
      satisfied: nonEmpty(o.legal_form),
    });
    checks.push({
      field: "share_capital",
      label: "Capital social",
      level: "required",
      scope: "seller",
      satisfied: (num(o.share_capital) ?? 0) > 0,
    });
    checks.push({
      field: "rcs_city",
      label: "Ville d'immatriculation RCS",
      level: "required",
      scope: "seller",
      satisfied: nonEmpty(o.rcs_city),
      message:
        "Obligatoire pour les sociétés commerciales. Les artisans renseignent à la place le n° RM.",
    });
  }

  checks.push({
    field: "siret",
    label: "SIRET",
    level: "required",
    scope: "seller",
    satisfied: isSiretValid(o.siret),
    message: o.siret && !isSiretValid(o.siret) ? "Doit contenir 14 chiffres" : undefined,
  });

  checks.push({
    field: "address",
    label: "Adresse du siège",
    level: "required",
    scope: "seller",
    satisfied: nonEmpty(o.address_line) && nonEmpty(o.city) && nonEmpty(o.postal_code),
  });

  if (!isAE) {
    checks.push({
      field: "vat_number",
      label: "N° TVA intracommunautaire",
      level: "required",
      scope: "seller",
      satisfied: isVatNumberValid(o.vat_number),
      message:
        o.vat_number && !isVatNumberValid(o.vat_number)
          ? "Format attendu : FR + 11 caractères"
          : undefined,
    });
  }

  checks.push({
    field: "naf_code",
    label: "Code APE/NAF",
    level: "recommended",
    scope: "seller",
    satisfied: nonEmpty(o.naf_code),
  });

  checks.push({
    field: "iban",
    label: "IBAN",
    level: "recommended",
    scope: "seller",
    satisfied: isIbanValid(o.iban),
  });

  checks.push({
    field: "late_penalty_rate",
    label: "Taux des pénalités de retard",
    level: "required",
    scope: "seller",
    satisfied: (num(o.late_penalty_rate) ?? 0) > 0,
  });

  return checks;
}

/** Full document compliance: seller + client + document-specific rules. */
export function checkInvoiceCompliance(
  doc: InvoiceDoc | null | undefined,
  org: OrgProfile | null | undefined,
): ComplianceCheck[] {
  const d = doc ?? {};
  const o = org ?? {};
  const isAE = Boolean(o.is_autoentrepreneur);
  const isInvoice = (d.type ?? "invoice") === "invoice";
  const isQuote = d.type === "quote";

  const sellerChecks = checkSellerCompliance(o);

  const docChecks: ComplianceCheck[] = [
    {
      field: "third_party_name",
      label: "Nom ou raison sociale du client",
      level: "required",
      scope: "client",
      satisfied: nonEmpty(d.third_party_name),
    },
    {
      field: "third_party_email",
      label: "Email du client",
      level: "required",
      scope: "client",
      satisfied: nonEmpty(d.third_party_email),
    },
    {
      field: "buyer_address",
      label: "Adresse du client",
      level: "required",
      scope: "client",
      satisfied: nonEmpty(d.buyer_address),
    },
    {
      field: "issue_date",
      label: "Date d'émission",
      level: "required",
      scope: "document",
      satisfied: nonEmpty(d.issue_date),
    },
    {
      field: "document_number",
      label: "Numéro séquentiel",
      level: "required",
      scope: "document",
      satisfied: nonEmpty(d.document_number),
      message: !nonEmpty(d.document_number)
        ? "Sera attribué automatiquement à l'émission"
        : undefined,
    },
    {
      field: "lines",
      label: "Au moins une ligne (description + montant)",
      level: "required",
      scope: "document",
      satisfied: (d.line_count ?? 0) > 0 && (num(d.amount_ht) ?? 0) > 0,
    },
  ];

  if (isInvoice) {
    docChecks.push({
      field: "due_date",
      label: "Date d'échéance",
      level: "required",
      scope: "document",
      satisfied: nonEmpty(d.due_date),
    });
    docChecks.push({
      field: "late_penalty",
      label: "Taux des pénalités de retard (B2B)",
      level: "required",
      scope: "document",
      satisfied:
        (num(d.late_penalty_rate) ?? num(o.late_penalty_rate) ?? 0) > 0,
    });
    docChecks.push({
      field: "early_discount",
      label: "Mention d'escompte (même si 0 %)",
      level: "required",
      scope: "document",
      satisfied: nonEmpty(d.early_discount_text ?? o.default_early_discount),
    });
  }

  if (isQuote) {
    docChecks.push({
      field: "validity_date",
      label: "Date de validité du devis",
      level: "recommended",
      scope: "document",
      satisfied: nonEmpty(d.validity_date),
    });
  }

  if (isAE) {
    const mentions = (d.legal_mentions ?? "").toString();
    docChecks.push({
      field: "ae_mention",
      label: "Mention « TVA non applicable, art. 293 B du CGI »",
      level: "required",
      scope: "document",
      satisfied: /293\s*B/i.test(mentions),
      message: "Pré-remplie automatiquement à partir du profil auto-entrepreneur.",
    });
  }

  if (isInvoice) {
    docChecks.push({
      field: "transaction_type",
      label: "Type de transaction (B2B / B2C / B2G)",
      level: "electronic_2026",
      scope: "document",
      satisfied: nonEmpty(d.transaction_type),
    });
    docChecks.push({
      field: "buyer_siret",
      label: "SIRET du client",
      level: "electronic_2026",
      scope: "client",
      satisfied: isSiretValid(d.buyer_siret),
      message: "Requis pour la facturation électronique 2026 (B2B).",
    });
    docChecks.push({
      field: "client_delivery_address",
      label: "Adresse de livraison",
      level: "electronic_2026",
      scope: "client",
      satisfied: nonEmpty(d.client_delivery_address),
    });
  }

  return [...sellerChecks, ...docChecks];
}

export interface ComplianceSummary {
  status: "ok" | "partial" | "ko";
  requiredTotal: number;
  requiredSatisfied: number;
  recommendedTotal: number;
  recommendedSatisfied: number;
  electronicTotal: number;
  electronicSatisfied: number;
}

export function complianceSummary(checks: ComplianceCheck[]): ComplianceSummary {
  const req = checks.filter((c) => c.level === "required");
  const reco = checks.filter((c) => c.level === "recommended");
  const elec = checks.filter((c) => c.level === "electronic_2026");
  const reqOk = req.filter((c) => c.satisfied).length;
  const recoOk = reco.filter((c) => c.satisfied).length;
  const elecOk = elec.filter((c) => c.satisfied).length;

  let status: ComplianceSummary["status"] = "ok";
  if (reqOk < req.length) status = "ko";
  else if (recoOk < reco.length || elecOk < elec.length) status = "partial";

  return {
    status,
    requiredTotal: req.length,
    requiredSatisfied: reqOk,
    recommendedTotal: reco.length,
    recommendedSatisfied: recoOk,
    electronicTotal: elec.length,
    electronicSatisfied: elecOk,
  };
}

/** Generate the legal mentions block based on the seller profile + document. */
export function buildLegalMentions(
  org: OrgProfile | null | undefined,
  doc: InvoiceDoc | null | undefined,
): string {
  const o = org ?? {};
  const d = doc ?? {};
  const isAE = Boolean(o.is_autoentrepreneur);
  const parts: string[] = [];

  if (o.name) {
    let firstLine = o.name;
    if (!isAE && o.legal_form) {
      firstLine += ` — ${o.legal_form}`;
      const cap = num(o.share_capital);
      if (cap != null && cap > 0) {
        firstLine += ` au capital de ${cap.toLocaleString("fr-FR")} €`;
      }
    }
    parts.push(firstLine);
  }

  if (o.siret) parts.push(`SIRET : ${o.siret}`);
  if (!isAE) {
    if (o.rcs_city) parts.push(`RCS ${o.rcs_city}`);
    if (o.rm_number) parts.push(`RM ${o.rm_number}`);
    if (o.naf_code) parts.push(`Code APE/NAF : ${o.naf_code}`);
    if (o.vat_number) parts.push(`N° TVA intracommunautaire : ${o.vat_number}`);
  }
  if (isAE) parts.push("TVA non applicable, article 293 B du CGI");

  if ((d.type ?? "invoice") === "invoice") {
    const penaltyRate =
      num(d.late_penalty_rate) ?? num(o.late_penalty_rate) ?? 12;
    const indemnity =
      num(d.recovery_indemnity) ?? num(o.recovery_indemnity) ?? 40;
    parts.push(
      `En cas de retard de paiement, pénalités au taux de ${penaltyRate.toLocaleString("fr-FR")} % (Art. L441-10 C.com) et indemnité forfaitaire pour frais de recouvrement de ${indemnity.toLocaleString("fr-FR")} € (Art. D441-5 C.com).`,
    );
    const disc = d.early_discount_text ?? o.default_early_discount;
    if (disc) parts.push(disc);
  }

  return parts.join("\n");
}
