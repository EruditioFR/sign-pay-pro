import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const placementSchema = z
  .object({
    page_index: z.number().int().min(0).max(10000),
    x: z.number().min(0).max(100000),
    y: z.number().min(0).max(100000),
    width: z.number().min(10).max(2000),
  })
  .nullable();

export const getSignatureDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ document_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("signature_drafts")
      .select("*")
      .eq("document_id", data.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { draft: null as null };
    return {
      draft: {
        placement: row.has_placement
          ? {
              page_index: row.page_index,
              x: Number(row.x),
              y: Number(row.y),
              width: Number(row.width),
            }
          : null,
        locked: row.locked,
        sig_width_pt: Number(row.sig_width_pt),
        page_index: row.page_index,
        updated_at: row.updated_at,
      },
    };
  });

export const saveSignatureDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        document_id: z.string().uuid(),
        placement: placementSchema,
        locked: z.boolean(),
        sig_width_pt: z.number().min(10).max(2000),
        page_index: z.number().int().min(0).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      document_id: data.document_id,
      user_id: userId,
      page_index: data.placement?.page_index ?? data.page_index,
      x: data.placement?.x ?? 0,
      y: data.placement?.y ?? 0,
      width: data.placement?.width ?? data.sig_width_pt,
      locked: data.placement ? data.locked : false,
      sig_width_pt: data.sig_width_pt,
      has_placement: !!data.placement,
    };
    const { error } = await supabase
      .from("signature_drafts")
      .upsert(row, { onConflict: "document_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearSignatureDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ document_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("signature_drafts")
      .delete()
      .eq("document_id", data.document_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
