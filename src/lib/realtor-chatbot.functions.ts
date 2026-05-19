import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sendResendEmail, renderSignatureRequestEmail, getOriginFromRequest } from "@/lib/email-sender";

export type DocKind =
  | "visit_slip"
  | "purchase_offer"
  | "mandate_simple"
  | "mandate_exclusive"
  | "purchase_order"
  | "quote"
  | "invoice";

const KIND_META: Record<DocKind, { title: string; prefix: string; tag: string }> = {
  visit_slip:        { title: "Bon de visite",                  prefix: "BV", tag: "realtor:visit" },
  purchase_offer:    { title: "Offre d'achat",                  prefix: "OA", tag: "realtor:offer" },
  mandate_simple:    { title: "Mandat de vente simple",         prefix: "MS", tag: "realtor:mandate-simple" },
  mandate_exclusive: { title: "Mandat de vente exclusif",       prefix: "ME", tag: "realtor:mandate-exclusive" },
  purchase_order:    { title: "Bon de commande",                prefix: "BC", tag: "commercial:order" },
  quote:             { title: "Devis",                          prefix: "DV", tag: "commercial:quote" },
  invoice:           { title: "Facture",                        prefix: "FA", tag: "commercial:invoice" },
};

const Schema = z.object({
  kind: z.enum(["visit_slip", "purchase_offer", "mandate_simple", "mandate_exclusive", "purchase_order", "quote", "invoice"]),
  client_name: z.string().min(1).max(200),
  client_email: z.string().email().max(255),
  client_phone: z.string().max(40).optional().default(""),
  property_address: z.string().min(1).max(400),
  property_description: z.string().max(800).optional().default(""),
  amount: z.number().nonnegative().optional().nullable(),
  agent_notes: z.string().max(1000).optional().default(""),
});

const W = 595.28, H = 841.89;

// Replace characters that WinAnsi (Helvetica standard font) cannot encode.
function s(t: string): string {
  return t
    .replace(/\u202F/g, " ")  // narrow no-break space (from fr-FR number/currency formatting)
    .replace(/\u00A0/g, " ")  // no-break space
    .replace(/\u2009/g, " ")  // thin space
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u2026/g, "...");
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of s(text).split(/\n/)) {
    const words = para.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(t, size) > max && cur) { out.push(cur); cur = w; }
      else cur = t;
    }
    out.push(cur);
  }
  return out;
}

function drawPara(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, max: number, color = rgb(0.15, 0.17, 0.2)): number {
  const lh = size * 1.4;
  for (const ln of wrap(text, font, size, max)) {
    page.drawText(ln, { x, y, size, font, color });
    y -= lh;
  }
  return y;
}

async function buildPdf(kind: DocKind, orgName: string, reference: string, input: z.infer<typeof Schema>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const meta = KIND_META[kind];

  const accent = kind === "visit_slip" ? rgb(0.07, 0.45, 0.42)
    : kind === "purchase_offer" ? rgb(0.12, 0.27, 0.55)
    : kind === "mandate_simple" ? rgb(0.45, 0.30, 0.10)
    : rgb(0.30, 0.10, 0.40);
  const dark = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.45, 0.48, 0.55);

  // Header
  page.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: accent });
  page.drawText(s(orgName), { x: 40, y: H - 35, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText(s(meta.title.toUpperCase()), { x: 40, y: H - 58, size: 11, font: reg, color: rgb(0.92, 0.96, 0.96) });

  // Meta box
  page.drawRectangle({ x: W - 220, y: H - 150, width: 180, height: 55, borderColor: muted, borderWidth: 0.6 });
  page.drawText(s(`N° ${reference}`), { x: W - 210, y: H - 110, size: 10, font: bold, color: dark });
  const today = new Date().toLocaleDateString("fr-FR");
  page.drawText(s(`Date : ${today}`), { x: W - 210, y: H - 125, size: 9, font: reg, color: dark });
  page.drawText(s(`Valable 12 mois`), { x: W - 210, y: H - 140, size: 9, font: reg, color: muted });

  // Parties
  let y = H - 120;
  page.drawText("AGENCE", { x: 40, y, size: 8, font: bold, color: muted }); y -= 14;
  page.drawText(s(orgName), { x: 40, y, size: 11, font: bold, color: dark }); y -= 12;
  page.drawText(s("Carte professionnelle CPI — Loi Hoguet n° 70-9"), { x: 40, y, size: 9, font: reg, color: muted });

  y = H - 185;
  page.drawText("CLIENT", { x: 40, y, size: 8, font: bold, color: muted }); y -= 14;
  page.drawText(s(input.client_name), { x: 40, y, size: 11, font: bold, color: dark }); y -= 12;
  page.drawText(s(`Email : ${input.client_email}`), { x: 40, y, size: 9, font: reg, color: dark }); y -= 11;
  if (input.client_phone) page.drawText(s(`Téléphone : ${input.client_phone}`), { x: 40, y, size: 9, font: reg, color: dark });

  // Property
  y = H - 270;
  page.drawText("BIEN IMMOBILIER", { x: 40, y, size: 8, font: bold, color: muted }); y -= 14;
  y = drawPara(page, input.property_address, 40, y, bold, 11, W - 80, dark); y -= 4;
  if (input.property_description) y = drawPara(page, input.property_description, 40, y, reg, 9, W - 80, dark);

  // Amount
  if (input.amount && input.amount > 0) {
    y -= 14;
    const amountLabel = kind === "purchase_offer" ? "MONTANT DE L'OFFRE"
      : kind === "visit_slip" ? "PRIX DE PRÉSENTATION"
      : "PRIX DE VENTE NET VENDEUR";
    page.drawText(s(amountLabel), { x: 40, y, size: 8, font: bold, color: muted }); y -= 16;
    page.drawRectangle({ x: 40, y: y - 4, width: 200, height: 26, color: accent });
    page.drawText(s(`${input.amount.toLocaleString("fr-FR")} €`), { x: 50, y: y + 5, size: 13, font: bold, color: rgb(1, 1, 1) });
    y -= 30;
  }

  // Legal text per kind
  y -= 16;
  page.drawRectangle({ x: 40, y: y - 4, width: W - 80, height: 22, color: rgb(0.95, 0.96, 0.99) });
  page.drawText("Engagement", { x: 50, y: y + 4, size: 10, font: bold, color: dark });
  y -= 30;

  const legal: Record<DocKind, string> = {
    visit_slip:
      "Le visiteur reconnaît avoir visité ce jour le bien décrit ci-dessus, présenté par l'agence titulaire d'un mandat. Il s'engage à ne traiter qu'avec elle pour l'acquisition de ce bien, directement ou par personne interposée, pendant douze (12) mois à compter de la présente visite. La présente reconnaissance ne vaut ni promesse d'achat ni offre d'acquisition.",
    purchase_offer:
      "Le candidat acquéreur déclare faire offre d'acquérir le bien désigné aux conditions et au prix indiqués ci-dessus. La présente offre est valable quinze (15) jours. En cas d'acceptation écrite du vendeur, les parties s'engagent à régulariser un avant-contrat dans un délai de trente (30) jours. L'offre est faite sous réserve de l'obtention d'un financement et du purge des droits de préemption.",
    mandate_simple:
      "Le mandant confie à l'agence, à titre non exclusif, le soin de rechercher un acquéreur pour le bien désigné, au prix net vendeur indiqué. Le mandant conserve la faculté de traiter directement ou par l'intermédiaire d'un autre mandataire. Durée : trois (3) mois renouvelables. Honoraires à la charge de l'acquéreur, dus en cas de vente conclue grâce à l'entremise de l'agence.",
    mandate_exclusive:
      "Le mandant confie à l'agence, à titre EXCLUSIF, le soin de rechercher un acquéreur pour le bien désigné. Pendant la durée du mandat, le mandant s'interdit de traiter directement ou par l'intermédiaire d'un autre mandataire. Durée irrévocable : trois (3) mois, puis reconductible jusqu'à dénonciation. Honoraires dus à l'agence en cas de vente conclue pendant la durée du mandat, y compris avec un acquéreur présenté par le mandant.",
  };
  y = drawPara(page, legal[kind], 40, y, reg, 9, W - 80, dark);

  if (input.agent_notes) {
    y -= 14;
    page.drawText(s("Conditions particulières"), { x: 40, y, size: 9, font: bold, color: dark }); y -= 14;
    y = drawPara(page, input.agent_notes, 40, y, reg, 9, W - 80, dark);
  }

  // Signature
  y -= 30;
  page.drawText(s("Mention « lu et approuvé » + signature du client"), { x: 40, y, size: 9, font: ital, color: muted });
  page.drawRectangle({ x: 40, y: y - 80, width: W - 80, height: 70, borderColor: muted, borderWidth: 0.5 });

  // Footer
  page.drawLine({ start: { x: 40, y: 50 }, end: { x: W - 40, y: 50 }, thickness: 0.4, color: muted });
  page.drawText(s(`${orgName} — Document généré via Lovable`), { x: 40, y: 36, size: 8, font: reg, color: muted });
  page.drawText(s("Document soumis à signature électronique"), { x: W - 220, y: 36, size: 8, font: ital, color: muted });

  return await pdf.save();
}

export const createRealtorDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id, organizations(name)")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");
    const orgName = (me as { organizations?: { name?: string } | null })?.organizations?.name || "Mon agence";

    const meta = KIND_META[data.kind];
    const reference = `${meta.prefix}-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const title = `${meta.title} — ${data.property_address.slice(0, 60)}`;
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 15 * 86400_000).toISOString().slice(0, 10);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        organization_id: me.organization_id,
        created_by: userId,
        type: "contract",
        status: "sent",
        title,
        reference,
        description: data.property_description || meta.title,
        amount_ht: data.amount ?? null,
        amount_ttc: data.amount ?? null,
        currency: "EUR",
        third_party_name: data.client_name,
        third_party_email: data.client_email,
        issue_date: today,
        due_date: due,
        tags: [meta.tag, "realtor"],
      })
      .select()
      .single();
    if (docErr) throw new Error(docErr.message);

    const bytes = await buildPdf(data.kind, orgName, reference, data);
    const storagePath = `${me.organization_id}/${doc.id}/${data.kind}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);

    await supabase.from("document_files").insert({
      document_id: doc.id,
      version: 1,
      storage_path: storagePath,
      file_name: `${reference}.pdf`,
      mime_type: "application/pdf",
      size_bytes: bytes.byteLength,
      uploaded_by: userId,
      is_current: true,
    });

    const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    const { data: sigReq, error: sigErr } = await supabase
      .from("document_signature_requests")
      .insert({
        document_id: doc.id,
        signer_name: data.client_name,
        signer_email: data.client_email,
        order_index: 1,
        sequential: false,
        invited_by: userId,
        expires_at: expiresAt,
      })
      .select("token")
      .single();
    if (sigErr) throw new Error(sigErr.message);

    const origin = (typeof process !== "undefined" && process.env?.APP_ORIGIN) || "";
    const signature_url = sigReq?.token ? `${origin}/s/${sigReq.token}` : "";

    return {
      document_id: doc.id,
      title,
      reference,
      signature_url,
      signature_token: sigReq?.token ?? "",
      client_name: data.client_name,
      client_email: data.client_email,
      client_phone: data.client_phone,
      kind: data.kind,
      kind_label: meta.title,
    };
  });

export const sendRealtorSignatureEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      token: z.string().min(10).max(200),
      signer_name: z.string().min(1).max(200),
      signer_email: z.string().email().max(255),
      document_title: z.string().min(1).max(300),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Resolve sender org name for nicer email body
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    let orgName: string | null = null;
    if (profile?.organization_id) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", profile.organization_id)
        .maybeSingle();
      orgName = org?.name ?? null;
    }

    const origin = getOriginFromRequest(getRequest());
    const url = `${origin}/s/${data.token}`;
    await sendResendEmail({
      to: data.signer_email,
      subject: `Signature requise — ${data.document_title}`,
      html: renderSignatureRequestEmail({
        signerName: data.signer_name,
        documentTitle: data.document_title,
        url,
        senderOrg: orgName,
      }),
    });
    return { ok: true };
  });
