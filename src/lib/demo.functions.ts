import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const DEMO_TAG = "demo";
const DEMO_SIGNER_EMAIL = "jbbejot@gmail.com";
const DEMO_SIGNER_NAME = "Jean-Baptiste Bejot";

type Scenario = "purchase_order" | "visit_slip";

interface ScenarioMeta {
  key: Scenario;
  tag: string;
  title: string;
  reference: string;
  third_party_name: string;
  amount_ht: number | null;
  amount_ttc: number | null;
  type: "purchase_order" | "contract";
  description: string;
}

const SCENARIOS: ScenarioMeta[] = [
  {
    key: "purchase_order",
    tag: "demo:po",
    title: "Bon de commande — Prestation de conseil digital",
    reference: "BC-2026-0142",
    third_party_name: "Studio Velvet",
    amount_ht: 8400,
    amount_ttc: 10080,
    type: "purchase_order",
    description: "Mission d'accompagnement digital — 12 jours / 700 € HT.",
  },
  {
    key: "visit_slip",
    tag: "demo:visit",
    title: "Bon de visite — 14 rue des Lilas, 75011 Paris",
    reference: "BV-2026-0087",
    third_party_name: "Agence Horizon Immobilier",
    amount_ht: null,
    amount_ttc: null,
    type: "contract",
    description: "Visite d'un appartement T3 — 68 m² — sans engagement d'achat.",
  },
];

function pageWidth(): number { return 595.28; }
function pageHeight(): number { return 841.89; }

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawParagraph(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; font: PDFFont; size: number; maxWidth: number; lineHeight?: number; color?: ReturnType<typeof rgb> },
): number {
  const lh = opts.lineHeight ?? opts.size * 1.35;
  const lines = wrap(text, opts.font, opts.size, opts.maxWidth);
  let y = opts.y;
  for (const ln of lines) {
    page.drawText(ln, { x: opts.x, y, size: opts.size, font: opts.font, color: opts.color ?? rgb(0.15, 0.17, 0.2) });
    y -= lh;
  }
  return y;
}

async function buildPurchaseOrderPdf(orgName: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pageWidth(), pageHeight()]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const accent = rgb(0.12, 0.27, 0.55);
  const dark = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.45, 0.48, 0.55);

  // Header band
  page.drawRectangle({ x: 0, y: pageHeight() - 70, width: pageWidth(), height: 70, color: accent });
  page.drawText(orgName, { x: 40, y: pageHeight() - 35, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText("BON DE COMMANDE", { x: 40, y: pageHeight() - 55, size: 11, font: reg, color: rgb(0.85, 0.9, 1) });

  // Doc meta box (right)
  page.drawRectangle({ x: pageWidth() - 220, y: pageHeight() - 145, width: 180, height: 60, borderColor: muted, borderWidth: 0.6 });
  page.drawText("N° BC-2026-0142", { x: pageWidth() - 210, y: pageHeight() - 105, size: 10, font: bold, color: dark });
  page.drawText("Date : 17 mai 2026", { x: pageWidth() - 210, y: pageHeight() - 120, size: 9, font: reg, color: dark });
  page.drawText("Échéance : 30 juin 2026", { x: pageWidth() - 210, y: pageHeight() - 135, size: 9, font: reg, color: dark });

  // Parties
  let y = pageHeight() - 110;
  page.drawText("COMMANDITAIRE", { x: 40, y, size: 8, font: bold, color: muted });
  y -= 14;
  page.drawText(orgName, { x: 40, y, size: 11, font: bold, color: dark }); y -= 13;
  page.drawText("12 avenue de la République, 75011 Paris", { x: 40, y, size: 9, font: reg, color: dark }); y -= 12;
  page.drawText("SIRET 812 345 678 00021 — TVA FR12 812345678", { x: 40, y, size: 9, font: reg, color: dark });

  y = pageHeight() - 195;
  page.drawText("PRESTATAIRE", { x: 40, y, size: 8, font: bold, color: muted }); y -= 14;
  page.drawText("Studio Velvet SAS", { x: 40, y, size: 11, font: bold, color: dark }); y -= 13;
  page.drawText("8 rue Saint-Sabin, 75011 Paris", { x: 40, y, size: 9, font: reg, color: dark }); y -= 12;
  page.drawText("SIRET 905 112 884 00018 — TVA FR45 905112884", { x: 40, y, size: 9, font: reg, color: dark });

  // Table header
  y = pageHeight() - 310;
  page.drawRectangle({ x: 40, y: y - 4, width: pageWidth() - 80, height: 22, color: rgb(0.93, 0.95, 0.99) });
  page.drawText("Description", { x: 50, y: y + 4, size: 9, font: bold, color: dark });
  page.drawText("Qté", { x: 330, y: y + 4, size: 9, font: bold, color: dark });
  page.drawText("PU HT", { x: 380, y: y + 4, size: 9, font: bold, color: dark });
  page.drawText("Total HT", { x: 480, y: y + 4, size: 9, font: bold, color: dark });

  // Row
  y -= 22;
  page.drawText("Accompagnement digital — cadrage, ateliers, livrables", { x: 50, y: y + 4, size: 9, font: reg, color: dark });
  page.drawText("12 j", { x: 330, y: y + 4, size: 9, font: reg, color: dark });
  page.drawText("700,00", { x: 380, y: y + 4, size: 9, font: reg, color: dark });
  page.drawText("8 400,00", { x: 480, y: y + 4, size: 9, font: reg, color: dark });
  page.drawLine({ start: { x: 40, y: y - 2 }, end: { x: pageWidth() - 40, y: y - 2 }, thickness: 0.4, color: muted });

  // Totals
  y -= 30;
  page.drawText("Total HT", { x: 400, y, size: 10, font: reg, color: dark });
  page.drawText("8 400,00 €", { x: 490, y, size: 10, font: reg, color: dark });
  y -= 14;
  page.drawText("TVA 20 %", { x: 400, y, size: 10, font: reg, color: dark });
  page.drawText("1 680,00 €", { x: 490, y, size: 10, font: reg, color: dark });
  y -= 18;
  page.drawRectangle({ x: 390, y: y - 4, width: 165, height: 22, color: accent });
  page.drawText("Total TTC", { x: 400, y: y + 4, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText("10 080,00 €", { x: 490, y: y + 4, size: 11, font: bold, color: rgb(1, 1, 1) });

  // Mentions
  y -= 60;
  page.drawText("Conditions", { x: 40, y, size: 10, font: bold, color: dark });
  y -= 16;
  y = drawParagraph(page,
    "Délai de paiement : 30 jours date d'émission. Tout retard entraîne une pénalité de 3 fois le taux légal et une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce). Bon pour accord vaut commande ferme.",
    { x: 40, y, font: reg, size: 9, maxWidth: pageWidth() - 80, color: dark });

  y -= 24;
  page.drawText("Signature du prestataire (bon pour accord)", { x: 40, y, size: 9, font: ital, color: muted });
  page.drawLine({ start: { x: 40, y: y - 50 }, end: { x: 280, y: y - 50 }, thickness: 0.6, color: muted });

  // Footer
  page.drawLine({ start: { x: 40, y: 50 }, end: { x: pageWidth() - 40, y: 50 }, thickness: 0.4, color: muted });
  page.drawText(`${orgName} — Démonstration Lovable`, { x: 40, y: 36, size: 8, font: reg, color: muted });
  page.drawText("Document de démonstration — non opposable", { x: pageWidth() - 220, y: 36, size: 8, font: ital, color: muted });

  return await pdf.save();
}

async function buildVisitSlipPdf(orgName: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pageWidth(), pageHeight()]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const accent = rgb(0.07, 0.45, 0.42);
  const dark = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.45, 0.48, 0.55);

  // Header
  page.drawRectangle({ x: 0, y: pageHeight() - 80, width: pageWidth(), height: 80, color: accent });
  page.drawText("Agence Horizon Immobilier", { x: 40, y: pageHeight() - 35, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText("BON DE VISITE — Loi Hoguet n° 70-9 du 2 janvier 1970", { x: 40, y: pageHeight() - 58, size: 10, font: reg, color: rgb(0.88, 0.96, 0.94) });

  // Meta box
  page.drawRectangle({ x: pageWidth() - 220, y: pageHeight() - 165, width: 180, height: 70, borderColor: muted, borderWidth: 0.6 });
  page.drawText("N° BV-2026-0087", { x: pageWidth() - 210, y: pageHeight() - 115, size: 10, font: bold, color: dark });
  page.drawText("Date visite : 17 mai 2026", { x: pageWidth() - 210, y: pageHeight() - 130, size: 9, font: reg, color: dark });
  page.drawText("Heure : 14h30", { x: pageWidth() - 210, y: pageHeight() - 145, size: 9, font: reg, color: dark });
  page.drawText("Carte pro CPI 7501 2024", { x: pageWidth() - 210, y: pageHeight() - 160, size: 8, font: reg, color: muted });

  // Bien
  let y = pageHeight() - 130;
  page.drawText("BIEN VISITÉ", { x: 40, y, size: 8, font: bold, color: muted }); y -= 14;
  page.drawText("Appartement T3 — 68 m² Carrez", { x: 40, y, size: 12, font: bold, color: dark }); y -= 14;
  page.drawText("14 rue des Lilas, 75011 Paris — 4ᵉ étage avec ascenseur", { x: 40, y, size: 10, font: reg, color: dark }); y -= 12;
  page.drawText("Prix de présentation : 595 000 € — Honoraires charge vendeur", { x: 40, y, size: 10, font: reg, color: dark });

  // Visiteur
  y = pageHeight() - 220;
  page.drawText("VISITEUR", { x: 40, y, size: 8, font: bold, color: muted }); y -= 14;
  page.drawText("Jean-Baptiste Bejot", { x: 40, y, size: 11, font: bold, color: dark }); y -= 13;
  page.drawText("Email : jbbejot@gmail.com", { x: 40, y, size: 9, font: reg, color: dark }); y -= 12;
  page.drawText("Téléphone : +33 6 12 34 56 78", { x: 40, y, size: 9, font: reg, color: dark });

  // Agent
  y = pageHeight() - 300;
  page.drawText("NÉGOCIATEUR", { x: 320, y, size: 8, font: bold, color: muted }); y -= 14;
  page.drawText("Camille Laurent", { x: 320, y, size: 11, font: bold, color: dark }); y -= 13;
  page.drawText("camille.laurent@horizon-immo.fr", { x: 320, y, size: 9, font: reg, color: dark });

  // Engagement
  y = pageHeight() - 380;
  page.drawRectangle({ x: 40, y: y - 4, width: pageWidth() - 80, height: 22, color: rgb(0.93, 0.97, 0.96) });
  page.drawText("Reconnaissance de visite", { x: 50, y: y + 4, size: 10, font: bold, color: dark });

  y -= 30;
  y = drawParagraph(page,
    "Le visiteur reconnaît avoir visité ce jour le bien décrit ci-dessus, présenté par l'Agence Horizon Immobilier, titulaire d'un mandat de vente. Il s'engage à ne traiter qu'avec elle pour l'acquisition de ce bien, directement ou par personne interposée, pendant une durée de douze (12) mois à compter de la présente visite, et à ne pas communiquer les informations à des tiers.",
    { x: 40, y, font: reg, size: 9, maxWidth: pageWidth() - 80, color: dark });

  y -= 14;
  y = drawParagraph(page,
    "En cas de manquement, le visiteur sera redevable envers l'agence d'une indemnité égale au montant des honoraires de négociation prévus au mandat. La présente reconnaissance ne vaut ni promesse d'achat ni offre d'acquisition.",
    { x: 40, y, font: reg, size: 9, maxWidth: pageWidth() - 80, color: dark });

  // Signature zone
  y -= 30;
  page.drawText("Mention « lu et approuvé » + signature du visiteur", { x: 40, y, size: 9, font: ital, color: muted });
  page.drawRectangle({ x: 40, y: y - 90, width: pageWidth() - 80, height: 80, borderColor: muted, borderWidth: 0.5 });

  // Footer
  page.drawLine({ start: { x: 40, y: 50 }, end: { x: pageWidth() - 40, y: 50 }, thickness: 0.4, color: muted });
  page.drawText(`${orgName} — Démonstration Lovable`, { x: 40, y: 36, size: 8, font: reg, color: muted });
  page.drawText("Document de démonstration — non opposable", { x: pageWidth() - 220, y: 36, size: 8, font: ital, color: muted });

  return await pdf.save();
}

async function generatePdf(scenario: Scenario, orgName: string): Promise<Uint8Array> {
  if (scenario === "purchase_order") return buildPurchaseOrderPdf(orgName);
  return buildVisitSlipPdf(orgName);
}

interface DemoScenarioResult {
  scenario: Scenario;
  label: string;
  document_id: string;
  title: string;
  reference: string;
  signature_token: string;
  signature_url: string;
  signer_email: string;
  status: string;
}

async function buildResult(supabase: ReturnType<typeof requireSupabaseAuth> extends never ? never : any, docId: string, scenario: ScenarioMeta, origin: string): Promise<DemoScenarioResult> {
  const { data: req } = await supabase
    .from("document_signature_requests")
    .select("token, status, signer_email")
    .eq("document_id", docId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    scenario: scenario.key,
    label: scenario.title,
    document_id: docId,
    title: scenario.title,
    reference: scenario.reference,
    signature_token: req?.token ?? "",
    signature_url: req?.token ? `${origin}/s/${req.token}` : "",
    signer_email: req?.signer_email ?? DEMO_SIGNER_EMAIL,
    status: req?.status ?? "pending",
  };
}

export const listDemoScenarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const origin = (typeof process !== "undefined" && process.env?.APP_ORIGIN) || "";
    const results: DemoScenarioResult[] = [];
    for (const sc of SCENARIOS) {
      const { data: doc } = await supabase
        .from("documents")
        .select("id, title, reference, status")
        .contains("tags", [sc.tag])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!doc) {
        results.push({
          scenario: sc.key, label: sc.title, document_id: "", title: sc.title,
          reference: sc.reference, signature_token: "", signature_url: "",
          signer_email: DEMO_SIGNER_EMAIL, status: "not_created",
        });
      } else {
        results.push(await buildResult(supabase, doc.id, sc, origin));
      }
    }
    return { scenarios: results };
  });

async function createOneScenario(
  supabase: any,
  userId: string,
  orgId: string,
  orgName: string,
  scenario: ScenarioMeta,
  origin: string,
): Promise<DemoScenarioResult> {
  // Remove any prior demo doc for this scenario (cascade removes files/requests)
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .contains("tags", [scenario.tag]);
  if (existing && existing.length) {
    for (const row of existing) {
      // Remove storage objects first
      const { data: files } = await supabase
        .from("document_files")
        .select("storage_path")
        .eq("document_id", row.id);
      if (files?.length) {
        await supabase.storage.from("documents").remove(files.map((f: { storage_path: string }) => f.storage_path));
      }
      await supabase.from("documents").delete().eq("id", row.id);
    }
  }

  // Create document
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({
      organization_id: orgId,
      created_by: userId,
      type: scenario.type,
      status: "sent",
      title: scenario.title,
      reference: scenario.reference,
      description: scenario.description,
      amount_ht: scenario.amount_ht,
      amount_ttc: scenario.amount_ttc,
      currency: "EUR",
      third_party_name: scenario.third_party_name,
      third_party_email: DEMO_SIGNER_EMAIL,
      issue_date: today,
      due_date: due,
      tags: [DEMO_TAG, scenario.tag],
    })
    .select()
    .single();
  if (docErr) throw new Error(docErr.message);

  // Generate + upload PDF
  const bytes = await generatePdf(scenario.key, orgName);
  const storagePath = `${orgId}/${doc.id}/demo-${scenario.key}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(upErr.message);

  await supabase.from("document_files").insert({
    document_id: doc.id,
    version: 1,
    storage_path: storagePath,
    file_name: `${scenario.reference}.pdf`,
    mime_type: "application/pdf",
    size_bytes: bytes.byteLength,
    uploaded_by: userId,
    is_current: true,
  });

  // Create signature request
  const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
  await supabase.from("document_signature_requests").insert({
    document_id: doc.id,
    signer_name: DEMO_SIGNER_NAME,
    signer_email: DEMO_SIGNER_EMAIL,
    order_index: 1,
    sequential: false,
    invited_by: userId,
    expires_at: expiresAt,
  });

  return await buildResult(supabase, doc.id, scenario, origin);
}

export const seedDemoScenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id, organizations(name)")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");
    const orgName = (me as { organizations?: { name?: string } | null })?.organizations?.name || "Mon organisation";
    const origin = (typeof process !== "undefined" && process.env?.APP_ORIGIN) || "";

    const results: DemoScenarioResult[] = [];
    for (const sc of SCENARIOS) {
      results.push(await createOneScenario(supabase, userId, me.organization_id, orgName, sc, origin));
    }
    return { scenarios: results };
  });

export const resetDemoScenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: docs } = await supabase
      .from("documents")
      .select("id")
      .contains("tags", [DEMO_TAG]);
    if (docs?.length) {
      for (const d of docs) {
        const { data: files } = await supabase
          .from("document_files")
          .select("storage_path")
          .eq("document_id", d.id);
        if (files?.length) {
          await supabase.storage.from("documents").remove(files.map((f: { storage_path: string }) => f.storage_path));
        }
        await supabase.from("documents").delete().eq("id", d.id);
      }
    }
    return { ok: true };
  });
