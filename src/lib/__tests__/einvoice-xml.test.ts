import { describe, it, expect } from "vitest";
import {
  buildCiiXml,
  validateCiiXmlStructure,
  type CiiBuildInput,
} from "@/lib/einvoice-xml.functions";

function makeInput(overrides: Partial<CiiBuildInput> = {}): CiiBuildInput {
  return {
    profile: "en16931",
    doc: {
      id: "doc-1234-5678",
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
      seller_siret: "12345678900012",
      seller_vat_number: "FR12123456789",
      seller_address: null,
      buyer_legal_name: "Client SARL",
      buyer_siret: null,
      buyer_vat_number: "FR98987654321",
      buyer_address: null,
      third_party_name: null,
      third_party_email: null,
    },
    org: {
      legal_name: "Acme SAS",
      name: "Acme",
      siret: "12345678900012",
      siren: "123456789",
      vat_number: "FR12123456789",
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
    ...overrides,
  };
}

describe("buildCiiXml — structure Factur-X / EN 16931", () => {
  const xml = buildCiiXml(makeInput());

  it("starts with an XML prologue and CII root element", () => {
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain("<rsm:CrossIndustryInvoice");
  });

  it("embeds the EN 16931 guideline URN (BT-24)", () => {
    expect(xml).toContain("urn:cen.eu:en16931:2017");
  });

  it("emits the invoice number (BT-1) and type code (BT-3)", () => {
    expect(xml).toContain("FAC-2026-0001");
    expect(xml).toContain("<ram:TypeCode>380</ram:TypeCode>");
  });

  it("emits issue + due dates in AAAAMMJJ format", () => {
    expect(xml).toContain("20260615");
    expect(xml).toContain("20260715");
  });

  it("maps seller identity (name, SIRET, VAT)", () => {
    expect(xml).toContain("Acme SAS");
    expect(xml).toContain("12345678900012");
    expect(xml).toContain("FR12123456789");
  });

  it("maps buyer identity", () => {
    expect(xml).toContain("Client SARL");
    expect(xml).toContain("FR98987654321");
  });

  it("renders invoice lines and totals", () => {
    expect(xml).toContain("Prestation de conseil");
    expect(xml).toContain("<ram:GrandTotalAmount>1200.00</ram:GrandTotalAmount>");
    expect(xml).toContain("<ram:TaxBasisTotalAmount>1000.00</ram:TaxBasisTotalAmount>");
  });

  it("passes structural validation (validateCiiXmlStructure)", () => {
    expect(validateCiiXmlStructure(xml)).toEqual([]);
  });

  it("switches guideline URN per profile", () => {
    const min = buildCiiXml(makeInput({ profile: "minimum" }));
    expect(min).toContain("urn:factur-x.eu:1p0:minimum");
    const ext = buildCiiXml(makeInput({ profile: "extended" }));
    expect(ext).toContain("extended");
  });

  it("escapes XML-special characters in free text", () => {
    const x = buildCiiXml(
      makeInput({
        lines: [
          {
            position: 1,
            description: "M&M's <special> \"quote\"",
            quantity: 1,
            unit_code: "C62",
            unit_price_ht: 10,
            vat_rate: 20,
            vat_category: "S",
            line_total_ht: 10,
          },
        ],
      }),
    );
    expect(x).toContain("M&amp;M&apos;s &lt;special&gt;");
    expect(x).not.toMatch(/<special>/);
  });
});

describe("validateCiiXmlStructure", () => {
  it("flags missing prologue and root", () => {
    const errs = validateCiiXmlStructure("<foo></foo>");
    expect(errs).toContain("Prologue XML manquant");
    expect(errs).toContain("Racine CrossIndustryInvoice absente");
  });

  it("flags missing mandatory EN 16931 fields", () => {
    const errs = validateCiiXmlStructure(
      '<?xml version="1.0"?><rsm:CrossIndustryInvoice></rsm:CrossIndustryInvoice>',
    );
    expect(errs.some((e) => e.includes("BT-1"))).toBe(true);
    expect(errs.some((e) => e.includes("BT-112"))).toBe(true);
  });
});
