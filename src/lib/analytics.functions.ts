/**
 * Business-analytics aggregation server functions.
 *
 * Reuses the authenticated supabase client (RLS scopes every query to the
 * user's organization), so no admin elevation needed. Computes KPIs in JS
 * over the period window — cheap for typical org volumes and keeps the
 * implementation readable.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AnalyticsKpi {
  totalCreated: number;
  signed: number;
  paid: number;
  /** Documents signed / documents created in window (0..1). null if 0 docs. */
  signatureRate: number | null;
  /** Documents paid / documents created in window (0..1). null if 0 docs. */
  paymentRate: number | null;
  /** Average days between document creation and first signature. */
  avgDaysCreatedToSigned: number | null;
  /** Average days between issue_date (fallback created_at) and first succeeded payment. */
  avgDaysIssuedToPaid: number | null;
  /** Documents whose due_date < today and still not paid/archived/cancelled. */
  overdueCount: number;
}

export interface AnalyticsTimelinePoint {
  date: string; // YYYY-MM-DD
  created: number;
  signed: number;
  paid: number;
}

export interface AnalyticsTypeBucket {
  type: string;
  count: number;
}

export interface AnalyticsOverdueRow {
  id: string;
  title: string;
  reference: string | null;
  due_date: string;
  days_late: number;
  amount_ttc: number | null;
  currency: string | null;
  third_party_name: string | null;
}

export interface AnalyticsResult {
  period: { from: string; to: string; days: number };
  kpi: AnalyticsKpi;
  timeline: AnalyticsTimelinePoint[];
  byType: AnalyticsTypeBucket[];
  overdue: AnalyticsOverdueRow[];
}

function parseRange(input?: { from?: string; to?: string; days?: number }) {
  const days = Math.max(1, Math.min(365, input?.days ?? 30));
  const to = input?.to ? new Date(input.to) : new Date();
  const from = input?.from
    ? new Date(input.from)
    : new Date(to.getTime() - (days - 1) * 86_400_000);
  // normalize boundaries
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);
  return {
    from,
    to,
    days: Math.ceil((to.getTime() - from.getTime()) / 86_400_000),
  };
}

function dayKey(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().slice(0, 10);
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { from?: string; to?: string; days?: number }) => input ?? {},
  )
  .handler(async ({ data, context }): Promise<AnalyticsResult> => {
    const { supabase } = context;
    const { from, to, days } = parseRange(data);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const todayKey = dayKey(new Date());

    // 1. Documents created in window (for rates / timeline / byType).
    const { data: docsInWindow, error: e1 } = await supabase
      .from("documents")
      .select(
        "id, type, status, amount_ttc, currency, issue_date, due_date, created_at, archived_at",
      )
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    if (e1) throw new Error(e1.message);
    const docs = docsInWindow ?? [];
    const docIds = docs.map((d) => d.id);

    // 2. Signatures for those docs (earliest signed_at per document).
    let firstSignAt = new Map<string, string>();
    if (docIds.length) {
      const { data: sigs } = await supabase
        .from("document_signatures")
        .select("document_id, signed_at")
        .in("document_id", docIds);
      for (const s of sigs ?? []) {
        if (!s.signed_at) continue;
        const prev = firstSignAt.get(s.document_id);
        if (!prev || s.signed_at < prev) firstSignAt.set(s.document_id, s.signed_at);
      }
    }

    // 3. Successful payments for those docs (earliest succeeded paid_at).
    let firstPaidAt = new Map<string, string>();
    if (docIds.length) {
      const { data: pays } = await supabase
        .from("document_payments")
        .select("document_id, status, paid_at, created_at")
        .in("document_id", docIds)
        .eq("status", "succeeded");
      for (const p of pays ?? []) {
        const ts = p.paid_at ?? p.created_at;
        if (!ts) continue;
        const prev = firstPaidAt.get(p.document_id);
        if (!prev || ts < prev) firstPaidAt.set(p.document_id, ts);
      }
    }

    // 4. Overdue (across whole org, not just window). Open statuses only.
    const openStatuses = [
      "draft",
      "pending_validation",
      "validated",
      "sent",
      "signed",
      "partially_paid",
    ];
    const { data: overdueDocs } = await supabase
      .from("documents")
      .select(
        "id, title, reference, due_date, amount_ttc, currency, third_party_name, status",
      )
      .in("status", openStatuses)
      .not("due_date", "is", null)
      .lt("due_date", todayKey)
      .order("due_date", { ascending: true })
      .limit(50);

    // ---- Aggregations ----
    const byTypeMap = new Map<string, number>();
    const timeline = new Map<
      string,
      { created: number; signed: number; paid: number }
    >();
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * 86_400_000);
      timeline.set(dayKey(d), { created: 0, signed: 0, paid: 0 });
    }

    const signedDeltas: number[] = [];
    const paidDeltas: number[] = [];
    let signedCount = 0;
    let paidCount = 0;

    for (const d of docs) {
      byTypeMap.set(d.type, (byTypeMap.get(d.type) ?? 0) + 1);

      const cKey = dayKey(d.created_at);
      const cBucket = timeline.get(cKey);
      if (cBucket) cBucket.created += 1;

      const signedAt = firstSignAt.get(d.id);
      if (signedAt) {
        signedCount += 1;
        const delta =
          (new Date(signedAt).getTime() - new Date(d.created_at).getTime()) /
          86_400_000;
        if (delta >= 0) signedDeltas.push(delta);
        const k = dayKey(signedAt);
        const b = timeline.get(k);
        if (b) b.signed += 1;
      }

      const paidAt = firstPaidAt.get(d.id);
      if (paidAt) {
        paidCount += 1;
        const refIso = d.issue_date
          ? new Date(d.issue_date + "T00:00:00Z").toISOString()
          : d.created_at;
        const delta =
          (new Date(paidAt).getTime() - new Date(refIso).getTime()) /
          86_400_000;
        if (delta >= 0) paidDeltas.push(delta);
        const k = dayKey(paidAt);
        const b = timeline.get(k);
        if (b) b.paid += 1;
      }
    }

    const total = docs.length;
    const kpi: AnalyticsKpi = {
      totalCreated: total,
      signed: signedCount,
      paid: paidCount,
      signatureRate: total === 0 ? null : signedCount / total,
      paymentRate: total === 0 ? null : paidCount / total,
      avgDaysCreatedToSigned: avg(signedDeltas),
      avgDaysIssuedToPaid: avg(paidDeltas),
      overdueCount: overdueDocs?.length ?? 0,
    };

    const overdue: AnalyticsOverdueRow[] = (overdueDocs ?? [])
      .slice(0, 10)
      .map((d) => ({
        id: d.id,
        title: d.title,
        reference: d.reference,
        due_date: d.due_date as string,
        days_late: Math.floor(
          (Date.now() - new Date(d.due_date + "T00:00:00Z").getTime()) /
            86_400_000,
        ),
        amount_ttc: d.amount_ttc != null ? Number(d.amount_ttc) : null,
        currency: d.currency,
        third_party_name: d.third_party_name,
      }));

    return {
      period: { from: fromIso, to: toIso, days },
      kpi,
      timeline: Array.from(timeline, ([date, v]) => ({ date, ...v })),
      byType: Array.from(byTypeMap, ([type, count]) => ({ type, count })).sort(
        (a, b) => b.count - a.count,
      ),
      overdue,
    };
  });
