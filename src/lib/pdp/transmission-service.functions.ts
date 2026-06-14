/**
 * Service de file d'envoi des factures électroniques vers une PDP.
 *
 * Trois server functions :
 *   - `enqueueInvoiceTransmission` : place une facture en file (`queued`).
 *   - `processInvoiceTransmission` : tente l'envoi via le connecteur courant.
 *   - `refreshInvoiceTransmission` : interroge la PDP pour mettre à jour le statut.
 *
 * Volontairement minimaliste : pas de scheduler intégré. Un futur job
 * (pg_cron + endpoint public `/api/public/hooks/process-pdp-queue`) pourra
 * appeler `processInvoiceTransmission` pour chaque ligne `queued`.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getPdpConnector } from "@/lib/pdp/registry";
import type { PdpInvoicePayload } from "@/lib/pdp/types";

const IdSchema = z.object({ transmissionId: z.string().uuid() });

const EnqueueSchema = z.object({
  documentId: z.string().uuid(),
  format: z.enum(["factur_x", "ubl", "cii"]).default("factur_x"),
  payloadRef: z.string().max(500).optional(),
  provider: z.string().max(80).optional(),
});

/** Place la facture en file d'envoi. Idempotent par (document, queued/sending). */
export const enqueueInvoiceTransmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => EnqueueSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, organization_id, type, pdp_provider")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document introuvable");
    if (doc.type !== "invoice") throw new Error("Seules les factures sont transmissibles");

    const provider = data.provider ?? doc.pdp_provider ?? "noop";

    // Idempotence : ne pas recréer si une transmission est déjà en cours.
    const { data: existing } = await supabase
      .from("einvoice_transmissions")
      .select("id, status")
      .eq("document_id", data.documentId)
      .in("status", ["queued", "sending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return { ok: true, transmissionId: existing.id, reused: true };

    const { data: inserted, error: insErr } = await supabase
      .from("einvoice_transmissions")
      .insert({
        document_id: data.documentId,
        organization_id: doc.organization_id,
        provider,
        format: data.format,
        payload_ref: data.payloadRef ?? null,
        status: "queued",
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    await supabase
      .from("documents")
      .update({
        pdp_provider: provider,
        pdp_transmission_id: inserted.id,
        einvoice_status: "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.documentId);

    return { ok: true, transmissionId: inserted.id, reused: false };
  });

/** Tente la transmission via le connecteur. Met à jour la ligne et la facture. */
export const processInvoiceTransmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => IdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: tx, error } = await supabase
      .from("einvoice_transmissions")
      .select(
        "id, document_id, organization_id, provider, format, payload_ref, attempts, status, remote_id",
      )
      .eq("id", data.transmissionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tx) throw new Error("Transmission introuvable");
    if (tx.status === "transmitted" || tx.status === "cancelled") {
      return { ok: true, status: tx.status, remoteId: tx.remote_id };
    }

    await supabase
      .from("einvoice_transmissions")
      .update({ status: "sending", attempts: tx.attempts + 1 })
      .eq("id", tx.id);

    const { data: doc } = await supabase
      .from("documents")
      .select(
        "id, invoice_number, currency, amount_ht, amount_ttc, total_vat, seller_legal_name, seller_siret, seller_vat_number, buyer_legal_name, buyer_siret, buyer_vat_number",
      )
      .eq("id", tx.document_id)
      .single();
    if (!doc) throw new Error("Facture introuvable");

    const payload: PdpInvoicePayload = {
      documentId: doc.id,
      invoiceNumber: doc.invoice_number ?? `DOC-${doc.id.slice(0, 8)}`,
      format: (tx.format ?? "factur_x") as PdpInvoicePayload["format"],
      buyer: {
        legalName: doc.buyer_legal_name ?? "",
        siret: doc.buyer_siret,
        vatNumber: doc.buyer_vat_number,
      },
      seller: {
        legalName: doc.seller_legal_name ?? "",
        siret: doc.seller_siret,
        vatNumber: doc.seller_vat_number,
      },
      totals: {
        amountHt: Number(doc.amount_ht ?? 0),
        amountTtc: Number(doc.amount_ttc ?? 0),
        totalVat: Number(doc.total_vat ?? 0),
        currency: doc.currency ?? "EUR",
      },
      idempotencyKey: tx.id,
    };

    const connector = getPdpConnector(tx.provider);
    try {
      const result = await connector.submit(payload);
      await supabase
        .from("einvoice_transmissions")
        .update({
          status: result.status,
          remote_id: result.remoteId,
          submitted_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", tx.id);

      if (result.status === "transmitted") {
        await supabase
          .from("documents")
          .update({ einvoice_status: "submitted", updated_at: new Date().toISOString() })
          .eq("id", tx.document_id);
      }
      return { ok: true, status: result.status, remoteId: result.remoteId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      await supabase
        .from("einvoice_transmissions")
        .update({ status: "error", last_error: message })
        .eq("id", tx.id);
      return { ok: false, status: "error" as const, error: message };
    }
  });

/** Interroge la PDP et synchronise le statut local. */
export const refreshInvoiceTransmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => IdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tx } = await supabase
      .from("einvoice_transmissions")
      .select("id, document_id, provider, remote_id, status")
      .eq("id", data.transmissionId)
      .maybeSingle();
    if (!tx || !tx.remote_id) return { ok: false, reason: "no_remote_id" };

    const connector = getPdpConnector(tx.provider);
    const status = await connector.fetchStatus(tx.remote_id);

    await supabase
      .from("einvoice_transmissions")
      .update({
        status: status.status,
        acknowledged_at: new Date().toISOString(),
        last_error: status.status === "error" ? (status.message ?? "Erreur PDP") : null,
      })
      .eq("id", tx.id);

    if (status.einvoiceStatus) {
      await supabase
        .from("documents")
        .update({
          einvoice_status: status.einvoiceStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tx.document_id);
    }
    return { ok: true, status: status.status };
  });
