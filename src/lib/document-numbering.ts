/**
 * Document Numbering
 * ------------------
 * Source unique de la numérotation légale des documents commerciaux.
 *
 * - Factures   → FAC-YYYY-NNNN
 * - Devis      → DEV-YYYY-NNNN
 * - Avoirs     → AVO-YYYY-NNNN (facture avec `corrected_invoice_id`)
 *
 * L'allocation est atomique côté base via la fonction SECURITY DEFINER
 * `allocate_document_number(uuid)` qui :
 *   - verrouille la ligne document (FOR UPDATE)
 *   - incrémente la séquence (org, kind, year) via INSERT ... ON CONFLICT DO UPDATE
 *   - écrit le numéro dans `documents.document_number` (gelé ensuite par trigger)
 *
 * → Pas de doublon, pas de trou, pas de modification a posteriori.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type LegalDocumentKind = "invoice" | "quote" | "credit_note";

/**
 * `true` si le document doit obligatoirement recevoir un numéro légal.
 * (factures, avoirs, devis — pas les bons de commande / contrats / autres)
 */
export function requiresLegalNumber(args: {
  type: string;
  corrected_invoice_id?: string | null;
}): boolean {
  if (args.type === "invoice") return true;
  if (args.type === "quote") return true;
  return false;
}

/**
 * Allocation atomique du prochain numéro pour un document existant.
 * Idempotent : si le document a déjà un numéro, le retourne sans incrémenter.
 *
 * Appelé en interne par `createDocument` (factures/devis) et exposé pour
 * permettre une allocation manuelle (ex : à l'émission après brouillon).
 */
export const allocateDocumentNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: number, error } = await supabase.rpc("allocate_document_number", {
      p_document_id: data.document_id,
    });
    if (error) throw new Error(error.message);
    return { document_number: number as string };
  });

/**
 * Lit les paramètres de numérotation d'une organisation
 * (création paresseuse côté base lors de la première allocation).
 */
export const getNumberingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const { data, error } = await supabase
      .from("document_numbering_settings")
      .select("*")
      .eq("organization_id", me.organization_id)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return {
      settings:
        data ?? {
          organization_id: me.organization_id,
          invoice_prefix: "FAC",
          quote_prefix: "DEV",
          credit_note_prefix: "AVO",
          pad_width: 4,
          reset_yearly: true,
        },
    };
  });

const UpdateSettingsSchema = z.object({
  invoice_prefix: z.string().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/),
  quote_prefix: z.string().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/),
  credit_note_prefix: z.string().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/),
  pad_width: z.number().int().min(1).max(10),
  reset_yearly: z.boolean(),
});

export const updateNumberingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const { error } = await supabase
      .from("document_numbering_settings")
      .upsert({
        organization_id: me.organization_id,
        ...data,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
