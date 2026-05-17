import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DashboardStats {
  totals: {
    documents: number;
    inProgress: number;
    signed: number;
    pending: number;
    paid: number;
    amountTotal: number;
  };
  byStatus: { status: string; count: number }[];
  byType: { type: string; count: number }[];
  last30Days: { date: string; created: number; signed: number }[];
  recent: {
    id: string;
    title: string;
    status: string;
    type: string;
    amount_ttc: number | null;
    created_at: string;
  }[];
}

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardStats> => {
    const { supabase } = context;

    const since = new Date();
    since.setDate(since.getDate() - 29);
    const sinceIso = since.toISOString();

    const [{ data: docs }, { data: payments }] = await Promise.all([
      supabase
        .from("documents")
        .select("id, title, status, type, amount_ttc, created_at, updated_at"),
      supabase.from("document_payments").select("amount, status, paid_at"),
    ]);

    const list = docs ?? [];

    const byStatusMap = new Map<string, number>();
    const byTypeMap = new Map<string, number>();
    let amountTotal = 0;
    for (const d of list) {
      byStatusMap.set(d.status, (byStatusMap.get(d.status) ?? 0) + 1);
      byTypeMap.set(d.type, (byTypeMap.get(d.type) ?? 0) + 1);
      if (d.amount_ttc) amountTotal += Number(d.amount_ttc);
    }

    const signedStatuses = new Set(["signed", "completed", "paid"]);
    const pendingStatuses = new Set(["pending_signature", "pending_validation"]);
    const inProgressStatuses = new Set([
      "draft",
      "pending_validation",
      "pending_signature",
      "validated",
    ]);

    const totals = {
      documents: list.length,
      inProgress: list.filter((d) => inProgressStatuses.has(d.status)).length,
      signed: list.filter((d) => signedStatuses.has(d.status)).length,
      pending: list.filter((d) => pendingStatuses.has(d.status)).length,
      paid:
        (payments ?? []).filter((p) => p.status === "paid" || p.paid_at).length,
      amountTotal,
    };

    // Build 30-day timeline
    const days: { date: string; created: number; signed: number }[] = [];
    const dayMap = new Map<string, { created: number; signed: number }>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const entry = { created: 0, signed: 0 };
      dayMap.set(key, entry);
      days.push({ date: key, ...entry });
    }
    for (const d of list) {
      if (d.created_at >= sinceIso) {
        const key = d.created_at.slice(0, 10);
        const e = dayMap.get(key);
        if (e) e.created += 1;
      }
      if (signedStatuses.has(d.status) && d.updated_at >= sinceIso) {
        const key = d.updated_at.slice(0, 10);
        const e = dayMap.get(key);
        if (e) e.signed += 1;
      }
    }
    days.forEach((d) => {
      const e = dayMap.get(d.date)!;
      d.created = e.created;
      d.signed = e.signed;
    });

    const recent = [...list]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 5)
      .map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        type: d.type,
        amount_ttc: d.amount_ttc ? Number(d.amount_ttc) : null,
        created_at: d.created_at,
      }));

    return {
      totals,
      byStatus: Array.from(byStatusMap, ([status, count]) => ({ status, count })),
      byType: Array.from(byTypeMap, ([type, count]) => ({ type, count })),
      last30Days: days,
      recent,
    };
  });
