import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ListFilters = z
  .object({
    search: z.string().max(200).optional(),
    status: z.string().max(40).optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
  })
  .optional();

type ListData = z.infer<typeof ListFilters>;

async function listByType(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  type: "quote" | "invoice",
  data: ListData,
) {
  let q = supabase
    .from("documents")
    .select(
      "id, type, status, title, reference, document_number, amount_ht, amount_ttc, currency, third_party_name, third_party_email, issue_date, due_date, created_at, updated_at",
    )
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(200);
  if (data?.status) q = q.eq("status", data.status);
  else q = q.not("status", "in", "(archived,cancelled)");
  if (data?.search)
    q = q.or(
      `title.ilike.%${data.search}%,third_party_name.ilike.%${data.search}%,document_number.ilike.%${data.search}%`,
    );
  if (data?.fromDate) q = q.gte("issue_date", data.fromDate);
  if (data?.toDate) q = q.lte("issue_date", data.toDate);
  const { data: docs, error } = await q;
  if (error) throw new Error(error.message);
  return docs ?? [];
}

// Type hack to get the typed supabase client without importing the heavy types here.
async function getSupabase() {
  // Never called — only used for typeof
  throw new Error("unreachable");
}

export const listQuotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListFilters.parse(input))
  .handler(async ({ data, context }) => {
    const docs = await listByType(
      context.supabase as unknown as Awaited<ReturnType<typeof getSupabase>>,
      "quote",
      data,
    );
    return { documents: docs };
  });

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListFilters.parse(input))
  .handler(async ({ data, context }) => {
    const docs = await listByType(
      context.supabase as unknown as Awaited<ReturnType<typeof getSupabase>>,
      "invoice",
      data,
    );
    return { documents: docs };
  });

export const getFacturationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    const { data: invoicesMonth, error: e1 } = await supabase
      .from("documents")
      .select("id, status, amount_ttc, issue_date")
      .eq("type", "invoice")
      .gte("issue_date", monthStart);
    if (e1) throw new Error(e1.message);

    const { data: openInvoices, error: e2 } = await supabase
      .from("documents")
      .select("id, status, amount_ttc")
      .eq("type", "invoice")
      .in("status", ["sent", "viewed", "partially_paid"]);
    if (e2) throw new Error(e2.message);

    const { data: openQuotes, error: e3 } = await supabase
      .from("documents")
      .select("id, status")
      .eq("type", "quote")
      .in("status", ["draft", "issued", "sent", "viewed"]);
    if (e3) throw new Error(e3.message);

    const sum = (rows: Array<{ amount_ttc: number | null }>) =>
      rows.reduce((acc, r) => acc + (Number(r.amount_ttc) || 0), 0);

    const billedThisMonth = sum(
      (invoicesMonth ?? []).filter((r) =>
        ["issued", "sent", "viewed", "partially_paid", "paid"].includes(
          r.status as string,
        ),
      ),
    );
    const paidThisMonth = sum(
      (invoicesMonth ?? []).filter((r) => r.status === "paid"),
    );
    const awaitingPayment = sum(openInvoices ?? []);
    const openQuotesCount = (openQuotes ?? []).length;
    const openInvoicesCount = (openInvoices ?? []).length;

    return {
      billedThisMonth,
      paidThisMonth,
      awaitingPayment,
      openInvoicesCount,
      openQuotesCount,
    };
  });

const ConvertSchema = z.object({
  quoteId: z.string().uuid(),
  dueDate: z.string().optional().nullable(),
  sendImmediately: z.boolean().default(false),
});

export const createInvoiceFromQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConvertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: quote, error: qErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.quoteId)
      .maybeSingle();
    if (qErr) throw new Error(qErr.message);
    if (!quote) throw new Error("Devis introuvable");
    if (quote.type !== "quote") throw new Error("Le document n'est pas un devis");

    const today = new Date().toISOString().slice(0, 10);
    const due =
      data.dueDate ??
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
      })();

    // Track lineage via tags (no metadata column on documents).
    const baseTags = (quote.tags ?? []) as string[];
    const lineageTag = `origin_quote:${quote.id}`;
    const newTags = Array.from(new Set([...baseTags, lineageTag]));

    const { data: invoice, error: iErr } = await supabase
      .from("documents")
      .insert({
        organization_id: quote.organization_id,
        type: "invoice",
        status: "draft",
        title: quote.title,
        description: quote.description,
        amount_ht: quote.amount_ht,
        amount_ttc: quote.amount_ttc,
        currency: quote.currency,
        third_party_name: quote.third_party_name,
        third_party_email: quote.third_party_email,
        issue_date: today,
        due_date: due,
        tags: newTags,
        created_by: userId,
        payment_terms: quote.payment_terms,
      })
      .select()
      .single();
    if (iErr) throw new Error(iErr.message);

    await supabase.rpc("allocate_document_number", { p_document_id: invoice.id });

    const { data: lines } = await supabase
      .from("document_invoice_lines")
      .select("*")
      .eq("document_id", quote.id);
    if (lines && lines.length > 0) {
      await supabase.from("document_invoice_lines").insert(
        lines.map((l) => ({
          document_id: invoice.id,
          position: l.position,
          description: l.description,
          quantity: l.quantity,
          unit_code: l.unit_code,
          unit_price_ht: l.unit_price_ht,
          vat_rate: l.vat_rate,
          vat_category: l.vat_category,
          discount_pct: l.discount_pct,
          line_total_ht: l.line_total_ht,
          line_total_ttc: l.line_total_ttc,
          metadata: l.metadata,
        })),
      );
    }
    const { data: vats } = await supabase
      .from("document_vat_breakdown")
      .select("*")
      .eq("document_id", quote.id);
    if (vats && vats.length > 0) {
      await supabase.from("document_vat_breakdown").insert(
        vats.map((v) => ({
          document_id: invoice.id,
          vat_rate: v.vat_rate,
          vat_category: v.vat_category,
          base_ht: v.base_ht,
          vat_amount: v.vat_amount,
          exemption_reason: v.exemption_reason,
        })),
      );
    }

    await supabase
      .from("documents")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", quote.id);

    return { invoice };
  });

const IdSchema = z.object({ documentId: z.string().uuid() });

export const getInvoiceFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document introuvable");

    const [{ data: lines }, { data: vats }, { data: payments }, { data: events }] =
      await Promise.all([
        supabase
          .from("document_invoice_lines")
          .select("*")
          .eq("document_id", data.documentId)
          .order("position"),
        supabase
          .from("document_vat_breakdown")
          .select("*")
          .eq("document_id", data.documentId),
        supabase
          .from("document_payments")
          .select("*")
          .eq("document_id", data.documentId)
          .order("created_at", { ascending: false }),
        supabase
          .from("audit_logs")
          .select("id, action, created_at, metadata")
          .eq("resource", `document:${data.documentId}`)
          .in("action", [
            "document.created",
            "invoice.transition",
            "document.payment_recorded",
          ])
          .order("created_at", { ascending: true }),
      ]);

    return {
      document: doc,
      lines: lines ?? [],
      vats: vats ?? [],
      payments: payments ?? [],
      events: events ?? [],
    };
  });

const SaveLinesSchema = z.object({
  documentId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.number().nonnegative(),
        unit_price_ht: z.number(),
        vat_rate: z.number().min(0).max(100),
        discount_pct: z.number().min(0).max(100).default(0),
      }),
    )
    .max(200),
});

export const saveDocumentLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveLinesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    type Bucket = { base_ht: number; vat_amount: number };
    const buckets = new Map<number, Bucket>();
    let totalHt = 0;
    let totalTtc = 0;
    const lineRows = data.lines.map((l, idx) => {
      const gross = l.quantity * l.unit_price_ht;
      const discounted = gross * (1 - (l.discount_pct || 0) / 100);
      const lineHt = Math.round(discounted * 100) / 100;
      const vat = Math.round(lineHt * (l.vat_rate / 100) * 100) / 100;
      const lineTtc = Math.round((lineHt + vat) * 100) / 100;
      totalHt += lineHt;
      totalTtc += lineTtc;
      const b = buckets.get(l.vat_rate) ?? { base_ht: 0, vat_amount: 0 };
      b.base_ht += lineHt;
      b.vat_amount += vat;
      buckets.set(l.vat_rate, b);
      return {
        document_id: data.documentId,
        position: idx + 1,
        description: l.description,
        quantity: l.quantity,
        unit_price_ht: l.unit_price_ht,
        vat_rate: l.vat_rate,
        discount_pct: l.discount_pct ?? 0,
        line_total_ht: lineHt,
        line_total_ttc: lineTtc,
      };
    });

    await supabase
      .from("document_invoice_lines")
      .delete()
      .eq("document_id", data.documentId);
    await supabase
      .from("document_vat_breakdown")
      .delete()
      .eq("document_id", data.documentId);

    if (lineRows.length > 0) {
      const { error: e1 } = await supabase
        .from("document_invoice_lines")
        .insert(lineRows);
      if (e1) throw new Error(e1.message);
    }

    const vatRows = Array.from(buckets.entries()).map(([rate, b]) => ({
      document_id: data.documentId,
      vat_rate: rate,
      base_ht: Math.round(b.base_ht * 100) / 100,
      vat_amount: Math.round(b.vat_amount * 100) / 100,
    }));
    if (vatRows.length > 0) {
      const { error: e2 } = await supabase
        .from("document_vat_breakdown")
        .insert(vatRows);
      if (e2) throw new Error(e2.message);
    }

    const totalVat = Math.round((totalTtc - totalHt) * 100) / 100;
    await supabase
      .from("documents")
      .update({
        amount_ht: Math.round(totalHt * 100) / 100,
        amount_ttc: Math.round(totalTtc * 100) / 100,
        total_vat: totalVat,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.documentId);

    return {
      ok: true,
      totalHt: Math.round(totalHt * 100) / 100,
      totalTtc: Math.round(totalTtc * 100) / 100,
      totalVat,
    };
  });

const CountSchema = z.object({}).optional();

export const getPendingInvoicesCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CountSchema.parse(input))
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { count, error } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("type", "invoice")
      .in("status", ["sent", "viewed", "partially_paid"]);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });
