/**
 * File d'attente PDP — server functions pour la console admin.
 *
 * Expose la liste des factures à transmettre / en cours / en erreur,
 * sans dépendre d'un connecteur réel.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ListSchema = z.object({
  status: z
    .enum(["pending", "submitted", "acknowledged", "rejected", "error", "all"])
    .default("pending"),
  limit: z.number().int().min(1).max(200).default(50),
});

export interface PdpQueueItem {
  documentId: string;
  invoiceNumber: string | null;
  buyerName: string | null;
  amountTtc: number;
  currency: string;
  pdpStatus: "pending" | "submitted" | "acknowledged" | "rejected" | "error";
  pdpProvider: string | null;
  einvoiceStatus: string | null;
  transmissionId: string | null;
  transmissionStatus: string | null;
  lastError: string | null;
  updatedAt: string;
}

/** Liste les factures à transmettre / déjà transmises pour l'organisation courante. */
export const listPdpQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ListSchema.parse(data))
  .handler(async ({ data, context }): Promise<PdpQueueItem[]> => {
    const { supabase } = context;

    let q = supabase
      .from("documents")
      .select(
        `id, invoice_number, buyer_legal_name, amount_ttc, currency,
         pdp_status, pdp_provider, einvoice_status, pdp_transmission_id,
         updated_at,
         einvoice_transmissions:pdp_transmission_id (status, last_error)`,
      )
      .eq("type", "invoice")
      .order("updated_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "all") q = q.eq("pdp_status", data.status);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r: any) => ({
      documentId: r.id,
      invoiceNumber: r.invoice_number,
      buyerName: r.buyer_legal_name,
      amountTtc: Number(r.amount_ttc ?? 0),
      currency: r.currency ?? "EUR",
      pdpStatus: r.pdp_status,
      pdpProvider: r.pdp_provider,
      einvoiceStatus: r.einvoice_status,
      transmissionId: r.pdp_transmission_id,
      transmissionStatus: r.einvoice_transmissions?.status ?? null,
      lastError: r.einvoice_transmissions?.last_error ?? null,
      updatedAt: r.updated_at,
    }));
  });
