import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AppRole = "super_admin" | "reseller" | "admin_client" | "manager" | "user";
const ALLOWED_ROLES: AppRole[] = ["admin_client", "manager", "user"];

async function getCallerContext(supabase: any, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role, organization_id").eq("user_id", userId),
  ]);
  const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
  const isOrgAdmin = (roles ?? []).some(
    (r: any) => r.role === "admin_client" && r.organization_id === profile?.organization_id,
  );
  if (!isSuper && !isOrgAdmin) {
    throw new Error("Accès refusé : administrateur requis.");
  }
  return { organizationId: profile?.organization_id as string | null, isSuper };
}

async function assertSameOrg(targetUserId: string, organizationId: string, isSuper: boolean) {
  if (isSuper) return;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("organization_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!data || data.organization_id !== organizationId) {
    throw new Error("Utilisateur hors de votre organisation.");
  }
}

const CreateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120),
    email: z.string().trim().email().optional().or(z.literal("")),
    phone: z.string().trim().min(5).max(30).optional().or(z.literal("")),
    password: z.string().min(8).max(72),
    role: z.enum(["admin_client", "manager", "user"]).default("user"),
  })
  .refine((d) => !!(d.email && d.email.length) || !!(d.phone && d.phone.length), {
    message: "Email ou téléphone requis",
    path: ["email"],
  });

export const createOrgUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { organizationId } = await getCallerContext(context.supabase, context.userId);
    if (!organizationId) throw new Error("Organisation introuvable.");

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
        lang: "fr",
      },
    });
    if (error) throw new Error(error.message);
    const newUserId = created.user!.id;

    // The handle_new_user trigger created a new org + admin_client role. Re-attach to caller's org.
    const { data: createdProfile } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", newUserId)
      .maybeSingle();
    const autoOrgId = createdProfile?.organization_id;

    await supabaseAdmin
      .from("profiles")
      .update({ organization_id: organizationId, full_name: data.fullName } as never)
      .eq("id", newUserId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, organization_id: organizationId, role: data.role } as never);

    if (autoOrgId && autoOrgId !== organizationId) {
      await supabaseAdmin.from("organizations").delete().eq("id", autoOrgId);
    }

    // Welcome / invitation email — best effort, never breaks user creation.
    if (data.email && data.email.length > 0) {
      try {
        const { sendResendEmail, renderUserInviteEmail, getOriginFromRequest } = await import(
          "@/lib/email-sender"
        );
        const { getRequest } = await import("@tanstack/react-start/server");
        const origin = getOriginFromRequest(getRequest());
        const [{ data: org }, { data: inviter }] = await Promise.all([
          supabaseAdmin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
          supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
        ]);
        await sendResendEmail({
          to: data.email,
          subject: `Invitation à rejoindre ${org?.name ?? "votre organisation"}`,
          html: renderUserInviteEmail({
            fullName: data.fullName,
            email: data.email,
            temporaryPassword: data.password,
            loginUrl: origin ? `${origin}/auth` : "/auth",
            inviterOrg: org?.name ?? null,
            inviterName: inviter?.full_name ?? null,
            role: data.role,
          }),
        });
        await supabaseAdmin.from("audit_logs").insert({
          organization_id: organizationId,
          user_id: context.userId,
          action: "user.invited",
          resource: `user:${newUserId}`,
          metadata: { email: data.email, role: data.role },
        });
      } catch (e) {
        console.error("invite email failed", e);
        try {
          const { reportServerError } = await import("@/lib/observability.server");
          void reportServerError(e, {
            source: "org_users.invite_email",
            category: "technical",
            organizationId,
            context: { newUserId, email: data.email },
          });
        } catch {
          /* ignore */
        }
      }
    }

    return { userId: newUserId };
  });

const UpdateSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  password: z.string().min(8).max(72).optional().or(z.literal("")),
  role: z.enum(["admin_client", "manager", "user"]).optional(),
  active: z.boolean().optional(),
});

export const updateOrgUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { organizationId, isSuper } = await getCallerContext(context.supabase, context.userId);
    if (!organizationId) throw new Error("Organisation introuvable.");
    await assertSameOrg(data.userId, organizationId, isSuper);

    const authPatch: Record<string, unknown> = {};
    if (data.email) authPatch.email = data.email;
    if (typeof data.phone === "string") {
      const clean = data.phone.replace(/[^\d+]/g, "");
      authPatch.phone = clean || null;
    }
    if (data.password && data.password.length > 0) authPatch.password = data.password;
    if (typeof data.active === "boolean") authPatch.ban_duration = data.active ? "none" : "876000h";
    if (Object.keys(authPatch).length > 0) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        data.userId,
        authPatch as any,
      );
      if (error) throw new Error(error.message);
    }

    const profilePatch: Record<string, any> = {};
    if (data.fullName) profilePatch.full_name = data.fullName;
    if (data.email) profilePatch.email = data.email;
    if (typeof data.active === "boolean") profilePatch.active = data.active;
    if (Object.keys(profilePatch).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(profilePatch as never)
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.role && ALLOWED_ROLES.includes(data.role)) {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("organization_id", organizationId);
      await supabaseAdmin.from("user_roles").insert({
        user_id: data.userId,
        organization_id: organizationId,
        role: data.role,
      } as never);
    }

    return { ok: true };
  });

const DeleteSchema = z.object({ userId: z.string().uuid() });

export const deleteOrgUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { organizationId, isSuper } = await getCallerContext(context.supabase, context.userId);
    if (!organizationId) throw new Error("Organisation introuvable.");
    if (data.userId === context.userId) {
      throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
    }
    await assertSameOrg(data.userId, organizationId, isSuper);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
