import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type DocumentType = "purchase_order" | "quote" | "invoice" | "contract" | "other";
export type DocumentStatus =
  | "draft"
  | "pending_validation"
  | "validated"
  | "rejected"
  | "sent"
  | "signed"
  | "paid"
  | "partially_paid"
  | "archived"
  | "cancelled";

export const ALL_DOCUMENT_STATUSES: DocumentStatus[] = [
  "draft",
  "pending_validation",
  "validated",
  "sent",
  "signed",
  "partially_paid",
  "paid",
  "rejected",
  "archived",
  "cancelled",
];

/** Statuts en lecture seule : seules les opérations d'export/consultation sont autorisées */
export const READ_ONLY_STATUSES: DocumentStatus[] = ["archived", "cancelled"];

export function isReadOnlyStatus(status: string | null | undefined): boolean {
  return !!status && (READ_ONLY_STATUSES as string[]).includes(status);
}

const DocumentTypeEnum = z.enum(["purchase_order", "quote", "invoice", "contract", "other"]);
const DocumentStatusEnum = z.enum([
  "draft",
  "pending_validation",
  "validated",
  "rejected",
  "sent",
  "signed",
  "paid",
  "partially_paid",
  "archived",
  "cancelled",
]);

const ListSchema = z
  .object({
    type: DocumentTypeEnum.optional(),
    status: DocumentStatusEnum.optional(),
    search: z.string().max(200).optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    /** Inclure les documents archivés/annulés (défaut: false sauf si status filtré) */
    includeArchived: z.boolean().optional(),
  })
  .optional();

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("documents")
      .select(
        "id, type, status, title, reference, amount_ttc, currency, third_party_name, issue_date, due_date, created_at, archived_at, retention_until"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (data?.type) q = q.eq("type", data.type);
    if (data?.status) q = q.eq("status", data.status);
    else if (!data?.includeArchived) q = q.not("status", "in", "(archived,cancelled)");
    if (data?.search) q = q.ilike("title", `%${data.search}%`);
    if (data?.fromDate) q = q.gte("issue_date", data.fromDate);
    if (data?.toDate) q = q.lte("issue_date", data.toDate);
    if (typeof data?.minAmount === "number") q = q.gte("amount_ttc", data.minAmount);
    if (typeof data?.maxAmount === "number") q = q.lte("amount_ttc", data.maxAmount);

    const { data: docs, error } = await q;
    if (error) throw new Error(error.message);
    return { documents: docs ?? [] };
  });

const IdSchema = z.object({ id: z.string().uuid() });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Document introuvable");

    const [{ data: files }, { data: workflows }] = await Promise.all([
      supabase
        .from("document_files")
        .select("id, version, storage_path, file_name, mime_type, size_bytes, uploaded_at, is_current")
        .eq("document_id", data.id)
        .order("version", { ascending: false }),
      supabase
        .from("document_workflows")
        .select(
          "id, status, current_step, started_at, completed_at, template_id, document_workflow_steps(id, position, name, approver_role, approver_user_id, status, decided_at, decided_by, comment, required)"
        )
        .eq("document_id", data.id)
        .order("started_at", { ascending: false }),
    ]);

    return { document: doc, files: files ?? [], workflows: workflows ?? [] };
  });

const CreateDocSchema = z.object({
  type: DocumentTypeEnum,
  title: z.string().min(1).max(200),
  reference: z.string().max(100).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  amount_ht: z.number().optional().nullable(),
  amount_ttc: z.number().optional().nullable(),
  currency: z.string().min(3).max(3).default("EUR"),
  third_party_name: z.string().max(200).optional().nullable(),
  third_party_email: z.string().email().optional().nullable().or(z.literal("")),
  issue_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const createDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateDocSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const payload = {
      ...data,
      third_party_email: data.third_party_email || null,
      organization_id: me.organization_id,
      created_by: userId,
      tags: data.tags ?? [],
    };

    const { data: doc, error } = await supabase
      .from("documents")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      organization_id: me.organization_id,
      user_id: userId,
      action: "document.created",
      resource: `document:${doc.id}`,
      metadata: { type: doc.type, title: doc.title },
    });

    return { document: doc };
  });

const UpdateDocSchema = CreateDocSchema.partial().extend({ id: z.string().uuid() });

export const updateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateDocSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { data: current } = await supabase
      .from("documents")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (current && isReadOnlyStatus(current.status)) {
      throw new Error("Document archivé ou annulé — désarchivez avant modification.");
    }
    const { error } = await supabase.from("documents").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// Archivage / annulation
// ============================================================================

const ArchiveSchema = z.object({
  id: z.string().uuid(),
  retention_until: z.string().optional().nullable(), // YYYY-MM-DD
  reason: z.string().max(500).optional(),
});

export const archiveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ArchiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error: fetchErr } = await supabase
      .from("documents")
      .select("id, status, organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !doc) throw new Error("Document introuvable");
    if (doc.status === "archived") throw new Error("Document déjà archivé.");
    if (doc.status === "cancelled") throw new Error("Un document annulé ne peut pas être archivé.");

    const { error } = await supabase
      .from("documents")
      .update({
        status: "archived",
        previous_status: doc.status,
        archived_at: new Date().toISOString(),
        archived_by: userId,
        retention_until: data.retention_until ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      organization_id: doc.organization_id,
      user_id: userId,
      action: "document.archived",
      resource: `document:${data.id}`,
      metadata: {
        previous_status: doc.status,
        retention_until: data.retention_until ?? null,
        reason: data.reason ?? null,
      },
    });
    return { ok: true };
  });

export const unarchiveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error: fetchErr } = await supabase
      .from("documents")
      .select("id, status, previous_status, organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !doc) throw new Error("Document introuvable");
    if (doc.status !== "archived") throw new Error("Document non archivé.");

    const restored = (doc.previous_status as DocumentStatus | null) ?? "draft";
    const { error } = await supabase
      .from("documents")
      .update({
        status: restored,
        previous_status: null,
        archived_at: null,
        archived_by: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      organization_id: doc.organization_id,
      user_id: userId,
      action: "document.unarchived",
      resource: `document:${data.id}`,
      metadata: { restored_to: restored },
    });
    return { ok: true, restored_to: restored };
  });

const CancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const cancelDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: doc, error: fetchErr } = await supabase
      .from("documents")
      .select("id, status, organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr || !doc) throw new Error("Document introuvable");
    if (["paid", "signed", "archived", "cancelled"].includes(doc.status)) {
      throw new Error("Document non annulable dans son statut actuel.");
    }

    const { error } = await supabase
      .from("documents")
      .update({ status: "cancelled", previous_status: doc.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      organization_id: doc.organization_id,
      user_id: userId,
      action: "document.cancelled",
      resource: `document:${data.id}`,
      metadata: { previous_status: doc.status, reason: data.reason ?? null },
    });
    return { ok: true };
  });

const RegisterFileSchema = z.object({
  document_id: z.string().uuid(),
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  mime_type: z.string().max(100).optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});

export const registerDocumentFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegisterFileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // mark previous current files as non-current
    const { data: existing } = await supabase
      .from("document_files")
      .select("version")
      .eq("document_id", data.document_id)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (existing?.[0]?.version ?? 0) + 1;

    if (nextVersion > 1) {
      await supabase
        .from("document_files")
        .update({ is_current: false })
        .eq("document_id", data.document_id);
    }

    const { data: file, error } = await supabase
      .from("document_files")
      .insert({
        ...data,
        version: nextVersion,
        is_current: true,
        uploaded_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { file };
  });

const SignedUrlSchema = z.object({ fileId: z.string().uuid() });

export const getDocumentFileSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SignedUrlSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: file, error: fErr } = await supabase
      .from("document_files")
      .select("storage_path, file_name")
      .eq("id", data.fileId)
      .maybeSingle();
    if (fErr || !file) throw new Error("Fichier introuvable");

    const { data: signed, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(file.storage_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, fileName: file.file_name };
  });
