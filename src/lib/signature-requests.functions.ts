import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendResendEmail, renderSignatureRequestEmail, getOriginFromRequest } from "@/lib/email-sender";
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

    // State machine guard: pas de signature sur un document archivé / annulé / payé
    const { canRequestSignature } = await import("@/lib/document-state-machine");
    const { data: docState } = await supabase
      .from("documents")
      .select("status")
      .eq("id", data.document_id)
      .maybeSingle();
    if (!docState) throw new Error("Document introuvable");
    if (!canRequestSignature(docState.status)) {
      throw new Error(
        `Signature impossible : document au statut « ${docState.status} » (lecture seule).`,
      );
    }

    if (docState.status === "draft") {
      throw new Error(
        "Demande de signature impossible : veuillez d'abord valider le document (placement des champs / signatures) afin de générer le PDF final.",
      );
    }

    // Garantit qu'un PDF final figé existe avant d'envoyer les invitations.
    const { assertFinalPdfReady } = await import("@/lib/document-pdf-attachment.server");
    await assertFinalPdfReady(data.document_id);

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

    // Send invitation emails
    try {
      const { data: doc } = await supabaseAdmin
        .from("documents")
        .select("title, organization_id")
        .eq("id", data.document_id)
        .maybeSingle();
      const { data: org } = doc
        ? await supabaseAdmin.from("organizations").select("name").eq("id", doc.organization_id).maybeSingle()
        : { data: null };

      // Joindre éventuellement un lien de paiement Stripe (le dernier pending stripe_link)
      const { data: pay } = await supabaseAdmin
        .from("document_payments")
        .select("amount, currency, metadata")
        .eq("document_id", data.document_id)
        .eq("method", "stripe_link")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const paymentUrl = (pay?.metadata as { url?: string } | null)?.url ?? null;
      const paymentAmountLabel = pay
        ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: pay.currency }).format(Number(pay.amount))
        : null;

      const origin = getOriginFromRequest(getRequest());
      const targets = data.sequential
        ? (inserted ?? []).filter((r) => r.order_index === Math.min(...(inserted ?? []).map((x) => x.order_index)))
        : inserted ?? [];
      const { buildDocumentPdfAttachment } = await import("@/lib/document-pdf-attachment.server");
      const attachment = await buildDocumentPdfAttachment(data.document_id).catch(() => null);
      await Promise.all(
        targets.map((r) =>
          sendResendEmail({
            to: r.signer_email,
            subject: `Signature requise : ${doc?.title ?? "Document"}`,
            html: renderSignatureRequestEmail({
              signerName: r.signer_name,
              documentTitle: doc?.title ?? "Document",
              url: `${origin}/s/${r.token}`,
              expiresAt: r.expires_at,
              senderOrg: org?.name,
              paymentUrl,
              paymentAmountLabel,
            }),
            attachments: attachment ? [attachment] : undefined,
          }).catch((e) => console.error("signature email failed:", e)),
        ),
      );
    } catch (e) {
      console.error("signature email batch failed:", e);
      const { reportServerError } = await import("@/lib/observability.server");
      void reportServerError(e, {
        source: "signature_request.email_batch",
        category: "technical",
        context: { documentId: data.document_id, count: inserted?.length ?? 0 },
      });
    }

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
