import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const ListAuditLogsSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
  from: z.string().datetime().optional().nullable(),
  to: z.string().datetime().optional().nullable(),
  action: z.string().max(200).optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  resource: z.string().max(200).optional().nullable(),
  q: z.string().max(200).optional().nullable(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export type AuditLogRow = {
  id: string;
  created_at: string;
  organization_id: string | null;
  organization_name: string | null;
  user_id: string | null;
  user_email: string | null;
  user_full_name: string | null;
  action: string;
  resource: string | null;
  metadata: Json;
};

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListAuditLogsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("list_audit_logs", {
      p_org: data.organizationId ?? undefined,
      p_from: data.from ?? undefined,
      p_to: data.to ?? undefined,
      p_action: data.action ?? undefined,
      p_user: data.userId ?? undefined,
      p_resource: data.resource ?? undefined,
      p_q: data.q ?? undefined,
      p_limit: data.limit,
      p_offset: data.offset,
    });
    if (error) throw error;
    const list = (rows ?? []) as Array<AuditLogRow & { total_count: number }>;
    const totalCount = list[0]?.total_count ?? 0;
    return {
      rows: list.map(({ total_count: _t, ...r }) => r) as AuditLogRow[],
      totalCount: Number(totalCount),
    };
  });

const DistinctActionsSchema = z.object({
  organizationId: z.string().uuid().optional().nullable(),
});

export const listAuditActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DistinctActionsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("audit_logs").select("action").limit(1000);
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const set = new Set<string>();
    (rows ?? []).forEach((r) => set.add(r.action));
    return { actions: Array.from(set).sort() };
  });
