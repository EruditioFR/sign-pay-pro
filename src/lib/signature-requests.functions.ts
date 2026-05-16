import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SignerSchema = z.object({
  signer_name: z.string().min(1).max(150),
  signer_email: z.string().email().max(255),
  order_index: z.number().int().min(1).max(50),
});

const CreateSchema = z.object({
  document_id: z.string().uuid(),
  sequential: z.boolean().default(false),
  expires_in_days: z.number().int().min(1).max(365).default(30),
  signers: z.array(SignerSchema).min(1).max(20),
});

export const createSignatureRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const expiresAt = new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString();
    const rows = data.signers.map((s) => ({
      document_id: data.document_id,
      signer_name: s.signer_name,
      signer_email: s.signer_email,
      order_index: s.order_index,
      sequential: data.sequential,
      invited_by: userId,
      expires_at: expiresAt,
    }));
    const { data: inserted, error } = await supabase
      .from("document_signature_requests")
      .insert(rows)
      .select();
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "document.signature_requested",
      resource: `document:${data.document_id}`,
      metadata: { count: rows.length, sequential: data.sequential },
    });

    return { requests: inserted ?? [] };
  });

export const listSignatureRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("document_signature_requests")
      .select("*")
      .eq("document_id", data.document_id)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { requests: rows ?? [] };
  });

export const cancelSignatureRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("document_signature_requests")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
