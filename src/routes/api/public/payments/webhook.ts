import { createFileRoute } from "@tanstack/react-router";

/**
 * Stripe webhook receiver. Registered automatically by Lovable Payments at
 * /api/public/payments/webhook?env=sandbox (and ?env=live in production).
 * Subscribed events handled here:
 *   - checkout.session.completed  → mark document_payments succeeded
 *   - checkout.session.async_payment_succeeded (idempotent)
 *   - payment_intent.succeeded (fallback)
 *   - payment_intent.payment_failed → mark failed
 */
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const envParam = url.searchParams.get("env");
        const mode: "sandbox" | "live" = envParam === "live" ? "live" : "sandbox";

        const rawBody = await request.text();
        const sigHeader = request.headers.get("stripe-signature");

        const { verifyStripeSignature } = await import("@/lib/stripe-client.server");
        const verified = await verifyStripeSignature(rawBody, sigHeader, mode);
        if (!verified.ok) {
          return new Response(`Invalid signature: ${verified.reason}`, { status: 401 });
        }

        const event = verified.event as {
          id: string;
          type: string;
          data: { object: Record<string, unknown> };
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve our internal payment_id either from metadata or client_reference_id.
        const obj = event.data.object as Record<string, unknown>;
        const metadata = (obj.metadata as Record<string, string> | null) ?? null;
        const paymentId =
          metadata?.payment_id ??
          (obj.client_reference_id as string | undefined) ??
          // payment_intent.* events: metadata lives on the PI itself
          ((obj as { metadata?: Record<string, string> }).metadata?.payment_id);

        if (!paymentId) {
          console.warn("[stripe.webhook] event without payment_id", event.type, event.id);
          return new Response("ok (no payment_id)", { status: 200 });
        }

        const isSuccess =
          event.type === "checkout.session.completed" ||
          event.type === "checkout.session.async_payment_succeeded" ||
          event.type === "payment_intent.succeeded";

        const isFailure = event.type === "payment_intent.payment_failed";

        // Idempotency: if already succeeded, skip.
        const { data: existing } = await supabaseAdmin
          .from("document_payments")
          .select("id, status, metadata, document_id")
          .eq("id", paymentId)
          .maybeSingle();
        if (!existing) {
          console.warn("[stripe.webhook] payment row not found", paymentId);
          return new Response("ok (unknown payment)", { status: 200 });
        }

        if (isSuccess && existing.status !== "succeeded") {
          const sessionId = (obj.id as string) ?? null;
          const pi = (obj.payment_intent as string) ?? null;
          const payerEmail =
            ((obj.customer_details as { email?: string } | undefined)?.email) ??
            ((obj as { receipt_email?: string }).receipt_email) ??
            null;

          await supabaseAdmin
            .from("document_payments")
            .update({
              status: "succeeded",
              paid_at: new Date().toISOString(),
              provider_ref: pi ?? sessionId ?? null,
              metadata: {
                ...(existing.metadata as Record<string, unknown> | null),
                provider: "stripe",
                mode,
                stripe_event_id: event.id,
                stripe_session_id: sessionId,
                stripe_payment_intent: pi,
                payer_email: payerEmail,
              },
            })
            .eq("id", paymentId);

          // Notify (idempotent via notification_sent_at guard inside helper)
          try {
            const { notifyPaymentSucceeded } = await import("@/lib/payment-notifications.server");
            await notifyPaymentSucceeded(supabaseAdmin, paymentId);
          } catch (e) {
            console.error("[stripe.webhook] notify failed", e);
          }
        } else if (isFailure && existing.status === "pending") {
          await supabaseAdmin
            .from("document_payments")
            .update({
              status: "failed",
              metadata: {
                ...(existing.metadata as Record<string, unknown> | null),
                provider: "stripe",
                mode,
                stripe_event_id: event.id,
                failure_reason:
                  (obj.last_payment_error as { message?: string } | undefined)?.message ?? null,
              },
            })
            .eq("id", paymentId);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
