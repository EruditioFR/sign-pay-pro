import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) return null;
    const { data: org, error } = await supabase
      .from("organizations")
      .select("id, name, country")
      .eq("id", profile.organization_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return org;
  });

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("Organisation introuvable.");
    const { error } = await supabase
      .from("organizations")
      .update({ name: data.name } as never)
      .eq("id", profile.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
