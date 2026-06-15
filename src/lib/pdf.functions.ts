import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0.12, g: 0.16, b: 0.22 };
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

interface DocRecord {
  id: string;
  organization_id: string;
  type: string;
  title: string;
  reference: string | null;
  document_number?: string | null;
  invoice_number?: string | null;
  description: string | null;
  amount_ht: number | null;
  amount_ttc: number | null;
  currency: string;
  third_party_name: string | null;
  third_party_email: string | null;
  issue_date: string | null;
  due_date: string | null;
}

interface TemplateRecord {
  name: string;
  primary_color: string | null;
  header_html: string | null;
  footer_html: string | null;
  legal_mentions: string | null;
  payment_terms: string | null;
  iban: string | null;
  bic: string | null;
  vat_number: string | null;
}

interface OrgRecord {
  name: string;
  country: string;
  logo_storage_path?: string | null;
}

// Strip very basic HTML tags for plain-text rendering
function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

export async function buildDocumentPdf(
  doc: DocRecord,
  org: OrgRecord,
  template: TemplateRecord | null,
  opts: { logoBytes?: Uint8Array | null; logoMime?: string | null } = {},
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const rawPage = pdfDoc.addPage([595.28, 841.89]); // A4
  const sanitize = (s: string) => s.replace(/[\u00a0\u202f\u2009\u200a\u2007\u2060]/g, " ").replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
  const _origDraw = rawPage.drawText.bind(rawPage);
  rawPage.drawText = ((text: string, opts: Parameters<typeof _origDraw>[1]) => _origDraw(sanitize(text ?? ""), opts)) as typeof rawPage.drawText;
  const page = rawPage;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const color = hexToRgb(template?.primary_color || "#1f2937");
  const accent = rgb(color.r, color.g, color.b);
  const dark = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.4, 0.4, 0.45);

  let y = 800;
  const left = 50;
  const right = 545;

  // Header bar
  page.drawRectangle({ x: 0, y: 800, width: 595.28, height: 42, color: accent });

  // Logo (left of header), fall back to org name in bold.
  let headerTextX = left;
  if (opts.logoBytes && opts.logoBytes.length > 0) {
    try {
      const img = (opts.logoMime ?? "").includes("png")
        ? await pdfDoc.embedPng(opts.logoBytes)
        : await pdfDoc.embedJpg(opts.logoBytes);
      const maxH = 32;
      const ratio = img.width / img.height;
      const h = Math.min(maxH, img.height);
      const w = h * ratio;
      page.drawImage(img, { x: left, y: 805, width: w, height: h });
      headerTextX = left + w + 10;
    } catch {
      // unsupported format (e.g. SVG) — fall back silently
    }
  }
  page.drawText(org.name, { x: headerTextX, y: 815, size: 14, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText(stripHtml(template?.header_html) || "", {
    x: headerTextX, y: 802, size: 8, font, color: rgb(1, 1, 1),
  });

  y = 760;
  const typeLabel: Record<string, string> = {
    purchase_order: "BON DE COMMANDE",
    quote: "DEVIS",
    invoice: "FACTURE",
    contract: "CONTRAT",
    other: "DOCUMENT",
  };
  page.drawText(typeLabel[doc.type] || "DOCUMENT", { x: left, y, size: 22, font: fontBold, color: dark });
  const legalNumber = doc.document_number ?? doc.invoice_number ?? doc.reference ?? null;
  if (legalNumber) {
    page.drawText(`N° ${legalNumber}`, { x: left, y: y - 18, size: 10, font: fontBold, color: dark });
  }


  // Right block: dates
  let yr = y;
  if (doc.issue_date) {
    page.drawText(`Date : ${doc.issue_date}`, { x: right - 150, y: yr, size: 10, font, color: dark });
    yr -= 14;
  }
  if (doc.due_date) {
    page.drawText(`Échéance : ${doc.due_date}`, { x: right - 150, y: yr, size: 10, font, color: dark });
  }

  // Tiers
  y -= 60;
  page.drawText("DESTINATAIRE", { x: left, y, size: 9, font: fontBold, color: muted });
  y -= 14;
  page.drawText(doc.third_party_name || "—", { x: left, y, size: 12, font: fontBold, color: dark });
  y -= 14;
  if (doc.third_party_email) {
    page.drawText(doc.third_party_email, { x: left, y, size: 10, font, color: muted });
    y -= 14;
  }

  // Title
  y -= 24;
  page.drawText("OBJET", { x: left, y, size: 9, font: fontBold, color: muted });
  y -= 14;
  page.drawText(doc.title, { x: left, y, size: 13, font: fontBold, color: dark });

  // Description
  if (doc.description) {
    y -= 24;
    const desc = doc.description.substring(0, 1500);
    const lines = wrapText(desc, font, 10, right - left);
    for (const line of lines) {
      if (y < 250) break;
      page.drawText(line, { x: left, y, size: 10, font, color: dark });
      y -= 13;
    }
  }

  // Amounts box
  y = Math.min(y - 30, 350);
  page.drawRectangle({ x: left, y: y - 70, width: right - left, height: 70, borderColor: accent, borderWidth: 1 });
  if (doc.amount_ht != null) {
    page.drawText("Montant HT", { x: left + 12, y: y - 22, size: 10, font, color: muted });
    page.drawText(`${doc.amount_ht.toLocaleString("fr-FR")} ${doc.currency}`, {
      x: right - 130, y: y - 22, size: 11, font: fontBold, color: dark,
    });
  }
  if (doc.amount_ttc != null) {
    page.drawText("Total TTC", { x: left + 12, y: y - 50, size: 11, font: fontBold, color: dark });
    page.drawText(`${doc.amount_ttc.toLocaleString("fr-FR")} ${doc.currency}`, {
      x: right - 130, y: y - 50, size: 13, font: fontBold, color: accent,
    });
  }

  // Payment terms / IBAN
  y -= 90;
  if (template?.payment_terms) {
    page.drawText("CONDITIONS DE PAIEMENT", { x: left, y, size: 9, font: fontBold, color: muted });
    y -= 12;
    for (const line of wrapText(stripHtml(template.payment_terms), font, 9, right - left)) {
      if (y < 120) break;
      page.drawText(line, { x: left, y, size: 9, font, color: dark });
      y -= 11;
    }
  }
  if (template?.iban) {
    y -= 8;
    page.drawText(`IBAN : ${template.iban}`, { x: left, y, size: 9, font, color: dark });
    y -= 11;
    if (template.bic) {
      page.drawText(`BIC : ${template.bic}`, { x: left, y, size: 9, font, color: dark });
      y -= 11;
    }
  }

  // Footer
  const footerY = 50;
  page.drawLine({ start: { x: left, y: footerY + 16 }, end: { x: right, y: footerY + 16 }, color: muted, thickness: 0.5 });
  if (template?.legal_mentions) {
    const txt = stripHtml(template.legal_mentions).slice(0, 200);
    page.drawText(txt, { x: left, y: footerY, size: 7, font, color: muted });
  } else if (template?.footer_html) {
    page.drawText(stripHtml(template.footer_html).slice(0, 200), { x: left, y: footerY, size: 7, font, color: muted });
  } else {
    page.drawText(`${org.name} — ${org.country}`, { x: left, y: footerY, size: 7, font, color: muted });
  }
  if (template?.vat_number) {
    page.drawText(`TVA : ${template.vat_number}`, { x: right - 120, y: footerY, size: 7, font, color: muted });
  }

  return pdfDoc.save();
}

function wrapText(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/[\u00a0\u202f\u2009\u200a\u2007\u2060]/g, " ").replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\r/g, "").split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const w = font.widthOfTextAtSize(test, size);
    if (w > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
    if (word.includes("\n")) {
      const parts = current.split("\n");
      lines.push(...parts.slice(0, -1));
      current = parts[parts.length - 1];
    }
  }
  if (current) lines.push(current);
  return lines;
}

export const generateDocumentPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      documentId: z.string().uuid(),
      templateId: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Document introuvable");

    const { data: org } = await supabase
      .from("organizations")
      .select("name, country, logo_storage_path")
      .eq("id", doc.organization_id)
      .maybeSingle();

    let template = null;
    if (data.templateId) {
      const { data: t } = await supabase
        .from("document_templates")
        .select("*")
        .eq("id", data.templateId)
        .maybeSingle();
      template = t;
    } else {
      const { data: t } = await supabase
        .from("document_templates")
        .select("*")
        .eq("organization_id", doc.organization_id)
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      template = t?.[0] ?? null;
    }

    // Best-effort: download the organization logo so it can be embedded.
    let logoBytes: Uint8Array | null = null;
    let logoMime: string | null = null;
    const logoPath = (org as { logo_storage_path?: string | null } | null)?.logo_storage_path ?? null;
    if (logoPath && !logoPath.endsWith(".svg")) {
      const { data: blob } = await supabase.storage.from("org-logos").download(logoPath);
      if (blob) {
        logoBytes = new Uint8Array(await blob.arrayBuffer());
        logoMime = blob.type || (logoPath.endsWith(".png") ? "image/png" : "image/jpeg");
      }
    }

    const bytes = await buildDocumentPdf(
      doc,
      org ?? { name: "—", country: "FR" },
      template,
      { logoBytes, logoMime },
    );

    // Upload as new version
    const ts = Date.now();
    const storagePath = `${doc.organization_id}/${doc.id}/${ts}-${doc.type}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(upErr.message);

    // Mark previous as non-current
    await supabase
      .from("document_files")
      .update({ is_current: false })
      .eq("document_id", doc.id);

    const { data: prev } = await supabase
      .from("document_files")
      .select("version")
      .eq("document_id", doc.id)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (prev?.[0]?.version ?? 0) + 1;

    const { data: file, error: fileErr } = await supabase
      .from("document_files")
      .insert({
        document_id: doc.id,
        version: nextVersion,
        storage_path: storagePath,
        file_name: `${doc.type}-${doc.reference ?? doc.id.slice(0, 8)}.pdf`,
        mime_type: "application/pdf",
        size_bytes: bytes.byteLength,
        uploaded_by: userId,
        is_current: true,
      })
      .select()
      .single();
    if (fileErr) throw new Error(fileErr.message);

    await supabase.from("audit_logs").insert({
      organization_id: doc.organization_id,
      user_id: userId,
      action: "document.pdf_generated",
      resource: `document:${doc.id}`,
      metadata: { file_id: file.id, version: nextVersion },
    });

    return { file };
  });
