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
