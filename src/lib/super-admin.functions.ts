import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!data?.some((r: any) => r.role === "super_admin")) {
    throw new Error("Accès refusé : super admin requis.");
  }
}

const CreateSchema = z
  .object({
    email: z.string().trim().email().optional().or(z.literal("")),
    phone: z.string().trim().min(5).max(30).optional().or(z.literal("")),
    fullName: z.string().trim().min(1).max(120),
    organizationName: z.string().trim().min(1).max(120),
    country: z.string().trim().min(2).max(3).default("FR"),
    password: z.string().min(8).max(72),
  })
  .refine((d) => !!(d.email && d.email.length) || !!(d.phone && d.phone.length), {
    message: "Email ou téléphone requis",
    path: ["email"],
  });

export const createAdminClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const cleanPhone = data.phone ? data.phone.replace(/[^\d+]/g, "") : "";
    const email =
      data.email && data.email.length > 0
        ? data.email
        : `phone_${cleanPhone.replace(/\D/g, "")}@phone.local`;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      phone: cleanPhone || undefined,
      password: data.password,
      email_confirm: true,
      phone_confirm: !!cleanPhone,
      user_metadata: {
        full_name: data.fullName,
        organization_name: data.organizationName,
        country: data.country,
        lang: "fr",
      },
    });

    if (error) throw new Error(error.message);
    return { userId: created.user!.id, email, phone: cleanPhone || null };
  });

export const listAdminClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, organization_id, created_at")
      .eq("role", "admin_client");

    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return { accounts: [] };

    const [{ data: profiles }, { data: orgs }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, active, organization_id")
        .in("id", ids),
      supabaseAdmin.from("organizations").select("id, name, country, plan, active"),
    ]);

    const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const accounts = (roles ?? []).map((r) => {
      const p = profileById.get(r.user_id);
      const o = p?.organization_id ? orgById.get(p.organization_id) : null;
      return {
        userId: r.user_id,
        email: p?.email ?? null,
        fullName: p?.full_name ?? null,
        active: p?.active ?? true,
        createdAt: r.created_at,
        organization: o
          ? { id: o.id, name: o.name, country: o.country, plan: o.plan, active: o.active }
          : null,
      };
    });

    return { accounts };
  });

const UpdateSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  organizationName: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().min(2).max(3).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(72).optional().or(z.literal("")),
});

export const updateAdminClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const authPatch: Record<string, unknown> = {};
    if (data.email) authPatch.email = data.email;
    if (typeof data.phone === "string") {
      const clean = data.phone.replace(/[^\d+]/g, "");
      authPatch.phone = clean || null;
    }
    if (data.password && data.password.length > 0) authPatch.password = data.password;
    if (typeof data.active === "boolean") authPatch.ban_duration = data.active ? "none" : "876000h";

    if (Object.keys(authPatch).length > 0) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authPatch as any);
      if (error) throw new Error(error.message);
    }

    const profilePatch: Record<string, unknown> = {};
    if (data.fullName) profilePatch.full_name = data.fullName;
    if (data.email) profilePatch.email = data.email;
    if (typeof data.active === "boolean") profilePatch.active = data.active;
    if (Object.keys(profilePatch).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(profilePatch)
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.organizationName || data.country) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("id", data.userId)
        .maybeSingle();
      if (prof?.organization_id) {
        const orgPatch: Record<string, unknown> = {};
        if (data.organizationName) orgPatch.name = data.organizationName;
        if (data.country) orgPatch.country = data.country;
        const { error } = await supabaseAdmin
          .from("organizations")
          .update(orgPatch)
          .eq("id", prof.organization_id);
        if (error) throw new Error(error.message);
      }
    }

    return { ok: true };
  });

const DeleteSchema = z.object({ userId: z.string().uuid() });

export const deleteAdminClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
