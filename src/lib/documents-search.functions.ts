import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { DocumentStatus, DocumentType } from "@/lib/documents.functions";

export type DocumentSortField = "created_at" | "updated_at" | "issue_date" | "due_date" | "amount_ttc";
export type SortDir = "asc" | "desc";
export type SignatureFilter = "any" | "none" | "pending" | "signed";
export type PaymentFilter = "any" | "none" | "partial" | "paid";
export type ArchivedFilter = "exclude" | "only" | "include";

export interface DocumentSearchRow {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  title: string;
  reference: string | null;
  amount_ht: number | null;
  amount_ttc: number | null;
  currency: string;
  third_party_name: string | null;
  third_party_email: string | null;
  issue_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  retention_until: string | null;
  organization_id: string;
  organization_name: string | null;
  signers_total: number;
  signers_signed: number;
  payments_total: number;
  has_signed: boolean;
  has_payment: boolean;
  total_count: number;
}

const DOCUMENT_TYPES = ["purchase_order", "quote", "invoice", "contract", "other"] as const;
const DOCUMENT_STATUSES = [
  "draft", "pending_validation", "validated", "rejected",
  "sent", "signed", "paid", "partially_paid", "archived", "cancelled",
] as const;

const SearchSchema = z.object({
  q: z.string().max(200).optional(),
  types: z.array(z.enum(DOCUMENT_TYPES)).optional(),
  statuses: z.array(z.enum(DOCUMENT_STATUSES)).optional(),
  currencies: z.array(z.string().length(3)).max(8).optional(),
  organization_id: z.string().uuid().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  min_amount: z.number().optional(),
  max_amount: z.number().optional(),
  signature: z.enum(["any", "none", "pending", "signed"]).optional(),
  payment: z.enum(["any", "none", "partial", "paid"]).optional(),
  archived: z.enum(["exclude", "only", "include"]).optional(),
  sort: z.enum(["created_at", "updated_at", "issue_date", "due_date", "amount_ttc"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export type DocumentSearchInput = z.infer<typeof SearchSchema>;

export const searchDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SearchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("search_documents", {
      p_q: data.q?.trim() || null,
      p_types: data.types?.length ? data.types : null,
      p_statuses: data.statuses?.length ? data.statuses : null,
      p_currencies: data.currencies?.length ? data.currencies : null,
      p_organization: data.organization_id ?? null,
      p_from_date: data.from_date || null,
      p_to_date: data.to_date || null,
      p_min_amount: data.min_amount ?? null,
      p_max_amount: data.max_amount ?? null,
      p_signature: data.signature ?? "any",
      p_payment: data.payment ?? "any",
      p_archived: data.archived ?? "exclude",
      p_sort: data.sort ?? "created_at",
      p_dir: data.dir ?? "desc",
      p_limit: data.limit ?? 25,
      p_offset: data.offset ?? 0,
    });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as DocumentSearchRow[];
    const total = list[0]?.total_count ?? 0;
    return { rows: list, total: Number(total), limit: data.limit ?? 25, offset: data.offset ?? 0 };
  });

/** Liste les organisations distinctes pour le filtre (admin / super admin) */
export const listSearchableOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return { organizations: data ?? [] };
  });
