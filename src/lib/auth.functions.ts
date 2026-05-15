import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AppRole = "super_admin" | "reseller" | "admin_client" | "manager" | "user";

export interface CurrentUser {
  userId: string;
  email: string | null;
  fullName: string | null;
  lang: string;
  organizationId: string | null;
  organizationName: string | null;
  roles: AppRole[];
  primaryRole: AppRole;
}

const ROLE_PRIORITY: AppRole[] = ["super_admin", "reseller", "admin_client", "manager", "user"];

export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CurrentUser> => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: rolesData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("email, full_name, lang, organization_id, organizations(name)")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const roles = (rolesData ?? []).map((r) => r.role as AppRole);
    const primaryRole =
      ROLE_PRIORITY.find((r) => roles.includes(r)) ?? ("user" as AppRole);

    const orgName = (profile?.organizations as { name: string } | null)?.name ?? null;

    return {
      userId,
      email: profile?.email ?? null,
      fullName: profile?.full_name ?? null,
      lang: profile?.lang ?? "fr",
      organizationId: profile?.organization_id ?? null,
      organizationName: orgName,
      roles,
      primaryRole,
    };
  });

const ListUsersSchema = z.object({}).optional();

export const listOrgUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListUsersSchema.parse(input))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();

    if (!me?.organization_id) return { users: [] };

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name, active, lang")
      .eq("organization_id", me.organization_id);

    const ids = (profiles ?? []).map((p) => p.id);
    if (ids.length === 0) return { users: [] };

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids)
      .eq("organization_id", me.organization_id);

    const rolesByUser = new Map<string, AppRole[]>();
    (roles ?? []).forEach((r) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesByUser.set(r.user_id, arr);
    });

    return {
      users: (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        active: p.active,
        roles: rolesByUser.get(p.id) ?? [],
      })),
    };
  });

const ListTenantsSchema = z.object({}).optional();

export const listAllTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListTenantsSchema.parse(input))
  .handler(async ({ context }) => {
    const { supabase } = context;

    // RLS will limit results: super_admin sees all, reseller sees its clients,
    // admin_client sees only their org.
    const { data } = await supabase
      .from("organizations")
      .select("id, name, country, plan, active, created_at")
      .order("created_at", { ascending: false });

    return { tenants: data ?? [] };
  });
