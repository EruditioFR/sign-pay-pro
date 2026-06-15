import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LOGO_BUCKET = "org-logos";
const LOGO_SIGNED_TTL = 60 * 60 * 24 * 7; // 7 days (refreshed on each fetch)

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
      .select("id, name, country, logo_url, logo_storage_path")
      .eq("id", profile.organization_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) return null;

    // Refresh signed URL each time so the UI / PDF always has a working link.
    let logoUrl: string | null = org.logo_url ?? null;
    if (org.logo_storage_path) {
      const { data: signed } = await supabase.storage
        .from(LOGO_BUCKET)
        .createSignedUrl(org.logo_storage_path, LOGO_SIGNED_TTL);
      logoUrl = signed?.signedUrl ?? null;
    }
    return { ...org, logo_url: logoUrl };
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

const ALLOWED_LOGO_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
]);

export const uploadOrgLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("FormData attendu");
    const f = input.get("file");
    if (!(f instanceof File)) throw new Error("Fichier manquant");
    return { file: f };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { file } = data;

    if (!ALLOWED_LOGO_MIME.has(file.type)) {
      throw new Error("Format non supporté (PNG, JPG ou SVG attendu)");
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error("Logo trop volumineux (2 Mo max)");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("Organisation introuvable.");
    const orgId = profile.organization_id;

    // Best-effort: remove previous logo
    const { data: existing } = await supabase
      .from("organizations")
      .select("logo_storage_path")
      .eq("id", orgId)
      .maybeSingle();
    if (existing?.logo_storage_path) {
      await supabase.storage.from(LOGO_BUCKET).remove([existing.logo_storage_path]);
    }

    const ext = file.type === "image/svg+xml"
      ? "svg"
      : file.type === "image/png"
        ? "png"
        : "jpg";
    const path = `${orgId}/logo-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { data: signed } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(path, LOGO_SIGNED_TTL);
    const signedUrl = signed?.signedUrl ?? null;

    const { error: updErr } = await supabase
      .from("organizations")
      .update({
        logo_storage_path: path,
        logo_url: signedUrl,
      } as never)
      .eq("id", orgId);
    if (updErr) throw new Error(updErr.message);

    return { logo_url: signedUrl, logo_storage_path: path };
  });

export const removeOrgLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("Organisation introuvable.");

    const { data: org } = await supabase
      .from("organizations")
      .select("logo_storage_path")
      .eq("id", profile.organization_id)
      .maybeSingle();
    if (org?.logo_storage_path) {
      await supabase.storage.from(LOGO_BUCKET).remove([org.logo_storage_path]);
    }
    const { error } = await supabase
      .from("organizations")
      .update({ logo_url: null, logo_storage_path: null } as never)
      .eq("id", profile.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
