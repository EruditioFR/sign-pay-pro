import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PendingSignatureRow {
  request_id: string;
  document_id: string;
  document_title: string;
  document_reference: string | null;
  document_type: string;
  organization_id: string;
  organization_name: string | null;
  signer_name: string;
  signer_email: string;
  order_index: number;
  sequential: boolean;
  status: string;
  created_at: string;
  expires_at: string | null;
}

export interface PendingDocumentGroup {
  document_id: string;
  document_title: string;
  document_reference: string | null;
  document_type: string;
  organization_id: string;
  organization_name: string | null;
  total_signers: number;
  pending_signers: number;
  signed_signers: number;
  declined_signers: number;
  next_signer: { name: string; email: string } | null;
  oldest_pending_at: string;
  earliest_expires_at: string | null;
  signers: PendingSignatureRow[];
}

export const listPendingSignaturesOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // RLS will scope by org for normal users and allow all for super_admin
    const { data: allRequests, error } = await supabase
      .from("document_signature_requests")
      .select(
        "id, document_id, signer_name, signer_email, order_index, sequential, status, created_at, expires_at, documents(id, title, reference, type, organization_id, organizations(name))"
      )
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const rows = (allRequests ?? []).map((r: any) => {
      const doc = r.documents ?? {};
      const org = doc.organizations ?? null;
      return {
        request_id: r.id as string,
        document_id: r.document_id as string,
        document_title: (doc.title as string) ?? "—",
        document_reference: (doc.reference as string | null) ?? null,
        document_type: (doc.type as string) ?? "other",
        organization_id: (doc.organization_id as string) ?? "",
        organization_name: (org?.name as string | null) ?? null,
        signer_name: r.signer_name as string,
        signer_email: r.signer_email as string,
        order_index: r.order_index as number,
        sequential: r.sequential as boolean,
        status: r.status as string,
        created_at: r.created_at as string,
        expires_at: (r.expires_at as string | null) ?? null,
      } satisfies PendingSignatureRow;
    });

    // Group by document, keep only docs that still have at least one pending signer
    const byDoc = new Map<string, PendingDocumentGroup>();
    for (const row of rows) {
      let g = byDoc.get(row.document_id);
      if (!g) {
        g = {
          document_id: row.document_id,
          document_title: row.document_title,
          document_reference: row.document_reference,
          document_type: row.document_type,
          organization_id: row.organization_id,
          organization_name: row.organization_name,
          total_signers: 0,
          pending_signers: 0,
          signed_signers: 0,
          declined_signers: 0,
          next_signer: null,
          oldest_pending_at: row.created_at,
          earliest_expires_at: row.expires_at,
          signers: [],
        };
        byDoc.set(row.document_id, g);
      }
      g.signers.push(row);
      g.total_signers += 1;
      if (row.status === "pending") g.pending_signers += 1;
      else if (row.status === "signed") g.signed_signers += 1;
      else if (row.status === "declined" || row.status === "cancelled") g.declined_signers += 1;

      if (row.status === "pending" && row.created_at < g.oldest_pending_at) {
        g.oldest_pending_at = row.created_at;
      }
      if (row.expires_at) {
        if (!g.earliest_expires_at || row.expires_at < g.earliest_expires_at) {
          g.earliest_expires_at = row.expires_at;
        }
      }
    }

    const groups = Array.from(byDoc.values())
      .filter((g) => g.pending_signers > 0)
      .map((g) => {
        const pendings = g.signers
          .filter((s) => s.status === "pending")
          .sort((a, b) => a.order_index - b.order_index);
        const next = pendings[0];
        g.next_signer = next ? { name: next.signer_name, email: next.signer_email } : null;
        g.signers.sort((a, b) => a.order_index - b.order_index);
        return g;
      })
      .sort((a, b) => a.oldest_pending_at.localeCompare(b.oldest_pending_at));

    const totals = {
      documents: groups.length,
      pending_signers: groups.reduce((n, g) => n + g.pending_signers, 0),
      organizations: new Set(groups.map((g) => g.organization_id)).size,
      overdue: groups.filter(
        (g) => g.earliest_expires_at && g.earliest_expires_at < new Date().toISOString()
      ).length,
    };

    return { groups, totals };
  });
