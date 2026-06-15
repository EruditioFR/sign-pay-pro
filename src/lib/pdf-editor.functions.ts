import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type PdfFieldKind = "text" | "date" | "checkbox" | "signature" | "initials";

const FieldKindEnum = z.enum(["text", "date", "checkbox", "signature", "initials"]);

const FieldSchema = z.object({
  id: z.string().uuid().optional(),
  page_index: z.number().int().min(0).max(2000),
  kind: FieldKindEnum,
  x: z.number().min(0).max(20000),
  y: z.number().min(0).max(20000),
  width: z.number().min(5).max(5000),
  height: z.number().min(5).max(5000),
  value: z.string().max(200000).nullable().optional(),
  font_size: z.number().int().min(6).max(72).default(11),
  required: z.boolean().default(false),
  label: z.string().max(200).nullable().optional(),
  position: z.number().int().min(0).max(10000).default(0),
});

export const listPdfFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: fields, error } = await supabase
      .from("document_pdf_fields")
      .select("*")
      .eq("document_id", data.documentId)
      .order("page_index", { ascending: true })
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return { fields: fields ?? [] };
  });

export const savePdfFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        fields: z.array(FieldSchema).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // verify doc access
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Document introuvable");

    // atomic replace
    const { error: delErr } = await supabase
      .from("document_pdf_fields")
      .delete()
      .eq("document_id", data.documentId);
    if (delErr) throw new Error(delErr.message);

    if (data.fields.length > 0) {
      const rows = data.fields.map((f, i) => ({
        document_id: data.documentId,
        page_index: f.page_index,
        kind: f.kind,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        value: f.value ?? null,
        font_size: f.font_size,
        required: f.required,
        label: f.label ?? null,
        position: f.position ?? i,
      }));
      const { error: insErr } = await supabase
        .from("document_pdf_fields")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
    return { ok: true, count: data.fields.length };
  });

export const flattenPdfWithFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select(
        "id, organization_id, type, reference, title, document_number, invoice_number, third_party_name, third_party_email, amount_ht, amount_ttc, currency, issue_date, due_date",
      )
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Document introuvable");

    const fmtDate = (v: string | null | undefined) => {
      if (!v) return "";
      const d = new Date(v);
      if (isNaN(d.getTime())) return String(v);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}/${d.getFullYear()}`;
    };
    const currency = (doc.currency as string) || "EUR";
    const fmtMoney = (n: number | null | undefined) => {
      if (n === null || n === undefined) return "";
      try {
        return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(Number(n));
      } catch {
        return `${n} ${currency}`;
      }
    };
    const now = new Date();
    const variables: Record<string, string> = {
      title: (doc.title as string) ?? "",
      reference: (doc.reference as string) ?? "",
      document_number: (doc.document_number as string) ?? "",
      invoice_number: (doc.invoice_number as string) ?? "",
      third_party_name: (doc.third_party_name as string) ?? "",
      third_party_email: (doc.third_party_email as string) ?? "",
      amount_ht: fmtMoney(doc.amount_ht as number | null),
      amount_ttc: fmtMoney(doc.amount_ttc as number | null),
      currency,
      issue_date: fmtDate(doc.issue_date as string | null),
      due_date: fmtDate(doc.due_date as string | null),
      today: fmtDate(now.toISOString()),
      now: now.toLocaleString("fr-FR"),
    };
    const resolveVars = (s: string) =>
      s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => variables[k] ?? "");

    const { data: current } = await supabase
      .from("document_files")
      .select("storage_path")
      .eq("document_id", data.documentId)
      .eq("is_current", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!current?.storage_path) throw new Error("Aucun PDF source");

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("documents")
      .download(current.storage_path);
    if (dlErr || !fileBlob) throw new Error("Téléchargement PDF impossible");

    const { data: fields } = await supabase
      .from("document_pdf_fields")
      .select("*")
      .eq("document_id", data.documentId)
      .order("position", { ascending: true });

    const sourceBytes = new Uint8Array(await fileBlob.arrayBuffer());
    const pdfDoc = await PDFDocument.load(sourceBytes);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    const sanitize = (s: string) =>
      s
        .replace(/[\u00a0\u202f\u2009\u200a\u2007\u2060]/g, " ")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"');

    for (const f of fields ?? []) {
      const page = pages[f.page_index];
      if (!page) continue;
      const x = Number(f.x);
      const y = Number(f.y);
      const w = Number(f.width);
      const h = Number(f.height);
      const rawValue = (f.value ?? "").toString();
      const value = f.kind === "text" || f.kind === "date" ? resolveVars(rawValue) : rawValue;

      if (f.kind === "text" || f.kind === "date") {
        if (!value.trim()) continue;
        page.drawText(sanitize(value), {
          x,
          y: y + Math.max(2, h - f.font_size - 2),
          size: f.font_size,
          font: helvetica,
          color: rgb(0.05, 0.05, 0.1),
          maxWidth: w,
        });
      } else if (f.kind === "checkbox") {
        page.drawRectangle({
          x,
          y,
          width: h,
          height: h,
          borderColor: rgb(0.1, 0.1, 0.15),
          borderWidth: 1,
        });
        if (value === "true" || value === "1" || value === "on") {
          page.drawLine({
            start: { x: x + 2, y: y + 2 },
            end: { x: x + h - 2, y: y + h - 2 },
            color: rgb(0.05, 0.05, 0.1),
            thickness: 1.5,
          });
          page.drawLine({
            start: { x: x + 2, y: y + h - 2 },
            end: { x: x + h - 2, y: y + 2 },
            color: rgb(0.05, 0.05, 0.1),
            thickness: 1.5,
          });
        }
      } else if (f.kind === "signature" || f.kind === "initials") {
        if (!value.startsWith("data:image/")) continue;
        try {
          const b64 = value.split(",")[1];
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const img = value.includes("image/jpeg")
            ? await pdfDoc.embedJpg(bin)
            : await pdfDoc.embedPng(bin);
          page.drawImage(img, { x, y, width: w, height: h });
        } catch {
          // skip on decode error
        }
      }
    }

    const outBytes = await pdfDoc.save();

    const ts = Date.now();
    const storagePath = `${doc.organization_id}/${doc.id}/${ts}-edited.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, outBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);

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
        file_name: `${doc.type}-${doc.reference ?? doc.id.slice(0, 8)}-v${nextVersion}.pdf`,
        mime_type: "application/pdf",
        size_bytes: outBytes.byteLength,
        uploaded_by: userId,
        is_current: true,
      })
      .select()
      .single();
    if (fileErr) throw new Error(fileErr.message);

    await supabase.from("audit_logs").insert({
      organization_id: doc.organization_id,
      user_id: userId,
      action: "document.pdf_flattened",
      resource: `document:${doc.id}`,
      metadata: { file_id: file.id, version: nextVersion, fields: (fields ?? []).length },
    });

    return { file };
  });
