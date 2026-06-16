import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { INVOICE_STATUSES, canTransition, isInvoiceStatus, type InvoiceStatus } from "@/lib/invoice-lifecycle";

const TransitionSchema = z.object({
  documentId: z.string().uuid(),
  to: z.enum(INVOICE_STATUSES as [string, ...string[]]),
  reason: z.string().max(500).optional(),
});

/**
 * Move an invoice through its lifecycle, enforcing the state machine.
 * Each accepted transition is automatically audited by the
 * `tg_audit_invoice_transition` DB trigger as `invoice.transition`.
 */
export const transitionInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => TransitionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: doc, error: loadErr } = await supabase
      .from("documents")
      .select("id, type, status, first_viewed_at, legal_mentions, organization_id, document_number, issue_date, due_date, service_date, transaction_type, late_penalty_rate, recovery_indemnity, early_discount_text, third_party_name, third_party_email, buyer_siret, buyer_vat_number, buyer_address, client_delivery_address, amount_ht, amount_ttc")
      .eq("id", data.documentId)
      .maybeSingle();

    if (loadErr) throw new Error(loadErr.message);
    if (!doc) throw new Error("Document introuvable");
    if (doc.type !== "invoice") {
      throw new Error("Cycle de vie facture réservé aux documents de type facture");
    }
    if (!isInvoiceStatus(doc.status) || !canTransition(doc.status, data.to)) {
      throw new Error(`Transition non autorisée: ${doc.status} → ${data.to}`);
    }

    const patch: {
      status: InvoiceStatus;
      updated_at: string;
      first_viewed_at?: string;
      legal_mentions?: string;
    } = {
      status: data.to as InvoiceStatus,
      updated_at: new Date().toISOString(),
    };
    if (data.to === "viewed" && !doc.first_viewed_at) {
      patch.first_viewed_at = new Date().toISOString();
    }

    // Auto-remplissage des mentions légales à l'émission si vide (Art. L441-9 C.com)
    if (data.to === "issued" && !(doc.legal_mentions ?? "").trim()) {
      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", doc.organization_id)
        .maybeSingle();
      const { buildLegalMentions } = await import("@/lib/invoice-compliance");
      const mentions = buildLegalMentions(
        org as Parameters<typeof buildLegalMentions>[0],
        doc as Parameters<typeof buildLegalMentions>[1],
      );
      if (mentions.trim()) patch.legal_mentions = mentions;
    }

    const { error: updErr } = await supabase
      .from("documents")
      .update(patch)
      .eq("id", data.documentId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, from: doc.status, to: data.to };
  });
