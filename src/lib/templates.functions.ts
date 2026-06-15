import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DocumentTypeEnum = z.enum(["purchase_order", "quote", "invoice", "contract", "other"]);

const BusinessVerticalEnum = z.enum([
  "real_estate",
  "car_rental",
  "services",
  "goods_sales",
]);

const TemplateSchema = z.object({
  name: z.string().min(1).max(120),
  document_type: DocumentTypeEnum.optional().nullable(),
  business_vertical: BusinessVerticalEnum.optional().nullable(),
  logo_url: z.string().url().optional().nullable().or(z.literal("")),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  header_html: z.string().max(5000).optional().nullable(),
  footer_html: z.string().max(5000).optional().nullable(),
  legal_mentions: z.string().max(5000).optional().nullable(),
  payment_terms: z.string().max(2000).optional().nullable(),
  iban: z.string().max(50).optional().nullable(),
  bic: z.string().max(20).optional().nullable(),
  vat_number: z.string().max(40).optional().nullable(),
  active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

export const listDocumentTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("document_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

const IdSchema = z.object({ id: z.string().uuid() });

export const getDocumentTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tpl, error } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tpl) throw new Error("Modèle introuvable");
    return { template: tpl };
  });

export const createDocumentTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TemplateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const { data: tpl, error } = await supabase
      .from("document_templates")
      .insert({
        ...data,
        logo_url: data.logo_url || null,
        organization_id: me.organization_id,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { template: tpl };
  });

const UpdateSchema = TemplateSchema.partial().extend({ id: z.string().uuid() });

export const updateDocumentTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { error } = await supabase.from("document_templates").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDocumentTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("document_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =============================================================================
// Visual canvas editor — save / load / instantiate
// =============================================================================

import { CanvasSchema, type Canvas } from "@/lib/template-canvas/schema";
import { renderCanvasToHtml } from "@/lib/template-canvas/render";

const SaveCanvasSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  page_format: z.enum(["A4", "A5", "LETTER"]).default("A4"),
  page_orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  canvas: CanvasSchema,
});

export const saveTemplateCanvas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveCanvasSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const payload = {
      organization_id: me.organization_id,
      name: data.name,
      page_format: data.page_format,
      page_orientation: data.page_orientation,
      canvas_schema: data.canvas as unknown as Record<string, unknown>,
    };

    if (data.id) {
      const { data: tpl, error } = await supabase
        .from("document_templates")
        .update({
          name: data.name,
          page_format: data.page_format,
          page_orientation: data.page_orientation,
          canvas_schema: data.canvas as unknown as Record<string, unknown>,
        })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { template: tpl };
    }
    const { data: tpl, error } = await supabase
      .from("document_templates")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { template: tpl };
  });

const InstantiateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
});

/**
 * Create a real document (draft) from a visual template.
 * - Reads the template canvas
 * - Resolves dynamic variables (issuer / system; client / document left empty by default)
 * - Renders an HTML snapshot saved to wysiwyg_drafts
 * - Returns the new document id + draft id
 */
export const instantiateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InstantiateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const { data: tpl, error: tplErr } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("Modèle introuvable");

    const parsed = CanvasSchema.safeParse(tpl.canvas_schema);
    if (!parsed.success) throw new Error("Le modèle ne contient pas de canevas valide");
    const canvas: Canvas = parsed.data;

    const { data: org } = await supabase
      .from("organizations")
      .select("name, siret, vat_number, address_line1, iban, bic")
      .eq("id", me.organization_id)
      .maybeSingle();

    const now = new Date();
    const values: Record<string, string> = {
      "issuer.company": org?.name ?? "",
      "issuer.address": org?.address_line1 ?? "",
      "issuer.siret": org?.siret ?? "",
      "issuer.vat_number": org?.vat_number ?? "",
      "issuer.iban": org?.iban ?? "",
      "issuer.bic": org?.bic ?? "",
      "issuer.email": org?.email ?? "",
      "issuer.phone": org?.phone ?? "",
      "system.today": now.toISOString().slice(0, 10),
      "system.now": now.toISOString(),
      ...(data.values ?? {} as Record<string, string>),
    };

    const html = renderCanvasToHtml(canvas, values);
    const title = data.title?.trim() || tpl.name || "Document";

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        organization_id: me.organization_id,
        created_by: userId,
        title,
        type: (tpl.document_type as string | null) ?? "other",
        status: "draft",
      })
      .select("id")
      .single();
    if (docErr) throw new Error(docErr.message);

    const { data: draft, error: draftErr } = await supabase
      .from("wysiwyg_drafts")
      .insert({
        organization_id: me.organization_id,
        created_by: userId,
        title,
        html,
        document_id: doc.id,
      })
      .select("id")
      .single();
    if (draftErr) throw new Error(draftErr.message);

    return { documentId: doc.id, draftId: draft.id };
  });
