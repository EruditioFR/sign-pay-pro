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

// ============================================================================
// Profil de facturation (mentions légales émetteur)
// ============================================================================

const BILLING_COLS = [
  "id", "name", "country", "legal_form", "share_capital", "siret",
  "rcs_city", "rm_number", "naf_code", "vat_number", "vat_regime",
  "is_autoentrepreneur", "iban", "bic", "late_penalty_rate",
  "recovery_indemnity", "default_payment_terms", "default_early_discount",
].join(", ");

export const getMyBillingProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    if (!profile?.organization_id) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = (await (supabase.from("organizations") as any)
      .select(BILLING_COLS)
      .eq("id", profile.organization_id)
      .maybeSingle()) as { data: Record<string, unknown> | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    // Cast to a JSON-serializable shape for TanStack serializer.
    return (data ?? null) as unknown as {
      [k: string]: string | number | boolean | null;
    } | null;
  });

const BillingSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  legal_form: z.string().trim().max(40).nullable().optional(),
  share_capital: z.number().nonnegative().nullable().optional(),
  siret: z.string().trim().regex(/^\d{14}$/u, "SIRET = 14 chiffres").nullable().optional().or(z.literal("")),
  rcs_city: z.string().trim().max(80).nullable().optional(),
  rm_number: z.string().trim().max(80).nullable().optional(),
  naf_code: z.string().trim().max(10).nullable().optional(),
  vat_number: z.string().trim()
    .regex(/^[A-Z]{2}[A-Z0-9]{2,12}$/u, "Format TVA invalide")
    .nullable().optional().or(z.literal("")),
  vat_regime: z.enum(["debits", "encaissements"]).nullable().optional(),
  is_autoentrepreneur: z.boolean().optional(),
  iban: z.string().trim().max(40).nullable().optional(),
  bic: z.string().trim().max(15).nullable().optional(),
  late_penalty_rate: z.number().min(0).max(100).nullable().optional(),
  recovery_indemnity: z.number().min(0).nullable().optional(),
  default_payment_terms: z.string().trim().max(500).nullable().optional(),
  default_early_discount: z.string().trim().max(500).nullable().optional(),
  country: z.string().trim().max(60).nullable().optional(),
});

export const updateBillingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BillingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    if (!profile?.organization_id) throw new Error("Organisation introuvable.");
    const { data: isAdmin } = await supabase.rpc("is_org_admin", {
      _user_id: userId, _org_id: profile.organization_id,
    });
    if (!isAdmin) throw new Error("Accès réservé aux administrateurs de l'organisation.");

    // Normalize empty strings to null so optional fields clear correctly.
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      payload[k] = v === "" ? null : v;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("organizations") as any)
      .update(payload).eq("id", profile.organization_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
