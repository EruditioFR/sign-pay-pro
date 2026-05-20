import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyProviderSignature = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("signature_image_b64")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { signature_image_b64: data?.signature_image_b64 ?? null };
  });

const SaveSchema = z.object({
  signature_image_b64: z.string().min(50).max(2_000_000).nullable(),
});

export const saveMyProviderSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ signature_image_b64: data.signature_image_b64 })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
