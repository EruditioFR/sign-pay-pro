import { createFileRoute } from "@tanstack/react-router";

/**
 * Stripe webhook receiver.
 *
 * URL: /api/public/payments/webhook?env=sandbox  (et ?env=live en prod)
 * Le préfixe /api/public/* bypasse l'auth ; sécurité = vérification de signature.
 *
 * Variables d'environnement requises :
 *   - STRIPE_SECRET_KEY       (sk_test_... ou sk_live_...)
 *   - STRIPE_WEBHOOK_SECRET   (whsec_... fourni par Stripe lors de la création
 *                              du endpoint webhook dans le dashboard)
 *
 * Configuration Stripe (Dashboard → Developers → Webhooks → Add endpoint) :
 *   URL : https://<domaine>/api/public/payments/webhook?env=sandbox
 *   Événements abonnés :
 *     - checkout.session.completed
 *     - checkout.session.async_payment_succeeded
 *     - checkout.session.async_payment_failed
 *     - payment_intent.succeeded
 *     - payment_intent.payment_failed
 *     - charge.refunded
 *     - charge.refund.updated
 *
 * Idempotence : chaque event.id Stripe est inséré dans `stripe_webhook_events`
 * (PRIMARY KEY). Une duplication renvoie 200 immédiatement sans retraitement.
 *
 * Mise à jour du document : déclenchée automatiquement par le trigger
 * `on_document_payment_change` quand `document_payments.status` passe à
 * 'succeeded' (calcule paid / partially_paid + audit log success).
 * Ici on ajoute en plus les audit logs pour failed et refunded.
 */

type StripeEventObj = Record<string, unknown> & {
  metadata?: Record<string, string> | null;
  client_reference_id?: string;
  id?: string;
  payment_intent?: string;
  customer_details?: { email?: string };
  receipt_email?: string;
  last_payment_error?: { message?: string };
  amount_refunded?: number;
  refunds?: { data?: Array<{ id: string; amount: number; reason?: string }> };
  charges?: { data?: Array<StripeEventObj> };
};

type StripeEvent = {
  id: string;
  type: string;
  data: { object: StripeEventObj };
};

const SUCCESS_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "payment_intent.succeeded",
]);
const FAILURE_TYPES = new Set([
  "checkout.session.async_payment_failed",
  "payment_intent.payment_failed",
]);
const REFUND_TYPES = new Set(["charge.refunded", "charge.refund.updated"]);

function extractPaymentId(obj: StripeEventObj): string | null {
  return (
    obj.metadata?.payment_id ??
    obj.client_reference_id ??
    // charge.refunded : metadata est sur la charge OU sur le PI parent
    (obj.charges?.data?.[0]?.metadata?.payment_id) ??
    null
  );
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const mode: "sandbox" | "live" =
          url.searchParams.get("env") === "live" ? "live" : "sandbox";

        const rawBody = await request.text();
        const sigHeader = request.headers.get("stripe-signature");

        const { verifyStripeSignature, fromStripeAmount } = await import(
          "@/lib/stripe-client.server"
        );
        const verified = await verifyStripeSignature(rawBody, sigHeader, mode);
        if (!verified.ok) {
          console.warn("[stripe.webhook] signature rejected:", verified.reason);
          return new Response(`Invalid signature: ${verified.reason}`, { status: 401 });
        }

        const event = verified.event as unknown as StripeEvent;
        const obj = event.data.object;
        const paymentId = extractPaymentId(obj);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ───── 1. IDEMPOTENCE — insertion atomique de l'event.id ─────
        const { error: dedupError } = await supabaseAdmin
          .from("stripe_webhook_events")
          .insert({
            event_id: event.id,
            type: event.type,
            mode,
            payment_id: paymentId,
            payload: event as unknown as Record<string, unknown>,
          });

        if (dedupError) {
          // 23505 = unique_violation → déjà reçu, on renvoie 200 (Stripe ne ré-essaiera pas)
          if ((dedupError as { code?: string }).code === "23505") {
            return new Response("ok (duplicate)", { status: 200 });
          }
          console.error("[stripe.webhook] dedup insert failed", dedupError);
          // On continue tout de même pour ne pas perdre l'event
        }

        if (!paymentId) {
          console.warn("[stripe.webhook] event without payment_id", event.type, event.id);
          return new Response("ok (no payment_id)", { status: 200 });
        }

        const { data: existing } = await supabaseAdmin
          .from("document_payments")
          .select("id, status, metadata, document_id, amount, currency")
          .eq("id", paymentId)
          .maybeSingle();

        if (!existing) {
          console.warn("[stripe.webhook] payment row not found", paymentId);
          return new Response("ok (unknown payment)", { status: 200 });
        }

        const baseMeta = (existing.metadata as Record<string, unknown> | null) ?? {};

        // ───── 2. SUCCÈS ─────
        if (SUCCESS_TYPES.has(event.type)) {
          if (existing.status === "succeeded") {
            return new Response("ok (already succeeded)", { status: 200 });
          }
          const sessionId = typeof obj.id === "string" ? obj.id : null;
          const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
          const payerEmail = obj.customer_details?.email ?? obj.receipt_email ?? null;

          await supabaseAdmin
            .from("document_payments")
            .update({
              status: "succeeded",
              paid_at: new Date().toISOString(),
              provider_ref: pi ?? sessionId ?? null,
              metadata: {
                ...baseMeta,
                provider: "stripe",
                mode,
                stripe_event_id: event.id,
                stripe_session_id: sessionId,
                stripe_payment_intent: pi,
                payer_email: payerEmail,
              },
            })
            .eq("id", paymentId);
          // → le trigger DB `on_document_payment_change` met à jour le statut
          //   du document (paid / partially_paid) + insère l'audit log de succès.

          try {
            const { notifyPaymentSucceeded } = await import(
              "@/lib/payment-notifications.server"
            );
            await notifyPaymentSucceeded(supabaseAdmin, paymentId);
          } catch (e) {
            console.error("[stripe.webhook] notify failed", e);
          }
          return new Response("ok", { status: 200 });
        }

        // ───── 3. ÉCHEC ─────
        if (FAILURE_TYPES.has(event.type)) {
          if (existing.status !== "pending") {
            return new Response("ok (not pending)", { status: 200 });
          }
          const failureReason = obj.last_payment_error?.message ?? "payment_failed";
          await supabaseAdmin
            .from("document_payments")
            .update({
              status: "failed",
              metadata: {
                ...baseMeta,
                provider: "stripe",
                mode,
                stripe_event_id: event.id,
                failure_reason: failureReason,
              },
            })
            .eq("id", paymentId);

          // Audit log explicite (le trigger ne logge que les succès)
          const { data: doc } = await supabaseAdmin
            .from("documents")
            .select("organization_id")
            .eq("id", existing.document_id)
            .maybeSingle();
          if (doc) {
            await supabaseAdmin.from("audit_logs").insert({
              organization_id: doc.organization_id,
              user_id: null,
              action: "document.payment_failed",
              resource: `document:${existing.document_id}`,
              metadata: {
                payment_id: paymentId,
                reason: failureReason,
                stripe_event_id: event.id,
              },
            });
          }
          return new Response("ok", { status: 200 });
        }

        // ───── 4. REMBOURSEMENT ─────
        if (REFUND_TYPES.has(event.type)) {
          const amountRefundedMinor = typeof obj.amount_refunded === "number"
            ? obj.amount_refunded
            : 0;
          const currency = (existing.currency as string) || "EUR";
          const amountRefunded = fromStripeAmount(amountRefundedMinor, currency);
          const paidAmount = Number(existing.amount);
          const fullyRefunded = amountRefunded >= paidAmount;

          await supabaseAdmin
            .from("document_payments")
            .update({
              status: fullyRefunded ? "refunded" : "partially_refunded",
              metadata: {
                ...baseMeta,
                provider: "stripe",
                mode,
                stripe_event_id: event.id,
                refunded_amount: amountRefunded,
                refund_ids: obj.refunds?.data?.map((r) => r.id) ?? [],
              },
            })
            .eq("id", paymentId);

          // Repasser le document en "sent" ou "partially_paid" si entièrement remboursé
          if (fullyRefunded) {
            const { data: doc } = await supabaseAdmin
              .from("documents")
              .select("organization_id, status")
              .eq("id", existing.document_id)
              .maybeSingle();
            if (doc) {
              if (doc.status === "paid") {
                await supabaseAdmin
                  .from("documents")
                  .update({ status: "sent" })
                  .eq("id", existing.document_id);
              }
              await supabaseAdmin.from("audit_logs").insert({
                organization_id: doc.organization_id,
                user_id: null,
                action: "document.payment_refunded",
                resource: `document:${existing.document_id}`,
                metadata: {
                  payment_id: paymentId,
                  refunded_amount: amountRefunded,
                  fully_refunded: fullyRefunded,
                  stripe_event_id: event.id,
                },
              });
            }
          }
          return new Response("ok", { status: 200 });
        }

        // Event reçu mais non géré → 200 pour éviter les retries inutiles
        console.log("[stripe.webhook] unhandled event type:", event.type);
        return new Response("ok (unhandled)", { status: 200 });
      },
    },
  },
});
