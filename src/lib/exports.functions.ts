import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Export server functions.
 *
 * Access control:
 *   - requireSupabaseAuth → user must be authenticated.
 *   - All reads go through the user-scoped supabase client (RLS),
 *     so organization isolation is enforced at the database level.
 *   - super_admin transparently sees all organizations through RLS.
 */

const DateRangeSchema = z.object({
  organizationId: z.string().uuid().nullable().optional(),
  from: z.string().datetime().nullable().optional(),
  to: z.string().datetime().nullable().optional(),
  limit: z.number().int().min(1).max(10_000).default(5000),
});

export type AuditExportRow = {
  created_at: string;
  action: string;
  resource: string | null;
  user_email: string | null;
  user_full_name: string | null;
  organization_name: string | null;
  metadata: unknown;
};

export const exportAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DateRangeSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("list_audit_logs", {
      p_org: data.organizationId ?? undefined,
      p_from: data.from ?? undefined,
      p_to: data.to ?? undefined,
      p_action: undefined,
      p_user: undefined,
      p_resource: undefined,
      p_q: undefined,
      p_limit: data.limit,
      p_offset: 0,
    });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<AuditExportRow & { total_count: number }>;
    return {
      rows: list.map(({ total_count: _t, ...r }) => r) as AuditExportRow[],
    };
  });

export type SignatureExportRow = {
  signed_at: string;
  document_id: string;
  document_title: string | null;
  document_reference: string | null;
  organization_name: string | null;
  signer_name: string;
  signer_email: string | null;
  signature_level: string;
  auth_method: string;
  ip: string | null;
  pdf_hash_sha256: string | null;
};

export const exportSignatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DateRangeSchema.parse(i))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("document_signatures")
      .select(
        "signed_at,document_id,signer_name,signer_email,signature_level,auth_method,ip,pdf_hash_sha256,documents:document_id(title,reference,organization_id,organizations:organization_id(name))",
      )
      .order("signed_at", { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("signed_at", data.from);
    if (data.to) q = q.lte("signed_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const out: SignatureExportRow[] = (rows ?? []).map((r) => {
      const d = (r as { documents?: { title?: string; reference?: string; organization_id?: string; organizations?: { name?: string } } }).documents;
      const orgName = d?.organizations?.name ?? null;
      if (data.organizationId && d?.organization_id !== data.organizationId) return null as never;
      return {
        signed_at: r.signed_at,
        document_id: r.document_id,
        document_title: d?.title ?? null,
        document_reference: d?.reference ?? null,
        organization_name: orgName,
        signer_name: r.signer_name,
        signer_email: r.signer_email,
        signature_level: r.signature_level,
        auth_method: r.auth_method,
        ip: r.ip,
        pdf_hash_sha256: r.pdf_hash_sha256,
      };
    }).filter(Boolean);
    return { rows: out };
  });

export type PaymentExportRow = {
  created_at: string;
  paid_at: string | null;
  document_id: string;
  document_title: string | null;
  document_reference: string | null;
  organization_name: string | null;
  amount: number;
  currency: string;
  method: string;
  status: string;
  provider_ref: string | null;
};

export const exportPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DateRangeSchema.parse(i))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("document_payments")
      .select(
        "created_at,paid_at,document_id,amount,currency,method,status,provider_ref,documents:document_id(title,reference,organization_id,organizations:organization_id(name))",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const out: PaymentExportRow[] = (rows ?? []).map((r) => {
      const d = (r as { documents?: { title?: string; reference?: string; organization_id?: string; organizations?: { name?: string } } }).documents;
      if (data.organizationId && d?.organization_id !== data.organizationId) return null as never;
      return {
        created_at: r.created_at,
        paid_at: r.paid_at,
        document_id: r.document_id,
        document_title: d?.title ?? null,
        document_reference: d?.reference ?? null,
        organization_name: d?.organizations?.name ?? null,
        amount: Number(r.amount),
        currency: r.currency,
        method: r.method,
        status: r.status,
        provider_ref: r.provider_ref,
      };
    }).filter(Boolean);
    return { rows: out };
  });

/** Activity history for a single document (audit logs filtered by resource). */
export const getDocumentActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ documentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error: dErr } = await supabase
      .from("documents")
      .select("id,title,reference,type,status,third_party_name,third_party_email,amount_ttc,currency,issue_date,due_date,created_at,organization_id,organizations:organization_id(name)")
      .eq("id", data.documentId)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!doc) throw new Error("Document introuvable");

    const resource = `document:${data.documentId}`;
    const { data: logs, error: lErr } = await supabase
      .from("audit_logs")
      .select("id,created_at,action,user_id,metadata,profiles:user_id(email,full_name)")
      .eq("resource", resource)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (lErr) throw new Error(lErr.message);

    return {
      document: {
        id: doc.id,
        title: doc.title,
        reference: doc.reference,
        type: doc.type,
        status: doc.status,
        third_party_name: doc.third_party_name,
        third_party_email: doc.third_party_email,
        amount_ttc: doc.amount_ttc,
        currency: doc.currency,
        issue_date: doc.issue_date,
        due_date: doc.due_date,
        created_at: doc.created_at,
        organization_name: (doc as { organizations?: { name?: string } }).organizations?.name ?? null,
      },
      events: (logs ?? []).map((l) => {
        const p = (l as { profiles?: { email?: string; full_name?: string } }).profiles;
        return {
          id: l.id,
          created_at: l.created_at,
          action: l.action,
          user_email: p?.email ?? null,
          user_full_name: p?.full_name ?? null,
          metadata: l.metadata,
        };
      }),
    };
  });
