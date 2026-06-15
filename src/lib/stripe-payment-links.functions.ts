import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { stripeRequest, toStripeAmount } from "@/lib/stripe-client.server";

const Schema = z.object({
  document_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).default("EUR"),
  label: z.string().min(1).max(200),
});

type StripePrice = { id: string };
type StripePaymentLink = { id: string; url: string };

/**
 * Crée un Payment Link Stripe à montant fixe pour un document, enregistre
 * la trace dans document_payments (status=pending, method=stripe_link).
 */
export const createDocumentPaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Price inline (avec product_data pour ne pas créer de produit géré)
    const price = await stripeRequest<StripePrice>("/v1/prices", {
      method: "POST",
      body: {
        currency: data.currency.toLowerCase(),
        unit_amount: toStripeAmount(data.amount, data.currency),
        product_data: { name: data.label },
      },
    });

    // 2) Payment Link
    const link = await stripeRequest<StripePaymentLink>("/v1/payment_links", {
      method: "POST",
      body: {
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { document_id: data.document_id },
      },
    });

    // 3) Enregistrer
    const { error } = await supabase.from("document_payments").insert({
      document_id: data.document_id,
      amount: data.amount,
      currency: data.currency,
      method: "stripe_link",
      status: "pending",
      provider_ref: link.id,
      recorded_by: userId,
      metadata: { url: link.url, price_id: price.id },
    });
    if (error) throw new Error(error.message);

    return { url: link.url, id: link.id };
  });
