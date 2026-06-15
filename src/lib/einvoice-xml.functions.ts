/**
 * E-invoice structured export (UN/CEFACT Cross Industry Invoice — CII).
 *
 * V1 — Profil BASIC (sous-ensemble de Factur-X / EN 16931).
 * Génère le XML CII à partir d'une facture (`documents` type=invoice) +
 * organisation + lignes + ventilation TVA. Ce XML est exactement celui
 * qui s'embarque dans un PDF/A-3 Factur-X — la couche d'enrobage PDF
 * sera ajoutée plus tard sans toucher au mapping.
 *
 * Limites V1 (volontaires, voir docs/EINVOICING.md) :
 *  - Pas encore d'embarquement PDF/A-3 → le fichier livré est un .xml
 *  - Pas d'appel PDP, pas de validation Schematron EN 16931
 *  - Si `document_invoice_lines` est vide : on génère UNE ligne unique
 *    à partir du total HT (suffisant pour BASIC WL)
 *  - Si `document_vat_breakdown` est vide : on synthétise une ligne TVA
 *    à partir de amount_ht / amount_ttc (taux unique implicite)
 *  - Numéro de facture : si manquant, on retombe sur `reference` ou l'id
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  checkEinvoiceReadiness,
  INVOICE_TYPE_CODES,
  PAYMENT_MEANS_CODES,
  VAT_CATEGORIES,
  type EinvoiceProfile,
  type ReadinessIssue,
} from "@/lib/einvoice";

// ---------------------------------------------------------------------------
// Profil Factur-X → URN guideline (BT-24)
// ---------------------------------------------------------------------------

const PROFILE_URNS: Record<EinvoiceProfile, string> = {
  minimum:  "urn:factur-x.eu:1p0:minimum",
  basic_wl: "urn:factur-x.eu:1p0:basicwl",
  basic:    "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic",
  en16931:  "urn:cen.eu:en16931:2017",
  extended: "urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended",
};

/**
 * Validation structurelle légère du XML CII (substitut au XSD officiel,
 * non chargeable dans workerd). Vérifie l'existence des blocs EN 16931
 * obligatoires et l'équilibre des balises. Renvoie la liste des erreurs.
 */
export function validateCiiXmlStructure(xml: string): string[] {
  const errors: string[] = [];
  if (!xml.startsWith("<?xml")) errors.push("Prologue XML manquant");
  if (!xml.includes("<rsm:CrossIndustryInvoice")) errors.push("Racine CrossIndustryInvoice absente");

  const required: Array<[string, string]> = [
    ["ram:ID", "BT-1 numéro de facture"],
    ["ram:TypeCode", "BT-3 code type"],
    ["ram:IssueDateTime", "BT-2 date d'émission"],
    ["ram:SellerTradeParty", "BG-4 vendeur"],
    ["ram:BuyerTradeParty", "BG-7 acheteur"],
    ["ram:InvoiceCurrencyCode", "BT-5 devise"],
    ["ram:GrandTotalAmount", "BT-112 total TTC"],
    ["ram:TaxBasisTotalAmount", "BT-109 total HT"],
    ["ram:TaxTotalAmount", "BT-110 total TVA"],
  ];
  for (const [tagName, label] of required) {
    if (!xml.includes(`<${tagName}`)) errors.push(`Champ obligatoire manquant : ${label}`);
  }

  const opens = xml.match(/<([a-zA-Z][\w:-]*)(\s[^>]*)?(?<!\/)>/g) ?? [];
  const closes = xml.match(/<\/([a-zA-Z][\w:-]*)>/g) ?? [];
  if (opens.length !== closes.length) {
    errors.push(`Balises non équilibrées (${opens.length} ouvertes / ${closes.length} fermées)`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Helpers XML
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | null | undefined, attrs?: Record<string, string>): string {
  if (value === null || value === undefined || value === "") return "";
  const a = attrs
    ? " " + Object.entries(attrs).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(" ")
    : "";
  return `<${name}${a}>${escapeXml(String(value))}</${name}>`;
}

function fmtAmount(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // CII attend AAAAMMJJ avec format="102"
  return iso.slice(0, 10).replace(/-/g, "");
}

// ---------------------------------------------------------------------------
// Mapping document → CII (profil BASIC, urn:cen.eu:en16931:2017)
// ---------------------------------------------------------------------------

interface BuildInput {
  profile?: EinvoiceProfile;
  doc: {
    id: string;
    invoice_number: string | null;
    reference: string | null;
    invoice_type_code: string | null;
    issue_date: string | null;
    due_date: string | null;
    delivery_date: string | null;
    currency: string;
    amount_ht: number | null;
    amount_ttc: number | null;
    total_vat: number | null;
    total_discount: number | null;
    payment_means_code: string | null;
    payment_terms: string | null;
    seller_legal_name: string | null;
    seller_siret: string | null;
    seller_vat_number: string | null;
    seller_address: Record<string, unknown> | null;
    buyer_legal_name: string | null;
    buyer_siret: string | null;
    buyer_vat_number: string | null;
    buyer_address: Record<string, unknown> | null;
    third_party_name: string | null;
    third_party_email: string | null;
  };
  org: {
    legal_name: string | null;
    name: string;
    siret: string | null;
    siren: string | null;
    vat_number: string | null;
    address_line1: string | null;
    address_line2: string | null;
    postal_code: string | null;
    city: string | null;
    country_code: string | null;
    iban: string | null;
    bic: string | null;
  };
  lines: Array<{
    position: number;
    description: string;
    quantity: number;
    unit_code: string | null;
    unit_price_ht: number;
    vat_rate: number;
    vat_category: string;
    line_total_ht: number;
  }>;
  vat_breakdown: Array<{
    vat_rate: number;
    vat_category: string;
    base_ht: number;
    vat_amount: number;
    exemption_reason: string | null;
  }>;
}

function pickAddress(
  snapshot: Record<string, unknown> | null,
  fallback: {
    line1?: string | null;
    line2?: string | null;
    postal_code?: string | null;
    city?: string | null;
    country_code?: string | null;
  },
) {
  const s = snapshot ?? {};
  const get = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : null);
  return {
    line1: get("line1") ?? fallback.line1 ?? null,
    line2: get("line2") ?? fallback.line2 ?? null,
    postal_code: get("postal_code") ?? fallback.postal_code ?? null,
    city: get("city") ?? fallback.city ?? null,
    country_code: (get("country_code") ?? fallback.country_code ?? "FR").toUpperCase(),
  };
}

export type CiiBuildInput = BuildInput;
export function buildCiiXml(input: BuildInput): string {
  const { doc, org, lines, vat_breakdown } = input;
  const profile: EinvoiceProfile = input.profile ?? "en16931";
  const guidelineUrn = PROFILE_URNS[profile];

  const invoiceNumber = doc.invoice_number ?? doc.reference ?? doc.id.slice(0, 8);
  const typeCode = doc.invoice_type_code ?? INVOICE_TYPE_CODES.COMMERCIAL_INVOICE;
  const currency = doc.currency || "EUR";
  const issueDate = fmtDate(doc.issue_date) ?? fmtDate(new Date().toISOString())!;
  const dueDate = fmtDate(doc.due_date);
  const deliveryDate = fmtDate(doc.delivery_date);

  // Vendeur : on privilégie le snapshot figé sur le document
  const sellerName = doc.seller_legal_name ?? org.legal_name ?? org.name;
  const sellerSiret = doc.seller_siret ?? org.siret;
  const sellerVat = doc.seller_vat_number ?? org.vat_number;
  const sellerAddr = pickAddress(doc.seller_address, {
    line1: org.address_line1,
    line2: org.address_line2,
    postal_code: org.postal_code,
    city: org.city,
    country_code: org.country_code,
  });

  // Acheteur : snapshot doc → sinon third_party_*
  const buyerName = doc.buyer_legal_name ?? doc.third_party_name ?? "Client";
  const buyerAddr = pickAddress(doc.buyer_address, { country_code: "FR" });

  // Totaux : si total_vat absent, on dérive amount_ttc - amount_ht
  const totalHt = Number(doc.amount_ht ?? 0);
  const totalTtc = Number(doc.amount_ttc ?? totalHt);
  const totalVat =
    doc.total_vat != null ? Number(doc.total_vat) : Math.max(0, totalTtc - totalHt);

  // Lignes : fallback ligne unique si vide (suffit pour BASIC WL)
  const effectiveLines = lines.length
    ? lines
    : [
        {
          position: 1,
          description: "Prestation",
          quantity: 1,
          unit_code: "C62",
          unit_price_ht: totalHt,
          vat_rate: totalHt > 0 ? Math.round((totalVat / totalHt) * 10000) / 100 : 0,
          vat_category: VAT_CATEGORIES.STANDARD,
          line_total_ht: totalHt,
        },
      ];

  // Ventilation TVA : fallback synthétique
  const effectiveVat = vat_breakdown.length
    ? vat_breakdown
    : [
        {
          vat_rate:
            totalHt > 0 ? Math.round((totalVat / totalHt) * 10000) / 100 : 0,
          vat_category: VAT_CATEGORIES.STANDARD,
          base_ht: totalHt,
          vat_amount: totalVat,
          exemption_reason: null,
        },
      ];

  const sellerSiren = org.siren ?? (sellerSiret ? sellerSiret.slice(0, 9) : null);
  const sellerXml = `
    <ram:SellerTradeParty>
      ${tag("ram:Name", sellerName)}
      ${sellerSiret ? `<ram:SpecifiedLegalOrganization>${tag("ram:ID", sellerSiret, { schemeID: "0009" })}</ram:SpecifiedLegalOrganization>` : sellerSiren ? `<ram:SpecifiedLegalOrganization>${tag("ram:ID", sellerSiren, { schemeID: "0002" })}</ram:SpecifiedLegalOrganization>` : ""}
      <ram:PostalTradeAddress>
        ${tag("ram:PostcodeCode", sellerAddr.postal_code)}
        ${tag("ram:LineOne", sellerAddr.line1)}
        ${tag("ram:LineTwo", sellerAddr.line2)}
        ${tag("ram:CityName", sellerAddr.city)}
        ${tag("ram:CountryID", sellerAddr.country_code)}
      </ram:PostalTradeAddress>
      ${sellerVat ? `<ram:SpecifiedTaxRegistration>${tag("ram:ID", sellerVat, { schemeID: "VA" })}</ram:SpecifiedTaxRegistration>` : ""}
      ${sellerSiren ? `<ram:SpecifiedTaxRegistration>${tag("ram:ID", sellerSiren, { schemeID: "FC" })}</ram:SpecifiedTaxRegistration>` : ""}
    </ram:SellerTradeParty>`;

  const buyerXml = `
    <ram:BuyerTradeParty>
      ${tag("ram:Name", buyerName)}
      ${doc.buyer_siret ? `<ram:SpecifiedLegalOrganization>${tag("ram:ID", doc.buyer_siret, { schemeID: "0009" })}</ram:SpecifiedLegalOrganization>` : ""}
      <ram:PostalTradeAddress>
        ${tag("ram:PostcodeCode", buyerAddr.postal_code)}
        ${tag("ram:LineOne", buyerAddr.line1)}
        ${tag("ram:LineTwo", buyerAddr.line2)}
        ${tag("ram:CityName", buyerAddr.city)}
        ${tag("ram:CountryID", buyerAddr.country_code)}
      </ram:PostalTradeAddress>
      ${doc.buyer_vat_number ? `<ram:SpecifiedTaxRegistration>${tag("ram:ID", doc.buyer_vat_number, { schemeID: "VA" })}</ram:SpecifiedTaxRegistration>` : ""}
    </ram:BuyerTradeParty>`;

  const linesXml = effectiveLines
    .map(
      (l, idx) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>${tag("ram:LineID", String(l.position || idx + 1))}</ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>${tag("ram:Name", l.description)}</ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>${tag("ram:ChargeAmount", fmtAmount(l.unit_price_ht))}</ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>${tag("ram:BilledQuantity", String(l.quantity), { unitCode: l.unit_code ?? "C62" })}</ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${escapeXml(l.vat_category)}</ram:CategoryCode>
          <ram:RateApplicablePercent>${fmtAmount(l.vat_rate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>${tag("ram:LineTotalAmount", fmtAmount(l.line_total_ht))}</ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join("");

  const vatXml = effectiveVat
    .map(
      (v) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmtAmount(v.vat_amount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${v.exemption_reason ? tag("ram:ExemptionReason", v.exemption_reason) : ""}
        <ram:BasisAmount>${fmtAmount(v.base_ht)}</ram:BasisAmount>
        <ram:CategoryCode>${escapeXml(v.vat_category)}</ram:CategoryCode>
        <ram:RateApplicablePercent>${fmtAmount(v.vat_rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`,
    )
    .join("");

  const paymentMeans = doc.payment_means_code ?? PAYMENT_MEANS_CODES.CREDIT_TRANSFER;
  const paymentMeansXml = `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>${escapeXml(paymentMeans)}</ram:TypeCode>
        ${org.iban ? `<ram:PayeePartyCreditorFinancialAccount>${tag("ram:IBANID", org.iban)}</ram:PayeePartyCreditorFinancialAccount>` : ""}
        ${org.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution>${tag("ram:BICID", org.bic)}</ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}
      </ram:SpecifiedTradeSettlementPaymentMeans>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${escapeXml(guidelineUrn)}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(invoiceNumber)}</ram:ID>
    <ram:TypeCode>${escapeXml(typeCode)}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${issueDate}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${linesXml}
    <ram:ApplicableHeaderTradeAgreement>${sellerXml}${buyerXml}</ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      ${deliveryDate ? `<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${deliveryDate}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : ""}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(currency)}</ram:InvoiceCurrencyCode>${paymentMeansXml}${vatXml}
      <ram:SpecifiedTradePaymentTerms>
        ${doc.payment_terms ? tag("ram:Description", doc.payment_terms) : ""}
        ${dueDate ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${dueDate}</udt:DateTimeString></ram:DueDateDateTime>` : ""}
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmtAmount(totalHt)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${fmtAmount(totalHt)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${escapeXml(currency)}">${fmtAmount(totalVat)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmtAmount(totalTtc)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${fmtAmount(totalTtc)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

// ---------------------------------------------------------------------------
// Server function : generate + persist status
// ---------------------------------------------------------------------------

const InputSchema = z.object({
  document_id: z.string().uuid(),
  /** Si true, met einvoice_status='ready' + journalise un événement. */
  mark_ready: z.boolean().optional().default(true),
  /** Profil Factur-X. Par défaut EN 16931 (profil européen complet). */
  profile: z.enum(["minimum", "basic_wl", "basic", "en16931", "extended"]).optional().default("en16931"),
});

export const generateInvoiceCii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Charger la facture
    const { data: doc, error: dErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.document_id)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!doc) throw new Error("Document introuvable");
    if (doc.type !== "invoice") throw new Error("Export e-invoice réservé aux factures");

    // 2) Organisation émettrice
    const { data: org, error: oErr } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", doc.organization_id)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!org) throw new Error("Organisation introuvable");

    // 3) Lignes & ventilation TVA
    const [{ data: lines }, { data: vat }] = await Promise.all([
      supabase
        .from("document_invoice_lines")
        .select("position,description,quantity,unit_code,unit_price_ht,vat_rate,vat_category,line_total_ht")
        .eq("document_id", doc.id)
        .order("position", { ascending: true }),
      supabase
        .from("document_vat_breakdown")
        .select("vat_rate,vat_category,base_ht,vat_amount,exemption_reason")
        .eq("document_id", doc.id),
    ]);

    // 4) Validation minimale (warnings non bloquants)
    const issues: ReadinessIssue[] = checkEinvoiceReadiness({
      invoice_number: doc.invoice_number,
      invoice_type_code: doc.invoice_type_code,
      issue_date: doc.issue_date,
      currency: doc.currency,
      amount_ht: doc.amount_ht,
      amount_ttc: doc.amount_ttc,
      total_vat: doc.total_vat,
      seller_legal_name: doc.seller_legal_name ?? org.legal_name ?? org.name,
      seller_siret: doc.seller_siret ?? org.siret,
      buyer_legal_name: doc.buyer_legal_name ?? doc.third_party_name,
    });

    // 5) Génération XML
    const xml = buildCiiXml({
      profile: data.profile,
      doc: {
        id: doc.id,
        invoice_number: doc.invoice_number,
        reference: doc.reference,
        invoice_type_code: doc.invoice_type_code,
        issue_date: doc.issue_date,
        due_date: doc.due_date,
        delivery_date: doc.delivery_date,
        currency: doc.currency,
        amount_ht: doc.amount_ht == null ? null : Number(doc.amount_ht),
        amount_ttc: doc.amount_ttc == null ? null : Number(doc.amount_ttc),
        total_vat: doc.total_vat == null ? null : Number(doc.total_vat),
        total_discount: doc.total_discount == null ? null : Number(doc.total_discount),
        payment_means_code: doc.payment_means_code,
        payment_terms: doc.payment_terms,
        seller_legal_name: doc.seller_legal_name,
        seller_siret: doc.seller_siret,
        seller_vat_number: doc.seller_vat_number,
        seller_address: (doc.seller_address as Record<string, unknown> | null) ?? null,
        buyer_legal_name: doc.buyer_legal_name,
        buyer_siret: doc.buyer_siret,
        buyer_vat_number: doc.buyer_vat_number,
        buyer_address: (doc.buyer_address as Record<string, unknown> | null) ?? null,
        third_party_name: doc.third_party_name,
        third_party_email: doc.third_party_email,
      },
      org: {
        legal_name: org.legal_name,
        name: org.name,
        siret: org.siret,
        siren: org.siren,
        vat_number: org.vat_number,
        address_line1: org.address_line1,
        address_line2: org.address_line2,
        postal_code: org.postal_code,
        city: org.city,
        country_code: org.country_code,
        iban: org.iban,
        bic: org.bic,
      },
      lines: (lines ?? []).map((l) => ({
        position: l.position,
        description: l.description,
        quantity: Number(l.quantity ?? 1),
        unit_code: l.unit_code,
        unit_price_ht: Number(l.unit_price_ht ?? 0),
        vat_rate: Number(l.vat_rate ?? 0),
        vat_category: l.vat_category ?? "S",
        line_total_ht: Number(l.line_total_ht ?? 0),
      })),
      vat_breakdown: (vat ?? []).map((v) => ({
        vat_rate: Number(v.vat_rate ?? 0),
        vat_category: v.vat_category ?? "S",
        base_ht: Number(v.base_ht ?? 0),
        vat_amount: Number(v.vat_amount ?? 0),
        exemption_reason: v.exemption_reason,
      })),
    });

    // 5b) Validation structurelle (substitut XSD côté serverless)
    const structureErrors = validateCiiXmlStructure(xml);
    for (const err of structureErrors) issues.push({ field: "xml", message: err });

    const invoiceNumber = doc.invoice_number ?? doc.reference ?? doc.id.slice(0, 8);
    const filename = `factur-x-${data.profile}-${String(invoiceNumber).replace(/[^A-Za-z0-9._-]/g, "_")}.xml`;

    // 6) Optionnel : marquer le doc comme "ready" + journaliser
    if (data.mark_ready) {
      const fromStatus = doc.einvoice_status ?? "not_applicable";
      await supabase
        .from("documents")
        .update({
          einvoice_format: "factur_x",
          einvoice_profile: data.profile,
          einvoice_status: "ready",
          einvoice_last_event_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      await supabase.from("einvoice_events").insert({
        document_id: doc.id,
        from_status: fromStatus,
        to_status: "ready",
        source: "internal",
        reason: `CII XML generated (profile=${data.profile})`,
        payload: { user_id: userId, issues_count: issues.length, profile: data.profile },
      });
    }

    return {
      xml,
      filename,
      profile: data.profile,
      format: "factur_x" as const,
      issues,
    };
  });
