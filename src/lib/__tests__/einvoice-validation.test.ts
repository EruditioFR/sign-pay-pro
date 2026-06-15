import { describe, it, expect } from "vitest";
import {
  validateFacturXInput,
  isValidSiret,
  isValidFrVatNumber,
  isValidIban,
  formatValidationErrors,
} from "@/lib/einvoice-validation";
import { buildCiiXml, type CiiBuildInput } from "@/lib/einvoice-xml.functions";

// ---------- Fixture builder -------------------------------------------------

function baseInput(over: Partial<CiiBuildInput> = {}): CiiBuildInput {
  return {
    profile: "en16931",
    doc: {
      id: "11111111-1111-1111-1111-111111111111",
      invoice_number: "FAC-2026-0001",
      reference: null,
      invoice_type_code: "380",
      issue_date: "2026-06-15",
      due_date: "2026-07-15",
      delivery_date: null,
      currency: "EUR",
      amount_ht: 1000,
      amount_ttc: 1200,
      total_vat: 200,
      total_discount: 0,
      payment_means_code: "30",
      payment_terms: "30 jours net",
      seller_legal_name: "Acme SAS",
      seller_siret: "73282932000074", // SIRET de test valide (Luhn ok)
      seller_vat_number: "FR40303265045",
      seller_address: {
        line1: "1 rue de Paris",
        postal_code: "75001",
        city: "Paris",
        country_code: "FR",
      },
      buyer_legal_name: "Client SARL",
      buyer_siret: "55208131766522", // valide Luhn
      buyer_vat_number: "FR32552081317",
      buyer_address: {
        line1: "5 avenue Foch",
        postal_code: "75116",
        city: "Paris",
        country_code: "FR",
      },
      third_party_name: null,
      third_party_email: null,
    },
    org: {
      legal_name: "Acme SAS",
      name: "Acme",
      siret: "73282932000074",
      siren: "732829320",
      vat_number: "FR40303265045",
      address_line1: "1 rue de Paris",
      address_line2: null,
      postal_code: "75001",
      city: "Paris",
      country_code: "FR",
      iban: "FR7630006000011234567890189",
      bic: "BNPAFRPPXXX",
    },
    lines: [
      {
        position: 1,
        description: "Prestation de conseil",
        quantity: 10,
        unit_code: "HUR",
        unit_price_ht: 100,
        vat_rate: 20,
        vat_category: "S",
        line_total_ht: 1000,
      },
    ],
    vat_breakdown: [
      {
        vat_rate: 20,
        vat_category: "S",
        base_ht: 1000,
        vat_amount: 200,
        exemption_reason: null,
      },
    ],
    ...over,
  };
}

// ---------- Format helpers --------------------------------------------------

describe("Format helpers", () => {
  it("isValidSiret accepts 14-digit Luhn-valid SIRET", () => {
    expect(isValidSiret("73282932000074")).toBe(true);
    expect(isValidSiret("55208131766522")).toBe(true);
  });
  it("isValidSiret rejects bad length / bad Luhn / non-digit", () => {
    expect(isValidSiret(null)).toBe(false);
    expect(isValidSiret("12345678900012")).toBe(false); // Luhn KO
    expect(isValidSiret("1234")).toBe(false);
    expect(isValidSiret("ABCDEFGHIJKLMN")).toBe(false);
  });
  it("isValidFrVatNumber requires FR + key + 9 digits (case-insensitive)", () => {
    expect(isValidFrVatNumber("FR40303265045")).toBe(true);
    expect(isValidFrVatNumber("fr40303265045")).toBe(true); // normalized to upper
    expect(isValidFrVatNumber("FR4030326504")).toBe(false); // 8 digits
    expect(isValidFrVatNumber("DE123456789")).toBe(false); // not FR
    expect(isValidFrVatNumber(null)).toBe(false);
  });
  it("isValidIban handles spaces and basic structure", () => {
    expect(isValidIban("FR76 3000 6000 0112 3456 7890 189")).toBe(true);
    expect(isValidIban("XX")).toBe(false);
  });
});

// ---------- Case 1: standard B2B invoice with VAT --------------------------

describe("validateFacturXInput — facture B2B avec TVA", () => {
  it("passes with full standard input", () => {
    const r = validateFacturXInput(baseInput());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("reports incohérence HT + TVA ≠ TTC", () => {
    const r = validateFacturXInput(
      baseInput({
        doc: { ...baseInput().doc, amount_ttc: 1500 },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "BR-CO-15")).toBe(true);
  });

  it("reports SIRET émetteur invalide", () => {
    const r = validateFacturXInput(
      baseInput({ doc: { ...baseInput().doc, seller_siret: "12345678900012" } }),
    );
    expect(r.errors.some((e) => e.code === "FR-SIRET-SELLER")).toBe(true);
  });

  it("reports adresse acheteur manquante", () => {
    const r = validateFacturXInput(
      baseInput({ doc: { ...baseInput().doc, buyer_address: null } }),
    );
    expect(r.errors.some((e) => e.field.startsWith("buyer_address"))).toBe(true);
  });

  it("formatValidationErrors produces a human readable message", () => {
    const r = validateFacturXInput(
      baseInput({ doc: { ...baseInput().doc, invoice_number: null } }),
    );
    const msg = formatValidationErrors(r);
    expect(msg).toContain("Numéro de facture");
    expect(msg).toContain("[BR-02]");
  });
});

// ---------- Case 2: invoice WITHOUT VAT (franchise en base art. 293 B) ----

describe("validateFacturXInput — facture sans TVA (franchise art. 293 B)", () => {
  function franchise(): CiiBuildInput {
    return baseInput({
      doc: {
        ...baseInput().doc,
        amount_ht: 500,
        amount_ttc: 500,
        total_vat: 0,
      },
      lines: [
        {
          position: 1,
          description: "Prestation (franchise en base)",
          quantity: 1,
          unit_code: "C62",
          unit_price_ht: 500,
          vat_rate: 0,
          vat_category: "E",
          line_total_ht: 500,
        },
      ],
      vat_breakdown: [
        {
          vat_rate: 0,
          vat_category: "E",
          base_ht: 500,
          vat_amount: 0,
          exemption_reason: "TVA non applicable, art. 293 B du CGI",
        },
      ],
    });
  }

  it("accepts when exemption_reason is provided", () => {
    expect(validateFacturXInput(franchise()).ok).toBe(true);
  });

  it("rejects when exemption_reason is missing on category E", () => {
    const input = franchise();
    input.vat_breakdown[0].exemption_reason = null;
    const r = validateFacturXInput(input);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "BR-E-10")).toBe(true);
    expect(r.errors[0].message).toContain("293 B");
  });
});

// ---------- Case 3: multi-line invoice with mixed VAT rates ---------------

describe("validateFacturXInput — facture multi-lignes (TVA 20% + 5,5%)", () => {
  const input = baseInput({
    doc: {
      ...baseInput().doc,
      amount_ht: 1200,
      total_vat: 211,
      amount_ttc: 1411,
    },
    lines: [
      {
        position: 1,
        description: "Conseil",
        quantity: 10,
        unit_code: "HUR",
        unit_price_ht: 100,
        vat_rate: 20,
        vat_category: "S",
        line_total_ht: 1000,
      },
      {
        position: 2,
        description: "Livre technique",
        quantity: 2,
        unit_code: "C62",
        unit_price_ht: 100,
        vat_rate: 5.5,
        vat_category: "S",
        line_total_ht: 200,
      },
    ],
    vat_breakdown: [
      { vat_rate: 20, vat_category: "S", base_ht: 1000, vat_amount: 200, exemption_reason: null },
      { vat_rate: 5.5, vat_category: "S", base_ht: 200, vat_amount: 11, exemption_reason: null },
    ],
  });

  it("passes when lines sum + VAT breakdown sum match totals", () => {
    expect(validateFacturXInput(input).ok).toBe(true);
  });

  it("XML embeds both VAT rates", () => {
    const xml = buildCiiXml(input);
    expect(xml).toContain("20.00</ram:RateApplicablePercent>");
    expect(xml).toContain("5.50</ram:RateApplicablePercent>");
  });

  it("rejects when sum of lines diverges from HT total", () => {
    const broken = JSON.parse(JSON.stringify(input)) as CiiBuildInput;
    broken.lines[0].line_total_ht = 500;
    const r = validateFacturXInput(broken);
    expect(r.errors.some((e) => e.code === "BR-CO-10")).toBe(true);
  });
});

// ---------- Case 4: invoice with discount line ----------------------------

describe("validateFacturXInput — facture avec remise globale", () => {
  // Remise traduite comme une ligne négative (approche simple compatible BASIC).
  const input = baseInput({
    doc: {
      ...baseInput().doc,
      amount_ht: 900,
      total_vat: 180,
      amount_ttc: 1080,
      total_discount: 100,
    },
    lines: [
      {
        position: 1,
        description: "Prestation",
        quantity: 1,
        unit_code: "C62",
        unit_price_ht: 1000,
        vat_rate: 20,
        vat_category: "S",
        line_total_ht: 1000,
      },
      {
        position: 2,
        description: "Remise commerciale 10%",
        quantity: 1,
        unit_code: "C62",
        unit_price_ht: -100,
        vat_rate: 20,
        vat_category: "S",
        line_total_ht: -100,
      },
    ],
    vat_breakdown: [
      { vat_rate: 20, vat_category: "S", base_ht: 900, vat_amount: 180, exemption_reason: null },
    ],
  });

  it("passes with consistent discount + totals", () => {
    expect(validateFacturXInput(input).ok).toBe(true);
  });
});

// ---------- Case 5: credit note (avoir) -----------------------------------

describe("validateFacturXInput — avoir (type 381)", () => {
  const credit = baseInput({
    doc: {
      ...baseInput().doc,
      invoice_type_code: "381",
      invoice_number: "AV-2026-0001",
      amount_ht: -500,
      total_vat: -100,
      amount_ttc: -600,
      due_date: null,
    },
    lines: [
      {
        position: 1,
        description: "Avoir sur facture FAC-2026-0001",
        quantity: 1,
        unit_code: "C62",
        unit_price_ht: -500,
        vat_rate: 20,
        vat_category: "S",
        line_total_ht: -500,
      },
    ],
    vat_breakdown: [
      { vat_rate: 20, vat_category: "S", base_ht: -500, vat_amount: -100, exemption_reason: null },
    ],
  });

  it("accepts negative totals for type 381", () => {
    const r = validateFacturXInput(credit);
    expect(r.ok).toBe(true);
    // due_date is optional on credit notes → no warning expected
    expect(r.warnings.some((w) => w.code === "FR-DUE")).toBe(false);
  });

  it("warns when a credit note carries positive totals (likely sign mistake)", () => {
    const wrong = JSON.parse(JSON.stringify(credit)) as CiiBuildInput;
    wrong.doc.amount_ht = 500;
    wrong.doc.amount_ttc = 600;
    wrong.doc.total_vat = 100;
    wrong.lines[0].line_total_ht = 500;
    wrong.lines[0].unit_price_ht = 500;
    wrong.vat_breakdown[0].base_ht = 500;
    wrong.vat_breakdown[0].vat_amount = 100;
    const r = validateFacturXInput(wrong);
    expect(r.warnings.some((w) => w.code === "FR-CREDIT-SIGN")).toBe(true);
  });

  it("XML carries the 381 type code", () => {
    expect(buildCiiXml(credit)).toContain("<ram:TypeCode>381</ram:TypeCode>");
  });
});

// ---------- Case 6: reverse charge (autoliquidation BTP / intra-UE) -------

describe("validateFacturXInput — autoliquidation (catégorie AE)", () => {
  const ae = baseInput({
    doc: {
      ...baseInput().doc,
      amount_ht: 1000,
      total_vat: 0,
      amount_ttc: 1000,
    },
    lines: [
      {
        position: 1,
        description: "Travaux sous-traités",
        quantity: 1,
        unit_code: "C62",
        unit_price_ht: 1000,
        vat_rate: 0,
        vat_category: "AE",
        line_total_ht: 1000,
      },
    ],
    vat_breakdown: [
      {
        vat_rate: 0,
        vat_category: "AE",
        base_ht: 1000,
        vat_amount: 0,
        exemption_reason: "Autoliquidation",
      },
    ],
  });

  it("requires an exemption reason for AE", () => {
    expect(validateFacturXInput(ae).ok).toBe(true);
    const input = JSON.parse(JSON.stringify(ae)) as CiiBuildInput;
    input.vat_breakdown[0].exemption_reason = null;
    expect(validateFacturXInput(input).errors.some((e) => e.code === "BR-E-10")).toBe(true);
  });
});
