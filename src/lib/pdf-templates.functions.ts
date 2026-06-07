import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import type { Database } from "@/integrations/supabase/types";

type DocumentType = Database["public"]["Enums"]["document_type"];

const DOC_TYPES = [
  "purchase_order",
  "quote",
  "invoice",
  "contract",
  "other",
] as const satisfies readonly DocumentType[];

const SaveAsTemplateSchema = z.object({
  documentId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  document_type: z.enum(DOC_TYPES).optional(),
});

export const saveDocumentAsPdfTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveAsTemplateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, organization_id, type")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Document introuvable");

    const { data: current } = await supabase
      .from("document_files")
      .select("storage_path, file_name, size_bytes")
      .eq("document_id", data.documentId)
      .eq("is_current", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!current?.storage_path) throw new Error("Aucun PDF source");

    const { data: blob, error: dlErr } = await supabase.storage
      .from("documents")
      .download(current.storage_path);
    if (dlErr || !blob) throw new Error("Téléchargement PDF impossible");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    let pageCount = 1;
    try {
      const pdf = await PDFDocument.load(bytes);
      pageCount = pdf.getPageCount();
    } catch {
      // keep default
    }

    const ts = Date.now();
    const storagePath = `${doc.organization_id}/templates/${ts}-${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) throw new Error(upErr.message);

    const { data: tpl, error: tplErr } = await supabase
      .from("pdf_templates")
      .insert({
        organization_id: doc.organization_id,
        name: data.name,
        description: data.description ?? null,
        document_type: (data.document_type ?? doc.type) as DocumentType,
        storage_path: storagePath,
        file_name: current.file_name,
        page_count: pageCount,
        size_bytes: current.size_bytes ?? bytes.byteLength,
        created_by: userId,
      })
      .select()
      .single();
    if (tplErr) throw new Error(tplErr.message);

    // copy fields from document_pdf_fields → pdf_template_fields
    const { data: fields } = await supabase
      .from("document_pdf_fields")
      .select("*")
      .eq("document_id", data.documentId)
      .order("position", { ascending: true });

    if (fields && fields.length > 0) {
      const rows = fields.map((f, i) => ({
        template_id: tpl.id,
        page_index: f.page_index,
        kind: f.kind,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        default_value: f.value,
        font_size: f.font_size,
        required: f.required,
        label: f.label,
        position: i,
      }));
      const { error: fErr } = await supabase
        .from("pdf_template_fields")
        .insert(rows);
      if (fErr) throw new Error(fErr.message);
    }

    await supabase.from("audit_logs").insert({
      organization_id: doc.organization_id,
      user_id: userId,
      action: "pdf_template.created",
      resource: `pdf_template:${tpl.id}`,
      metadata: { name: tpl.name, fields: fields?.length ?? 0, source_document: doc.id },
    });

    return { template: tpl };
  });

export const listPdfTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("pdf_templates")
      .select("id, name, description, document_type, page_count, created_at, created_by")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // attach field counts
    const ids = (data ?? []).map((t) => t.id);
    let counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: fs } = await supabase
        .from("pdf_template_fields")
        .select("template_id")
        .in("template_id", ids);
      counts = (fs ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.template_id] = (acc[row.template_id] ?? 0) + 1;
        return acc;
      }, {});
    }
    return {
      templates: (data ?? []).map((t) => ({ ...t, field_count: counts[t.id] ?? 0 })),
    };
  });

export const deletePdfTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tpl } = await supabase
      .from("pdf_templates")
      .select("storage_path, organization_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase.from("pdf_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (tpl?.storage_path) {
      await supabase.storage.from("documents").remove([tpl.storage_path]);
    }
    return { ok: true };
  });

const CreateFromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  title: z.string().min(1).max(200),
  reference: z.string().max(100).optional().nullable(),
  third_party_name: z.string().max(200).optional().nullable(),
  third_party_email: z.string().email().max(200).optional().nullable().or(z.literal("")),
  amount_ht: z.number().nullable().optional(),
  amount_ttc: z.number().nullable().optional(),
  due_date: z.string().optional().nullable(),
});

export const createDocumentFromPdfTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateFromTemplateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const { data: tpl, error: tplErr } = await supabase
      .from("pdf_templates")
      .select("*")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tplErr || !tpl) throw new Error("Modèle introuvable");
    if (tpl.organization_id !== me.organization_id) throw new Error("Accès refusé");

    // 1. Create document
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        organization_id: me.organization_id,
        created_by: userId,
        type: tpl.document_type,
        title: data.title,
        reference: data.reference ?? null,
        third_party_name: data.third_party_name ?? null,
        third_party_email: data.third_party_email || null,
        amount_ht: data.amount_ht ?? null,
        amount_ttc: data.amount_ttc ?? null,
        due_date: data.due_date ?? null,
        currency: "EUR",
        tags: [],
        status: "draft",
      })
      .select()
      .single();
    if (docErr) throw new Error(docErr.message);

    // 2. Copy PDF in storage
    const { data: blob, error: dlErr } = await supabase.storage
      .from("documents")
      .download(tpl.storage_path);
    if (dlErr || !blob) throw new Error("Téléchargement modèle impossible");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ts = Date.now();
    const newPath = `${me.organization_id}/${doc.id}/${ts}-from-template.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(newPath, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { error: fErr } = await supabase.from("document_files").insert({
      document_id: doc.id,
      version: 1,
      storage_path: newPath,
      file_name: tpl.file_name,
      mime_type: "application/pdf",
      size_bytes: bytes.byteLength,
      uploaded_by: userId,
      is_current: true,
    });
    if (fErr) throw new Error(fErr.message);

    // 3. Copy template fields
    const { data: tplFields } = await supabase
      .from("pdf_template_fields")
      .select("*")
      .eq("template_id", tpl.id)
      .order("position", { ascending: true });
    if (tplFields && tplFields.length > 0) {
      const rows = tplFields.map((f, i) => ({
        document_id: doc.id,
        page_index: f.page_index,
        kind: f.kind,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        value: f.default_value,
        font_size: f.font_size,
        required: f.required,
        label: f.label,
        position: i,
      }));
      const { error: insErr } = await supabase
        .from("document_pdf_fields")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    await supabase.from("audit_logs").insert({
      organization_id: me.organization_id,
      user_id: userId,
      action: "document.created_from_template",
      resource: `document:${doc.id}`,
      metadata: { template_id: tpl.id, template_name: tpl.name },
    });

    return { document: doc };
  });
