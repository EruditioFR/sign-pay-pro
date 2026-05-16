import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface PendingDocumentRow {
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
  oldest_pending_at: string | null;
  earliest_expires_at: string | null;
  next_signer_name: string | null;
  next_signer_email: string | null;
}

export interface PendingTotals {
  documents: number;
  pending_signers: number;
  organizations: number;
  overdue: number;
}

export interface PendingOrg {
  organization_id: string;
  organization_name: string | null;
}

const ListSchema = z.object({
  q: z.string().max(200).optional().default(""),
  org: z.string().uuid().optional().nullable(),
  sort: z.enum(["waiting", "expires", "organization", "document"]).default("waiting"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.number().int().min(1).max(10_000).default(1),
  limit: z.number().int().min(10).max(100).default(25),
});

export const listPendingSignaturesPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const offset = (data.page - 1) * data.limit;

    const { data: rows, error } = await supabase.rpc("list_pending_signature_documents", {
      p_q: data.q && data.q.length ? data.q : (null as unknown as string),
      p_org: (data.org ?? null) as unknown as string,
      p_sort: data.sort,
      p_dir: data.dir,
      p_limit: data.limit,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<PendingDocumentRow & { total_count: number }>;
    const total = list[0]?.total_count ? Number(list[0].total_count) : 0;
    const items: PendingDocumentRow[] = list.map((r) => ({
      document_id: r.document_id,
      document_title: r.document_title,
      document_reference: r.document_reference,
      document_type: r.document_type,
      organization_id: r.organization_id,
      organization_name: r.organization_name,
      total_signers: Number(r.total_signers),
      pending_signers: Number(r.pending_signers),
      signed_signers: Number(r.signed_signers),
      declined_signers: Number(r.declined_signers),
      oldest_pending_at: r.oldest_pending_at,
      earliest_expires_at: r.earliest_expires_at,
      next_signer_name: r.next_signer_name,
      next_signer_email: r.next_signer_email,
    }));

    return { items, total, page: data.page, limit: data.limit };
  });

export const getPendingSignaturesTotals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingTotals> => {
    const { data, error } = await context.supabase.rpc("pending_signatures_totals");
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0] as Partial<PendingTotals> | undefined;
    return {
      documents: Number(row?.documents ?? 0),
      pending_signers: Number(row?.pending_signers ?? 0),
      organizations: Number(row?.organizations ?? 0),
      overdue: Number(row?.overdue ?? 0),
    };
  });

export const listPendingSignaturesOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingOrg[]> => {
    const { data, error } = await context.supabase.rpc("pending_signatures_orgs");
    if (error) throw new Error(error.message);
    return (data ?? []) as PendingOrg[];
  });
