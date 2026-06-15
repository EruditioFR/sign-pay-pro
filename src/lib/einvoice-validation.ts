/**
 * Validation métier Factur-X / EN 16931 (profil BASIC & EN 16931).
 *
 * Complémente `checkEinvoiceReadiness` (présence brute des champs) avec :
 *   - validation de format : SIRET (Luhn 14 chiffres), TVA intra (FR + clé),
 *     IBAN basique, code devise ISO 4217, codes UN/CEFACT.
 *   - validation d'adresse postale (BG-5 / BG-8) : ligne, CP, ville, pays.
 *   - cohérence des totaux (BT-106 → BT-115) : ht + tva = ttc, ventilation
 *     TVA = total TVA, somme des lignes = base HT.
 *   - mentions légales FR (échéance pour virement, motif d'exonération
 *     obligatoire si catégorie ≠ S, autoliquidation, franchise en base).
 *   - règles spécifiques avoirs (type 381 / 384) : total ≤ 0 attendu.
 *
 * NB : on ne charge pas le XSD officiel (incompatible workerd) ni les
 * Schematron EN 16931. La présente validation couvre les règles "BR-*"
 * les plus fréquemment bloquantes côté PDP française.
 */

import {
  INVOICE_TYPE_CODES,
  PAYMENT_MEANS_CODES,
  VAT_CATEGORIES,
  type VatCategory,
} from "@/lib/einvoice";
import type { CiiBuildInput } from "@/lib/einvoice-xml.functions";

export type Severity = "error" | "warning";

export interface ValidationIssue {
  /** Code stable type "BR-CO-15", "FR-SIRET", utilisable côté UI. */
  code: string;
  field: string;
  message: string;
  severity: Severity;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Helpers format
// ---------------------------------------------------------------------------

/** Vérifie qu'un SIRET fait 14 chiffres et passe le contrôle Luhn. */
export function isValidSiret(siret: string | null | undefined): boolean {
  if (!siret) return false;
  const s = siret.replace(/\s+/g, "");
  if (!/^\d{14}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(s[13 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** TVA intracommunautaire FR : "FR" + 2 caractères (clé) + 9 chiffres SIREN. */
export function isValidFrVatNumber(vat: string | null | undefined): boolean {
  if (!vat) return false;
  return /^FR[0-9A-HJ-NP-Z]{2}\d{9}$/.test(vat.replace(/\s+/g, "").toUpperCase());
}

/** Devise ISO 4217 (3 lettres majuscules). */
export function isValidCurrency(code: string | null | undefined): boolean {
  return !!code && /^[A-Z]{3}$/.test(code);
}

/** IBAN : 2 lettres pays + 2 chiffres clé + jusqu'à 30 alphanum. */
export function isValidIban(iban: string | null | undefined): boolean {
  if (!iban) return false;
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban.replace(/\s+/g, "").toUpperCase());
}

const VAT_CATEGORY_SET = new Set<string>(Object.values(VAT_CATEGORIES));
const INVOICE_TYPE_SET = new Set<string>(Object.values(INVOICE_TYPE_CODES));
const PAYMENT_MEANS_SET = new Set<string>(Object.values(PAYMENT_MEANS_CODES));

const CREDIT_TYPES = new Set<string>([
  INVOICE_TYPE_CODES.CREDIT_NOTE,
  INVOICE_TYPE_CODES.CORRECTED_INVOICE,
]);

const EXEMPTION_REQUIRED: VatCategory[] = ["E", "AE", "K", "G", "O"];

// ---------------------------------------------------------------------------
// Validation d'adresse postale
// ---------------------------------------------------------------------------

interface AddressSnapshot {
  line1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country_code?: string | null;
}

function readAddress(addr: Record<string, unknown> | null | undefined): AddressSnapshot {
  const s = addr ?? {};
  const g = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : null);
  return {
    line1: g("line1"),
    postal_code: g("postal_code"),
    city: g("city"),
    country_code: g("country_code"),
  };
}

function pushAddressIssues(
  out: ValidationIssue[],
  prefix: string,
  fieldRoot: string,
  addr: AddressSnapshot,
  countryFallback?: string | null,
) {
  if (!addr.line1) {
    out.push({
      code: "BR-08",
      field: `${fieldRoot}.line1`,
      message: `${prefix} : ligne d'adresse (BT-35 / BT-50) requise`,
      severity: "error",
    });
  }
  if (!addr.postal_code) {
    out.push({
      code: "BR-09",
      field: `${fieldRoot}.postal_code`,
      message: `${prefix} : code postal (BT-38 / BT-53) requis`,
      severity: "error",
    });
  }
  if (!addr.city) {
    out.push({
      code: "BR-10",
      field: `${fieldRoot}.city`,
      message: `${prefix} : ville (BT-37 / BT-52) requise`,
      severity: "error",
    });
  }
  const country = (addr.country_code ?? countryFallback ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    out.push({
      code: "BR-11",
      field: `${fieldRoot}.country_code`,
      message: `${prefix} : code pays ISO 3166 (BT-40 / BT-55) requis`,
      severity: "error",
    });
  }
}

// ---------------------------------------------------------------------------
// Validation principale
// ---------------------------------------------------------------------------

const TOLERANCE = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function validateFacturXInput(input: CiiBuildInput): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const { doc, org, lines, vat_breakdown } = input;

  // --- 1. En-tête facture -------------------------------------------------
  if (!doc.invoice_number?.trim()) {
    errors.push({
      code: "BR-02",
      field: "invoice_number",
      message: "Numéro de facture (BT-1) requis et unique",
      severity: "error",
    });
  }
  if (!doc.issue_date) {
    errors.push({
      code: "BR-03",
      field: "issue_date",
      message: "Date d'émission (BT-2) requise",
      severity: "error",
    });
  }
  const typeCode = doc.invoice_type_code ?? INVOICE_TYPE_CODES.COMMERCIAL_INVOICE;
  if (!INVOICE_TYPE_SET.has(typeCode)) {
    errors.push({
      code: "BR-04",
      field: "invoice_type_code",
      message: `Code type (BT-3) invalide : "${typeCode}". Attendu UN/CEFACT 1001 (380, 381, 383, 384, 386, 389).`,
      severity: "error",
    });
  }
  if (!isValidCurrency(doc.currency)) {
    errors.push({
      code: "BR-05",
      field: "currency",
      message: `Devise (BT-5) invalide : "${doc.currency}". Attendu code ISO 4217 (ex. EUR).`,
      severity: "error",
    });
  }

  // --- 2. Vendeur (BG-4) --------------------------------------------------
  const sellerName = doc.seller_legal_name ?? org.legal_name ?? org.name;
  if (!sellerName?.trim()) {
    errors.push({
      code: "BR-06",
      field: "seller_legal_name",
      message: "Raison sociale émetteur (BT-27) requise",
      severity: "error",
    });
  }
  const sellerSiret = doc.seller_siret ?? org.siret;
  if (!sellerSiret) {
    errors.push({
      code: "FR-SIRET-SELLER",
      field: "seller_siret",
      message:
        "SIRET émetteur (BT-30, schemeID 0009) requis pour une facture émise par une entité française",
      severity: "error",
    });
  } else if (!isValidSiret(sellerSiret)) {
    errors.push({
      code: "FR-SIRET-SELLER",
      field: "seller_siret",
      message: `SIRET émetteur invalide : "${sellerSiret}" (14 chiffres + clé Luhn attendue)`,
      severity: "error",
    });
  }
  const sellerVat = doc.seller_vat_number ?? org.vat_number;
  if (sellerVat && sellerVat.toUpperCase().startsWith("FR") && !isValidFrVatNumber(sellerVat)) {
    errors.push({
      code: "FR-TVA-SELLER",
      field: "seller_vat_number",
      message: `Numéro de TVA intracommunautaire émetteur invalide : "${sellerVat}" (format attendu FRxx + 9 chiffres SIREN)`,
      severity: "error",
    });
  }
  pushAddressIssues(
    errors,
    "Adresse émetteur",
    "seller_address",
    readAddress(doc.seller_address ?? null),
    org.country_code,
  );

  // --- 3. Acheteur (BG-7) -------------------------------------------------
  const buyerName = doc.buyer_legal_name ?? doc.third_party_name;
  if (!buyerName?.trim()) {
    errors.push({
      code: "BR-07",
      field: "buyer_legal_name",
      message: "Raison sociale acheteur (BT-44) requise",
      severity: "error",
    });
  }
  if (doc.buyer_siret && !isValidSiret(doc.buyer_siret)) {
    errors.push({
      code: "FR-SIRET-BUYER",
      field: "buyer_siret",
      message: `SIRET acheteur invalide : "${doc.buyer_siret}"`,
      severity: "error",
    });
  } else if (!doc.buyer_siret) {
    warnings.push({
      code: "FR-2026",
      field: "buyer_siret",
      message:
        "SIRET acheteur recommandé en B2B FR (obligatoire avec la réforme de la facturation électronique)",
      severity: "warning",
    });
  }
  if (
    doc.buyer_vat_number &&
    doc.buyer_vat_number.toUpperCase().startsWith("FR") &&
    !isValidFrVatNumber(doc.buyer_vat_number)
  ) {
    errors.push({
      code: "FR-TVA-BUYER",
      field: "buyer_vat_number",
      message: `Numéro de TVA acheteur invalide : "${doc.buyer_vat_number}"`,
      severity: "error",
    });
  }
  pushAddressIssues(errors, "Adresse acheteur", "buyer_address", readAddress(doc.buyer_address ?? null));

  // --- 4. Totaux & cohérence (BR-CO-10 à BR-CO-15) ------------------------
  const totalHt = Number(doc.amount_ht ?? NaN);
  const totalTtc = Number(doc.amount_ttc ?? NaN);
  const totalVat = doc.total_vat == null ? NaN : Number(doc.total_vat);
  const isCredit = CREDIT_TYPES.has(typeCode);

  if (Number.isNaN(totalHt)) {
    errors.push({
      code: "BR-CO-13",
      field: "amount_ht",
      message: "Total HT (BT-109) requis",
      severity: "error",
    });
  }
  if (Number.isNaN(totalTtc)) {
    errors.push({
      code: "BR-CO-15",
      field: "amount_ttc",
      message: "Total TTC (BT-112) requis",
      severity: "error",
    });
  }
  if (Number.isNaN(totalVat)) {
    errors.push({
      code: "BR-CO-14",
      field: "total_vat",
      message: "Total TVA (BT-110) requis (0.00 si pas de TVA)",
      severity: "error",
    });
  }

  if (!Number.isNaN(totalHt) && !Number.isNaN(totalTtc) && !Number.isNaN(totalVat)) {
    const expectedTtc = round2(totalHt + totalVat);
    if (Math.abs(expectedTtc - round2(totalTtc)) > TOLERANCE) {
      errors.push({
        code: "BR-CO-15",
        field: "amount_ttc",
        message: `Incohérence des totaux : HT (${totalHt.toFixed(2)}) + TVA (${totalVat.toFixed(
          2,
        )}) = ${expectedTtc.toFixed(2)} ≠ TTC (${totalTtc.toFixed(2)})`,
        severity: "error",
      });
    }
    if (isCredit && totalTtc > 0) {
      warnings.push({
        code: "FR-CREDIT-SIGN",
        field: "amount_ttc",
        message:
          "Avoir (type 381/384) : les montants devraient être négatifs ou nuls. Vérifier la convention de signe.",
        severity: "warning",
      });
    }
  }

  // --- 5. Lignes & ventilation TVA ----------------------------------------
  if (lines.length === 0) {
    warnings.push({
      code: "BR-16",
      field: "lines",
      message: "Aucune ligne facture : une ligne unique sera synthétisée à partir du total HT",
      severity: "warning",
    });
  } else {
    const sumLines = round2(lines.reduce((acc, l) => acc + Number(l.line_total_ht ?? 0), 0));
    if (!Number.isNaN(totalHt) && Math.abs(sumLines - round2(totalHt)) > TOLERANCE) {
      errors.push({
        code: "BR-CO-10",
        field: "lines",
        message: `Somme des lignes (${sumLines.toFixed(2)}) ≠ total HT (${totalHt.toFixed(2)})`,
        severity: "error",
      });
    }
    lines.forEach((l, idx) => {
      if (!l.description?.trim()) {
        errors.push({
          code: "BR-25",
          field: `lines[${idx}].description`,
          message: `Ligne ${idx + 1} : libellé (BT-153) requis`,
          severity: "error",
        });
      }
      if (!VAT_CATEGORY_SET.has(l.vat_category)) {
        errors.push({
          code: "BR-CO-04",
          field: `lines[${idx}].vat_category`,
          message: `Ligne ${idx + 1} : catégorie TVA inconnue "${l.vat_category}"`,
          severity: "error",
        });
      }
      if (l.vat_category === "S" && !(l.vat_rate > 0)) {
        errors.push({
          code: "BR-S-05",
          field: `lines[${idx}].vat_rate`,
          message: `Ligne ${idx + 1} : catégorie standard (S) exige un taux > 0`,
          severity: "error",
        });
      }
    });
  }

  if (vat_breakdown.length === 0) {
    warnings.push({
      code: "BR-CO-18",
      field: "vat_breakdown",
      message: "Ventilation TVA absente : une ligne synthétique sera générée",
      severity: "warning",
    });
  } else {
    const sumVat = round2(vat_breakdown.reduce((acc, v) => acc + Number(v.vat_amount ?? 0), 0));
    const sumBase = round2(vat_breakdown.reduce((acc, v) => acc + Number(v.base_ht ?? 0), 0));
    if (!Number.isNaN(totalVat) && Math.abs(sumVat - round2(totalVat)) > TOLERANCE) {
      errors.push({
        code: "BR-CO-17",
        field: "vat_breakdown",
        message: `Somme TVA ventilée (${sumVat.toFixed(2)}) ≠ total TVA (${totalVat.toFixed(2)})`,
        severity: "error",
      });
    }
    if (!Number.isNaN(totalHt) && Math.abs(sumBase - round2(totalHt)) > TOLERANCE) {
      warnings.push({
        code: "BR-CO-10",
        field: "vat_breakdown",
        message: `Somme des bases HT ventilées (${sumBase.toFixed(2)}) ≠ total HT (${totalHt.toFixed(2)})`,
        severity: "warning",
      });
    }
    vat_breakdown.forEach((v, idx) => {
      if (!VAT_CATEGORY_SET.has(v.vat_category)) {
        errors.push({
          code: "BR-CO-04",
          field: `vat_breakdown[${idx}].vat_category`,
          message: `Ventilation ${idx + 1} : catégorie TVA inconnue "${v.vat_category}"`,
          severity: "error",
        });
      }
      if (
        EXEMPTION_REQUIRED.includes(v.vat_category as VatCategory) &&
        !v.exemption_reason?.trim()
      ) {
        errors.push({
          code: "BR-E-10",
          field: `vat_breakdown[${idx}].exemption_reason`,
          message: `Ventilation ${idx + 1} (catégorie ${v.vat_category}) : motif d'exonération obligatoire (BT-120). Ex. "TVA non applicable, art. 293 B du CGI" (franchise), "Autoliquidation" (AE), "Exonération art. 262 ter I CGI" (intra-UE).`,
          severity: "error",
        });
      }
      if (v.vat_category === "S" && !(v.vat_rate > 0)) {
        errors.push({
          code: "BR-S-05",
          field: `vat_breakdown[${idx}].vat_rate`,
          message: `Ventilation ${idx + 1} : catégorie standard exige un taux > 0`,
          severity: "error",
        });
      }
    });
  }

  // --- 6. Paiement & échéance ---------------------------------------------
  const paymentMeans = doc.payment_means_code ?? PAYMENT_MEANS_CODES.CREDIT_TRANSFER;
  if (!PAYMENT_MEANS_SET.has(paymentMeans)) {
    warnings.push({
      code: "BR-49",
      field: "payment_means_code",
      message: `Moyen de paiement inhabituel : "${paymentMeans}" (codes UN/EDIFACT 4461 attendus)`,
      severity: "warning",
    });
  }
  if (!doc.due_date && !isCredit) {
    warnings.push({
      code: "FR-DUE",
      field: "due_date",
      message:
        "Date d'échéance (BT-9) absente : mention obligatoire en B2B FR (art. L441-9 C. commerce) sauf paiement comptant",
      severity: "warning",
    });
  }
  if (
    (paymentMeans === PAYMENT_MEANS_CODES.CREDIT_TRANSFER ||
      paymentMeans === PAYMENT_MEANS_CODES.SEPA_CREDIT_TRANSFER) &&
    !org.iban
  ) {
    warnings.push({
      code: "BR-50",
      field: "org.iban",
      message: "Virement (BG-17) : IBAN du bénéficiaire (BT-84) attendu",
      severity: "warning",
    });
  }
  if (org.iban && !isValidIban(org.iban)) {
    errors.push({
      code: "BR-61",
      field: "org.iban",
      message: `IBAN émetteur invalide : "${org.iban}"`,
      severity: "error",
    });
  }

  return { errors, warnings, ok: errors.length === 0 };
}

/** Met en forme un résultat de validation pour message d'erreur utilisateur. */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.ok) return "";
  const lines = result.errors.map((e) => `  • [${e.code}] ${e.message}`);
  return `Facture non conforme Factur-X (${result.errors.length} erreur(s)) :\n${lines.join("\n")}`;
}
