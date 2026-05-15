import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateLinkSchema = z.object({
  document_id: z.string().uuid(),
  recipient_email: z.string().email().optional().nullable().or(z.literal("")),
  recipient_name: z.string().max(150).optional().nullable(),
  expires_in_days: z.number().int().min(1).max(365).default(30),
  allow_sign: z.boolean().default(true),
  allow_pay: z.boolean().default(true),
  max_views: z.number().int().min(1).max(1000).optional().nullable(),
});

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateLinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const expiresAt = new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString();

    const { data: link, error } = await supabase
      .from("document_share_links")
      .insert({
        document_id: data.document_id,
        recipient_email: data.recipient_email || null,
        recipient_name: data.recipient_name || null,
        expires_at: expiresAt,
        allow_sign: data.allow_sign,
        allow_pay: data.allow_pay,
        max_views: data.max_views ?? null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // mark document as sent if still in 'validated'
    await supabase
      .from("documents")
      .update({ status: "sent" })
      .eq("id", data.document_id)
      .eq("status", "validated");

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "document.shared",
      resource: `document:${data.document_id}`,
      metadata: { link_id: link.id, recipient: data.recipient_email },
    });

    return { link };
  });

export const listShareLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: links, error } = await supabase
      .from("document_share_links")
      .select("*")
      .eq("document_id", data.document_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { links: links ?? [] };
  });

export const revokeShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("document_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDocumentSignatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("document_signatures")
      .select("id, signer_name, signer_email, signed_at, ip, pdf_storage_path, pdf_hash_sha256")
      .eq("document_id", data.document_id)
      .order("signed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { signatures: rows ?? [] };
  });

export const listDocumentPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("document_payments")
      .select("*")
      .eq("document_id", data.document_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { payments: rows ?? [] };
  });

const RecordPaymentSchema = z.object({
  document_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default("EUR"),
  method: z.enum(["manual", "bank_transfer", "cash", "check"]).default("manual"),
  provider_ref: z.string().max(120).optional().nullable(),
  paid_at: z.string().optional().nullable(),
});

export const recordManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecordPaymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: payment, error } = await supabase
      .from("document_payments")
      .insert({
        document_id: data.document_id,
        amount: data.amount,
        currency: data.currency,
        method: data.method,
        status: "succeeded",
        provider_ref: data.provider_ref || null,
        paid_at: data.paid_at || new Date().toISOString(),
        recorded_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { payment };
  });

export const getSignedPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from("signed-documents")
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
