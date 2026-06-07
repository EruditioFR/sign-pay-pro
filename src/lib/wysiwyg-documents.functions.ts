import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const FieldKindEnum = z.enum(["text", "date", "checkbox", "signature", "initials"]);

function sanitizeHtml(html: string): string {
  // strip <script> and inline event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"(?:[^"\\]|\\.)*"/gi, "")
    .replace(/\son\w+\s*=\s*'(?:[^'\\]|\\.)*'/gi, "")
    .replace(/javascript:/gi, "");
}

const SaveDraftSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  html: z.string().max(500_000),
  document_id: z.string().uuid().optional().nullable(),
});

export const saveWysiwygDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveDraftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const html = sanitizeHtml(data.html);

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("wysiwyg_drafts")
        .update({ title: data.title, html, document_id: data.document_id ?? null })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { draft: updated };
    }

    const { data: created, error } = await supabase
      .from("wysiwyg_drafts")
      .insert({
        organization_id: me.organization_id,
        created_by: userId,
        title: data.title,
        html,
        document_id: data.document_id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { draft: created };
  });

export const listWysiwygDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("wysiwyg_drafts")
      .select("id, title, document_id, updated_at, created_at, created_by")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { drafts: data ?? [] };
  });

export const getWysiwygDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: draft, error } = await supabase
      .from("wysiwyg_drafts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !draft) throw new Error("Brouillon introuvable");
    return { draft };
  });

export const deleteWysiwygDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("wysiwyg_drafts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const FinalizeSchema = z.object({
  draftId: z.string().uuid(),
  title: z.string().min(1).max(200),
  document_type: z.enum(["purchase_order", "quote", "invoice", "contract", "other"]).default("other"),
  pdfBase64: z.string().min(10).max(40_000_000), // ~30MB
  fields: z
    .array(
      z.object({
        page_index: z.number().int().min(0).max(2000),
        kind: FieldKindEnum,
        x: z.number().min(0).max(20000),
        y: z.number().min(0).max(20000),
        width: z.number().min(5).max(5000),
        height: z.number().min(5).max(5000),
        label: z.string().max(200).nullable().optional(),
      }),
    )
    .max(500),
});

export const finalizeWysiwygDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FinalizeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const { data: draft } = await supabase
      .from("wysiwyg_drafts")
      .select("id, document_id, organization_id")
      .eq("id", data.draftId)
      .maybeSingle();
    if (!draft) throw new Error("Brouillon introuvable");
    if (draft.organization_id !== me.organization_id) throw new Error("Accès refusé");

    // Decode PDF
    const b64 = data.pdfBase64.includes(",")
      ? data.pdfBase64.split(",")[1]
      : data.pdfBase64;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // Create or reuse document
    let documentId = draft.document_id;
    if (!documentId) {
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          organization_id: me.organization_id,
          created_by: userId,
          type: data.document_type,
          title: data.title,
          status: "draft",
          currency: "EUR",
          tags: [],
        })
        .select()
        .single();
      if (docErr) throw new Error(docErr.message);
      documentId = doc.id;
      await supabase.from("wysiwyg_drafts").update({ document_id: documentId }).eq("id", draft.id);
    }

    // Upload PDF
    const ts = Date.now();
    const storagePath = `${me.organization_id}/${documentId}/${ts}-wysiwyg.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(upErr.message);

    // Mark previous as non-current
    await supabase
      .from("document_files")
      .update({ is_current: false })
      .eq("document_id", documentId);

    const { data: prev } = await supabase
      .from("document_files")
      .select("version")
      .eq("document_id", documentId)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (prev?.[0]?.version ?? 0) + 1;

    const { error: fileErr } = await supabase.from("document_files").insert({
      document_id: documentId,
      version: nextVersion,
      storage_path: storagePath,
      file_name: `${data.title.slice(0, 50)}-v${nextVersion}.pdf`,
      mime_type: "application/pdf",
      size_bytes: bytes.byteLength,
      uploaded_by: userId,
      is_current: true,
    });
    if (fileErr) throw new Error(fileErr.message);

    // Insert pre-positioned fields
    if (data.fields.length > 0) {
      const rows = data.fields.map((f, i) => ({
        document_id: documentId!,
        page_index: f.page_index,
        kind: f.kind,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        value: null,
        font_size: 11,
        required: false,
        label: f.label ?? null,
        position: i,
      }));
      // Replace existing
      await supabase.from("document_pdf_fields").delete().eq("document_id", documentId);
      const { error: insErr } = await supabase.from("document_pdf_fields").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    await supabase.from("audit_logs").insert({
      organization_id: me.organization_id,
      user_id: userId,
      action: "document.wysiwyg_created",
      resource: `document:${documentId}`,
      metadata: { draft_id: draft.id, fields: data.fields.length },
    });

    return { documentId };
  });
