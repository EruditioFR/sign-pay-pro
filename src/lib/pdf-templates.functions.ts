import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Database } from "@/integrations/supabase/types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Convert a .docx buffer to a basic PDF using mammoth (text extraction)
 * and pdf-lib (rendering). Layout is simplified — paragraphs only.
 */
async function docxBufferToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const mammoth = await import("mammoth");
  // mammoth expects a Node-style Buffer-like { arrayBuffer } object
  const { value: rawText } = await mammoth.extractRawText({
    arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const lineHeight = fontSize * 1.4;
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 56; // ~2cm
  const maxWidth = pageWidth - margin * 2;

  // Sanitize text: strip chars unsupported by WinAnsi (Helvetica) — replace smart quotes etc.
  const normalize = (s: string) =>
    s
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/\u00A0/g, " ")
      // Drop anything outside basic Latin-1 the font can render safely
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

  const wrapLine = (line: string): string[] => {
    const words = line.split(/\s+/);
    const out: string[] = [];
    let current = "";
    for (const w of words) {
      const tentative = current ? current + " " + w : w;
      const width = font.widthOfTextAtSize(tentative, fontSize);
      if (width <= maxWidth) {
        current = tentative;
      } else {
        if (current) out.push(current);
        // Word longer than line: hard-break by character
        if (font.widthOfTextAtSize(w, fontSize) > maxWidth) {
          let chunk = "";
          for (const ch of w) {
            const next = chunk + ch;
            if (font.widthOfTextAtSize(next, fontSize) > maxWidth) {
              out.push(chunk);
              chunk = ch;
            } else {
              chunk = next;
            }
          }
          current = chunk;
        } else {
          current = w;
        }
      }
    }
    if (current) out.push(current);
    return out.length === 0 ? [""] : out;
  };

  const paragraphs = normalize(rawText).split(/\r?\n/);
  const lines: string[] = [];
  for (const p of paragraphs) {
    if (p.trim() === "") {
      lines.push("");
    } else {
      lines.push(...wrapLine(p));
    }
  }

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  for (const line of lines) {
    if (y < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    if (line) {
      page.drawText(line, { x: margin, y: y - fontSize, size: fontSize, font, color: rgb(0, 0, 0) });
    }
    y -= lineHeight;
  }

  if (pdf.getPageCount() === 0) pdf.addPage([pageWidth, pageHeight]);

  return await pdf.save();
}


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
  // If provided, append a new version to that template instead of creating one.
  templateId: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  document_type: z.enum(DOC_TYPES).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

const CreateFromUploadSchema = z.object({
  file: z.custom<File>((value) => value instanceof File, "Fichier manquant"),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  document_type: z.enum(DOC_TYPES).default("other"),
  theme: z.string().max(100).optional().nullable(),
});

async function uploadPdfCopy(
  supabase: any,
  organizationId: string,
  sourcePath: string,
): Promise<{ bytes: Uint8Array; storagePath: string; pageCount: number; size: number }> {
  const { data: blob, error: dlErr } = await supabase.storage
    .from("documents")
    .download(sourcePath);
  if (dlErr || !blob) throw new Error("Téléchargement PDF impossible");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  let pageCount = 1;
  try {
    const pdf = await PDFDocument.load(bytes);
    pageCount = pdf.getPageCount();
  } catch {
    // keep default
  }

  const storagePath = `${organizationId}/templates/${Date.now()}-${crypto.randomUUID()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error(upErr.message);

  return { bytes, storagePath, pageCount, size: bytes.byteLength };
}

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

    // Resolve or create the template shell.
    let templateId = data.templateId ?? null;
    let nextVersion = 1;

    if (templateId) {
      const { data: existing } = await supabase
        .from("pdf_templates")
        .select("id, organization_id")
        .eq("id", templateId)
        .maybeSingle();
      if (!existing || existing.organization_id !== doc.organization_id)
        throw new Error("Modèle introuvable");

      const { data: lastV } = await supabase
        .from("pdf_template_versions")
        .select("version")
        .eq("template_id", templateId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextVersion = (lastV?.version ?? 0) + 1;
    } else {
      if (!data.name) throw new Error("Nom du modèle requis");
      // create empty template; storage_path/file_name set after first version upload
      const { data: created, error: tplErr } = await supabase
        .from("pdf_templates")
        .insert({
          organization_id: doc.organization_id,
          name: data.name,
          description: data.description ?? null,
          document_type: (data.document_type ?? doc.type) as DocumentType,
          storage_path: "pending",
          file_name: current.file_name,
          page_count: 1,
          size_bytes: current.size_bytes ?? 0,
          created_by: userId,
        })
        .select()
        .single();
      if (tplErr) throw new Error(tplErr.message);
      templateId = created.id;
    }

    // Copy current PDF into a new template version blob
    const { storagePath, pageCount, size } = await uploadPdfCopy(
      supabase,
      doc.organization_id,
      current.storage_path,
    );

    // Mark previous current as not current
    await supabase
      .from("pdf_template_versions")
      .update({ is_current: false })
      .eq("template_id", templateId);

    const { data: version, error: vErr } = await supabase
      .from("pdf_template_versions")
      .insert({
        template_id: templateId,
        version: nextVersion,
        storage_path: storagePath,
        file_name: current.file_name,
        page_count: pageCount,
        size_bytes: size,
        notes: data.notes ?? null,
        is_current: true,
        created_by: userId,
      })
      .select()
      .single();
    if (vErr) throw new Error(vErr.message);

    // Copy fields snapshot
    const { data: fields } = await supabase
      .from("document_pdf_fields")
      .select("*")
      .eq("document_id", data.documentId)
      .order("position", { ascending: true });

    if (fields && fields.length > 0) {
      const rows = fields.map((f, i) => ({
        template_id: templateId!,
        version_id: version.id,
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
      const { error: fErr } = await supabase.from("pdf_template_fields").insert(rows);
      if (fErr) throw new Error(fErr.message);
    }

    // Point template at the new current version + refresh top-level metadata
    await supabase
      .from("pdf_templates")
      .update({
        current_version_id: version.id,
        storage_path: storagePath,
        file_name: current.file_name,
        page_count: pageCount,
        size_bytes: size,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId);

    await supabase.from("audit_logs").insert({
      organization_id: doc.organization_id,
      user_id: userId,
      action: data.templateId ? "pdf_template.version_added" : "pdf_template.created",
      resource: `pdf_template:${templateId}`,
      metadata: {
        version: nextVersion,
        version_id: version.id,
        fields: fields?.length ?? 0,
        source_document: doc.id,
      },
    });

    return { templateId, version };
  });

export const createPdfTemplateFromUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("FormData attendu");
    const file = input.get("file");
    const parsed = CreateFromUploadSchema.parse({
      file,
      name: input.get("name"),
      description: input.get("description") || null,
      document_type: input.get("document_type") || "other",
      theme: input.get("theme") || null,
    });
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const isPdf = data.file.type === "application/pdf" || /\.pdf$/i.test(data.file.name);
    const isDocx =
      data.file.type === DOCX_MIME || /\.docx$/i.test(data.file.name);
    if (!isPdf && !isDocx) {
      throw new Error(
        "Format non supporté. Importez un PDF ou un document Word (.docx). Pour .doc ou .pages, convertissez-le d'abord en PDF.",
      );
    }
    if (data.file.size > 25 * 1024 * 1024) throw new Error("Fichier trop volumineux (25 Mo max)");

    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const sourceBytes = new Uint8Array(await data.file.arrayBuffer());
    let bytes: Uint8Array;
    let storedFileName = data.file.name;
    if (isPdf) {
      bytes = sourceBytes;
    } else {
      try {
        bytes = await docxBufferToPdf(sourceBytes);
      } catch (err) {
        throw new Error(
          "Conversion .docx échouée : " + (err instanceof Error ? err.message : "erreur inconnue"),
        );
      }
      storedFileName = data.file.name.replace(/\.docx$/i, "") + ".pdf";
    }

    let pageCount = 1;
    try {
      const pdf = await PDFDocument.load(bytes);
      pageCount = pdf.getPageCount();
    } catch {
      throw new Error("PDF illisible");
    }


    const storagePath = `${me.organization_id}/templates/${Date.now()}-${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const themeTrim = (data.theme ?? "").trim();
    const { data: template, error: tplErr } = await supabase
      .from("pdf_templates")
      .insert({
        organization_id: me.organization_id,
        name: data.name,
        description: data.description ?? null,
        document_type: data.document_type as DocumentType,
        theme: themeTrim ? themeTrim : null,
        storage_path: storagePath,
        file_name: data.file.name,
        page_count: pageCount,
        size_bytes: bytes.byteLength,
        created_by: userId,
      })
      .select()
      .single();
    if (tplErr) throw new Error(tplErr.message);


    const { data: version, error: vErr } = await supabase
      .from("pdf_template_versions")
      .insert({
        template_id: template.id,
        version: 1,
        storage_path: storagePath,
        file_name: data.file.name,
        page_count: pageCount,
        size_bytes: bytes.byteLength,
        is_current: true,
        created_by: userId,
      })
      .select()
      .single();
    if (vErr) throw new Error(vErr.message);

    await supabase
      .from("pdf_templates")
      .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
      .eq("id", template.id);

    await supabase.from("audit_logs").insert({
      organization_id: me.organization_id,
      user_id: userId,
      action: "pdf_template.uploaded",
      resource: `pdf_template:${template.id}`,
      metadata: { version_id: version.id, file_name: data.file.name, pages: pageCount },
    });

    return { template: { ...template, current_version_id: version.id }, version };
  });

export const listPdfTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("pdf_templates")
      .select(
        "id, name, description, document_type, theme, page_count, created_at, created_by, current_version_id",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (data ?? []).map((t) => t.id);
    let versionCounts: Record<string, number> = {};
    let fieldCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: vs } = await supabase
        .from("pdf_template_versions")
        .select("template_id")
        .in("template_id", ids);
      versionCounts = (vs ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.template_id] = (acc[row.template_id] ?? 0) + 1;
        return acc;
      }, {});

      const currentVersionIds = (data ?? [])
        .map((t) => t.current_version_id)
        .filter((v): v is string => Boolean(v));
      if (currentVersionIds.length > 0) {
        const { data: fs } = await supabase
          .from("pdf_template_fields")
          .select("template_id, version_id")
          .in("version_id", currentVersionIds);
        fieldCounts = (fs ?? []).reduce<Record<string, number>>((acc, row) => {
          acc[row.template_id] = (acc[row.template_id] ?? 0) + 1;
          return acc;
        }, {});
      }
    }
    return {
      templates: (data ?? []).map((t) => ({
        ...t,
        version_count: versionCounts[t.id] ?? 0,
        field_count: fieldCounts[t.id] ?? 0,
      })),
    };
  });

export const listPdfTemplateVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ templateId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: versions, error } = await supabase
      .from("pdf_template_versions")
      .select("id, version, file_name, page_count, size_bytes, notes, is_current, created_by, created_at")
      .eq("template_id", data.templateId)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);

    const vIds = (versions ?? []).map((v) => v.id);
    let counts: Record<string, number> = {};
    if (vIds.length > 0) {
      const { data: fs } = await supabase
        .from("pdf_template_fields")
        .select("version_id")
        .in("version_id", vIds);
      counts = (fs ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.version_id] = (acc[row.version_id] ?? 0) + 1;
        return acc;
      }, {});
    }
    return {
      versions: (versions ?? []).map((v) => ({
        ...v,
        field_count: counts[v.id] ?? 0,
      })),
    };
  });

export const restorePdfTemplateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ versionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: version, error } = await supabase
      .from("pdf_template_versions")
      .select("id, template_id, version, storage_path, file_name, page_count, size_bytes")
      .eq("id", data.versionId)
      .maybeSingle();
    if (error || !version) throw new Error("Version introuvable");

    const { data: tpl } = await supabase
      .from("pdf_templates")
      .select("id, organization_id")
      .eq("id", version.template_id)
      .maybeSingle();
    if (!tpl) throw new Error("Modèle introuvable");

    await supabase
      .from("pdf_template_versions")
      .update({ is_current: false })
      .eq("template_id", version.template_id);

    const { error: upErr } = await supabase
      .from("pdf_template_versions")
      .update({ is_current: true })
      .eq("id", version.id);
    if (upErr) throw new Error(upErr.message);

    await supabase
      .from("pdf_templates")
      .update({
        current_version_id: version.id,
        storage_path: version.storage_path,
        file_name: version.file_name,
        page_count: version.page_count,
        size_bytes: version.size_bytes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tpl.id);

    await supabase.from("audit_logs").insert({
      organization_id: tpl.organization_id,
      user_id: userId,
      action: "pdf_template.version_restored",
      resource: `pdf_template:${tpl.id}`,
      metadata: { version: version.version, version_id: version.id },
    });

    return { ok: true };
  });

export const deletePdfTemplateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ versionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: version } = await supabase
      .from("pdf_template_versions")
      .select("id, template_id, version, is_current, storage_path")
      .eq("id", data.versionId)
      .maybeSingle();
    if (!version) throw new Error("Version introuvable");
    if (version.is_current)
      throw new Error("Impossible de supprimer la version active. Restaurez d'abord une autre version.");

    const { error } = await supabase
      .from("pdf_template_versions")
      .delete()
      .eq("id", version.id);
    if (error) throw new Error(error.message);
    if (version.storage_path) {
      await supabase.storage.from("documents").remove([version.storage_path]);
    }

    const { data: tpl } = await supabase
      .from("pdf_templates")
      .select("organization_id")
      .eq("id", version.template_id)
      .maybeSingle();
    if (tpl) {
      await supabase.from("audit_logs").insert({
        organization_id: tpl.organization_id,
        user_id: userId,
        action: "pdf_template.version_deleted",
        resource: `pdf_template:${version.template_id}`,
        metadata: { version: version.version, version_id: version.id },
      });
    }
    return { ok: true };
  });

export const deletePdfTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: versions } = await supabase
      .from("pdf_template_versions")
      .select("storage_path")
      .eq("template_id", data.id);
    const { error } = await supabase.from("pdf_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    const paths = (versions ?? []).map((v) => v.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from("documents").remove(paths);
    }
    return { ok: true };
  });

const CreateFromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  // Optional pinned version. Defaults to current.
  versionId: z.string().uuid().optional(),
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

    // Resolve version
    const versionId = data.versionId ?? tpl.current_version_id;
    if (!versionId) throw new Error("Aucune version disponible pour ce modèle");
    const { data: version, error: vErr } = await supabase
      .from("pdf_template_versions")
      .select("*")
      .eq("id", versionId)
      .maybeSingle();
    if (vErr || !version || version.template_id !== tpl.id)
      throw new Error("Version introuvable");

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
      .download(version.storage_path);
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
      file_name: version.file_name,
      mime_type: "application/pdf",
      size_bytes: bytes.byteLength,
      uploaded_by: userId,
      is_current: true,
    });
    if (fErr) throw new Error(fErr.message);

    // 3. Copy version fields
    const { data: tplFields } = await supabase
      .from("pdf_template_fields")
      .select("*")
      .eq("version_id", version.id)
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
      metadata: {
        template_id: tpl.id,
        template_name: tpl.name,
        version: version.version,
        version_id: version.id,
      },
    });

    return { document: doc };
  });
