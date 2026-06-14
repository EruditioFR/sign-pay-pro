import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { buildDocumentPdf } from "@/lib/pdf.functions";
import {
  isUuidV4Like,
  firstHopIp,
  boundedUa,
  computeRemainingDue,
  clampPayableAmount,
} from "@/lib/public-routes-security";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

async function loadByToken(token: string) {
  // Defensive: tokens are server-generated UUIDs. Anything else cannot match
  // and only adds DB load when scanners probe random strings.
  if (!isUuidV4Like(token)) return null;
  const { data: link } = await supabaseAdmin
    .from("document_share_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (!link) return null;
  if (link.revoked_at) return null;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return null;
  if (link.max_views && link.view_count >= link.max_views) return null;
  return link;
}

const SignBody = z.object({
  action: z.literal("sign"),
  signer_name: z.string().min(1).max(150),
  signer_email: z.string().email().optional().nullable().or(z.literal("")),
  signature_image_b64: z.string().min(50).max(2_000_000),
});
const PayBody = z.object({
  action: z.literal("pay"),
  amount: z.number().positive(),
  method: z.enum(["bank_transfer", "manual", "cash", "check"]).default("manual"),
  payer_name: z.string().max(150).optional().nullable(),
  payer_email: z.string().email().optional().nullable().or(z.literal("")),
  provider_ref: z.string().max(200).optional().nullable(),
});
const StripeCheckoutBody = z.object({
  action: z.literal("stripe_checkout"),
  amount: z.number().positive(),
  payer_name: z.string().max(150).optional().nullable(),
  payer_email: z.string().email().optional().nullable().or(z.literal("")),
});
const PostBody = z.discriminatedUnion("action", [SignBody, PayBody, StripeCheckoutBody]);

export const Route = createFileRoute("/api/public/share/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const link = await loadByToken(params.token);
        if (!link) return json({ error: "invalid_or_expired" }, { status: 404 });

        const { data: doc } = await supabaseAdmin
          .from("documents")
          .select("id, organization_id, type, title, reference, amount_ttc, currency, third_party_name, issue_date, due_date")
          .eq("id", link.document_id)
          .maybeSingle();
        if (!doc) return json({ error: "not_found" }, { status: 404 });

        const { data: file } = await supabaseAdmin
          .from("document_files")
          .select("storage_path, file_name")
          .eq("document_id", link.document_id)
          .eq("is_current", true)
          .maybeSingle();

        let pdfUrl: string | null = null;
        if (file) {
          const { data: signed } = await supabaseAdmin.storage
            .from("documents")
            .createSignedUrl(file.storage_path, 120);
          pdfUrl = signed?.signedUrl ?? null;
        }

        const { data: org } = await supabaseAdmin
          .from("organizations")
          .select("name, country")
          .eq("id", doc.organization_id)
          .maybeSingle();

        // Increment view count and re-check max_views *after* the update
        // to make `max_views` enforcement robust against concurrent views.
        const nextCount = (link.view_count ?? 0) + 1;
        await supabaseAdmin
          .from("document_share_links")
          .update({ view_count: nextCount })
          .eq("id", link.id);
        if (link.max_views && nextCount > link.max_views) {
          return json({ error: "invalid_or_expired" }, { status: 404 });
        }

        await supabaseAdmin.from("audit_logs").insert({
          organization_id: doc.organization_id,
          action: "share.viewed",
          resource: `document:${doc.id}`,
          metadata: {
            link_id: link.id,
            ip: firstHopIp(request.headers.get("x-forwarded-for")),
            ua: boundedUa(request.headers.get("user-agent")),
          },
        });

        return json({
          document: doc,
          organization: org,
          pdfUrl,
          allow_sign: link.allow_sign,
          allow_pay: link.allow_pay,
          recipient_name: link.recipient_name,
          recipient_email: link.recipient_email,
        });
      },

      POST: async ({ params, request }) => {
        const link = await loadByToken(params.token);
        if (!link) return json({ error: "invalid_or_expired" }, { status: 404 });

        const raw = await request.json().catch(() => null);
        const parsed = PostBody.safeParse(raw);
        if (!parsed.success) return json({ error: "invalid_input" }, { status: 400 });
        const body = parsed.data;

        const ip = firstHopIp(request.headers.get("x-forwarded-for"));
        const ua = boundedUa(request.headers.get("user-agent"));

        const { data: doc } = await supabaseAdmin
          .from("documents")
          .select("*")
          .eq("id", link.document_id)
          .maybeSingle();
        if (!doc) return json({ error: "not_found" }, { status: 404 });

        if (body.action === "sign") {
          if (!link.allow_sign) return json({ error: "signing_disabled" }, { status: 403 });

          // Build / fetch current PDF and append signature page
          const { data: org } = await supabaseAdmin
            .from("organizations")
            .select("name, country")
            .eq("id", doc.organization_id)
            .maybeSingle();

          const { data: currentFile } = await supabaseAdmin
            .from("document_files")
            .select("storage_path")
            .eq("document_id", doc.id)
            .eq("is_current", true)
            .maybeSingle();

          let basePdfBytes: Uint8Array;
          if (currentFile) {
            const { data: blob } = await supabaseAdmin.storage
              .from("documents")
              .download(currentFile.storage_path);
            basePdfBytes = blob ? new Uint8Array(await blob.arrayBuffer()) : await buildDocumentPdf(doc, org ?? { name: "—", country: "FR" }, null);
          } else {
            basePdfBytes = await buildDocumentPdf(doc, org ?? { name: "—", country: "FR" }, null);
          }

          const pdf = await PDFDocument.load(basePdfBytes);
          const signaturePage = pdf.addPage([595.28, 400]);
          const signedAt = new Date();

          const pngB64 = body.signature_image_b64.replace(/^data:image\/png;base64,/, "");
          let sigImg;
          try {
            sigImg = await pdf.embedPng(Uint8Array.from(atob(pngB64), (c) => c.charCodeAt(0)));
          } catch {
            return json({ error: "invalid_signature_image" }, { status: 400 });
          }
          const dims = sigImg.scale(0.4);
          // Client signature (left)
          signaturePage.drawText("SIGNATURE CLIENT", { x: 50, y: 340, size: 12 });
          signaturePage.drawText(`Signé par : ${body.signer_name}`, { x: 50, y: 320, size: 10 });
          if (body.signer_email) signaturePage.drawText(`Email : ${body.signer_email}`, { x: 50, y: 306, size: 9 });
          signaturePage.drawText(`Date : ${signedAt.toISOString()}`, { x: 50, y: 292, size: 9 });
          if (ip) signaturePage.drawText(`IP : ${ip}`, { x: 50, y: 278, size: 8 });
          signaturePage.drawImage(sigImg, { x: 50, y: 100, width: dims.width, height: dims.height });

          // Provider signature (right) — from document creator's profile
          try {
            const { data: creator } = doc.created_by
              ? await supabaseAdmin
                  .from("profiles")
                  .select("signature_image_b64, full_name, email")
                  .eq("id", doc.created_by)
                  .maybeSingle()
              : { data: null };
            signaturePage.drawText("SIGNATURE PRESTATAIRE", { x: 320, y: 340, size: 12 });
            signaturePage.drawText(`${creator?.full_name ?? org?.name ?? "—"}`, { x: 320, y: 320, size: 10 });
            if (creator?.email) signaturePage.drawText(`Email : ${creator.email}`, { x: 320, y: 306, size: 9 });
            if (creator?.signature_image_b64) {
              const pb64 = creator.signature_image_b64.replace(/^data:image\/png;base64,/, "");
              const provImg = await pdf.embedPng(Uint8Array.from(atob(pb64), (c) => c.charCodeAt(0)));
              const pdims = provImg.scale(0.4);
              signaturePage.drawImage(provImg, { x: 320, y: 100, width: pdims.width, height: pdims.height });
            } else {
              signaturePage.drawText("(Signature non configurée)", { x: 320, y: 200, size: 9 });
            }
          } catch (e) {
            console.error("provider signature stamp failed:", e);
          }

          const signedBytes = await pdf.save();

          // Hash
          const hashBuf = await crypto.subtle.digest("SHA-256", signedBytes as BufferSource);
          const hashHex = Array.from(new Uint8Array(hashBuf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          const path = `${doc.organization_id}/${doc.id}/signed-${signedAt.getTime()}.pdf`;
          const { error: upErr } = await supabaseAdmin.storage
            .from("signed-documents")
            .upload(path, signedBytes, { contentType: "application/pdf" });
          if (upErr) return json({ error: upErr.message }, { status: 500 });

          const { data: sig, error: sigErr } = await supabaseAdmin
            .from("document_signatures")
            .insert({
              document_id: doc.id,
              share_link_id: link.id,
              signer_name: body.signer_name,
              signer_email: body.signer_email || null,
              signature_image_b64: body.signature_image_b64.slice(0, 500_000),
              ip,
              user_agent: ua,
              pdf_hash_sha256: hashHex,
              pdf_storage_path: path,
            })
            .select()
            .single();
          if (sigErr) return json({ error: sigErr.message }, { status: 500 });

          return json({ ok: true, signature_id: sig.id, hash: hashHex });
        }

        if (body.action === "pay") {
          if (!link.allow_pay) return json({ error: "payment_disabled" }, { status: 403 });
          // SECURITY: clamp the requested amount to the document's remaining
          // due so a malicious caller can't mark a doc paid with $0.01 or
          // record a fictitious overpayment from a public share token.
          const remaining = await computeRemainingDue(supabaseAdmin, doc);
          const clamped = clampPayableAmount(body.amount, remaining);
          if (clamped == null) return json({ error: "amount_out_of_range" }, { status: 400 });
          const { data: payment, error: payErr } = await supabaseAdmin
            .from("document_payments")
            .insert({
              document_id: doc.id,
              share_link_id: link.id,
              amount: clamped,
              currency: doc.currency || "EUR",
              method: body.method,
              status: "succeeded",
              provider_ref: body.provider_ref || null,
              paid_at: new Date().toISOString(),
              metadata: {
                payer_name: body.payer_name ?? null,
                payer_email: body.payer_email || null,
                ip,
                ua,
              },
            })
            .select()
            .single();
          if (payErr) return json({ error: payErr.message }, { status: 500 });

          // Fire-and-forget notification; never block the response.
          const { notifyPaymentSucceeded } = await import("@/lib/payment-notifications.server");
          notifyPaymentSucceeded(supabaseAdmin, payment.id).catch((e) =>
            console.error("[share.pay] notify failed", e),
          );

          return json({ ok: true, payment_id: payment.id });
        }

        if (body.action === "stripe_checkout") {
          if (!link.allow_pay) return json({ error: "payment_disabled" }, { status: 403 });
          // SECURITY: clamp to remaining due — same rationale as the manual
          // pay branch above. Prevents Stripe sessions for arbitrary amounts.
          const remaining = await computeRemainingDue(supabaseAdmin, doc);
          const clamped = clampPayableAmount(body.amount, remaining);
          if (clamped == null) return json({ error: "amount_out_of_range" }, { status: 400 });

          // 1) Pre-create the payment row in pending status so the webhook can
          //    resolve it by id from session metadata / client_reference_id.
          const { data: payment, error: payErr } = await supabaseAdmin
            .from("document_payments")
            .insert({
              document_id: doc.id,
              share_link_id: link.id,
              amount: clamped,
              currency: doc.currency || "EUR",
              method: "card",
              status: "pending",
              metadata: {
                provider: "stripe",
                payer_name: body.payer_name ?? null,
                payer_email: body.payer_email || null,
                ip,
                ua,
              },
            })
            .select()
            .single();
          if (payErr) return json({ error: payErr.message }, { status: 500 });

          // 2) Create Stripe Checkout Session through the connector gateway.
          const origin = new URL(request.url).origin;
          const { stripeRequest, toStripeAmount } = await import("@/lib/stripe-client.server");
          const currency = (doc.currency || "EUR").toLowerCase();
          const productName = doc.title ?? (doc.reference ? `Document ${doc.reference}` : "Document");

          try {
            const session = await stripeRequest<{ id: string; url: string }>(
              "/v1/checkout/sessions",
              {
                method: "POST",
                body: {
                  mode: "payment",
                  success_url: `${origin}/pay/success?token=${encodeURIComponent(params.token)}`,
                  cancel_url: `${origin}/pay/cancelled?token=${encodeURIComponent(params.token)}`,
                  client_reference_id: payment.id,
                  ...(body.payer_email ? { customer_email: body.payer_email } : {}),
                  line_items: [
                    {
                      quantity: 1,
                      price_data: {
                        currency,
                        unit_amount: toStripeAmount(body.amount, currency),
                        product_data: {
                          name: productName,
                          ...(doc.reference ? { description: `Réf. ${doc.reference}` } : {}),
                        },
                      },
                    },
                  ],
                  metadata: {
                    payment_id: payment.id,
                    document_id: doc.id,
                    organization_id: doc.organization_id,
                    share_link_id: link.id,
                  },
                  payment_intent_data: {
                    metadata: {
                      payment_id: payment.id,
                      document_id: doc.id,
                      organization_id: doc.organization_id,
                      share_link_id: link.id,
                    },
                  },
                },
              },
            );

            await supabaseAdmin
              .from("document_payments")
              .update({
                provider_ref: session.id,
                metadata: {
                  ...(payment.metadata as Record<string, unknown> | null),
                  stripe_session_id: session.id,
                },
              })
              .eq("id", payment.id);

            return json({ ok: true, url: session.url, payment_id: payment.id });
          } catch (e) {
            console.error("[share.stripe_checkout]", e);
            await supabaseAdmin
              .from("document_payments")
              .update({ status: "failed", metadata: { error: (e as Error).message } })
              .eq("id", payment.id);
            return json({ error: "stripe_session_failed" }, { status: 502 });
          }
        }

        return json({ error: "unknown_action" }, { status: 400 });
      },
    },
  },
});
