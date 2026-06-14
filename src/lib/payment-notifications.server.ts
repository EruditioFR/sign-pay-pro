/**
 * Payment confirmation notification.
 *
 * Used by:
 *   - public share payment endpoint (src/routes/api/public/share.$token.ts)
 *   - authenticated manual payment (recordManualPayment in sharing.functions.ts)
 *
 * Idempotency:
 *   - Uses document_payments.metadata.notification_sent_at as a guard.
 *   - The function reloads the row, sends, then patches metadata. If two
 *     concurrent invocations race the worst case is two emails — acceptable
 *     and bounded since each insert site calls it exactly once.
 *
 * Failure isolation:
 *   - All errors are caught and logged; the caller (HTTP handler) never fails
 *     because notification failed.
 *   - Each error is written to audit_logs with action `payment.notify_failed`.
 */

import { sendResendEmail } from "@/lib/email-sender";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function renderPaymentReceiptEmail(opts: {
  recipientRole: "payer" | "issuer";
  documentTitle: string;
  documentReference: string | null;
  amount: number;
  currency: string;
  paidAt: string;
  method: string;
  providerRef: string | null;
  payerName: string | null;
  senderOrg: string | null;
}) {
  const heading =
    opts.recipientRole === "payer"
      ? "Confirmation de votre paiement"
      : "Nouveau paiement reçu";
  const intro =
    opts.recipientRole === "payer"
      ? `Nous avons bien enregistré votre paiement de <strong>${escapeHtml(fmtAmount(opts.amount, opts.currency))}</strong>. Merci !`
      : `Un paiement de <strong>${escapeHtml(fmtAmount(opts.amount, opts.currency))}</strong> vient d'être enregistré sur le document ci-dessous.`;

  const rows: Array<[string, string]> = [
    ["Document", opts.documentTitle],
    ...(opts.documentReference ? ([["Référence", opts.documentReference]] as Array<[string, string]>) : []),
    ["Montant", fmtAmount(opts.amount, opts.currency)],
    ["Date", fmtDate(opts.paidAt)],
    ["Mode", opts.method],
    ...(opts.providerRef ? ([["Référence transaction", opts.providerRef]] as Array<[string, string]>) : []),
    ...(opts.payerName ? ([["Payeur", opts.payerName]] as Array<[string, string]>) : []),
  ];

  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#666;font-size:13px;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 12px;font-size:13px;color:#111"><strong>${escapeHtml(v)}</strong></td></tr>`,
    )
    .join("");

  const org = opts.senderOrg ? ` — ${escapeHtml(opts.senderOrg)}` : "";

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;padding:24px;color:#111">
  <div style="max-width:560px;margin:auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid #eee">
      <h2 style="margin:0;font-size:18px">${escapeHtml(heading)}${org}</h2>
    </div>
    <div style="padding:20px 24px">
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5">${intro}</p>
      <table style="border-collapse:collapse;width:100%;background:#fafafa;border-radius:6px">${table}</table>
      <p style="margin:18px 0 0;font-size:12px;color:#888">
        ${opts.recipientRole === "payer"
          ? "Ce message confirme la bonne réception de votre règlement. Conservez-le comme reçu."
          : "Cette notification a été générée automatiquement après enregistrement du paiement."}
      </p>
    </div>
  </div></body></html>`;
}

/**
 * Send confirmation email(s) for a successful payment.
 * Safe to call multiple times — guarded by metadata.notification_sent_at.
 */
export async function notifyPaymentSucceeded(
  supabaseAdmin: AdminClient,
  paymentId: string,
): Promise<{ sent: boolean; recipients: string[]; reason?: string }> {
  try {
    // 1. Load payment + document + org + creator
    const { data: payment, error: pErr } = await supabaseAdmin
      .from("document_payments")
      .select("id, document_id, amount, currency, method, status, provider_ref, paid_at, created_at, metadata")
      .eq("id", paymentId)
      .maybeSingle();
    if (pErr || !payment) return { sent: false, recipients: [], reason: pErr?.message ?? "payment_not_found" };

    if (payment.status !== "succeeded") {
      return { sent: false, recipients: [], reason: "not_succeeded" };
    }

    const meta = (payment.metadata ?? {}) as Record<string, unknown>;
    if (meta.notification_sent_at) {
      return { sent: false, recipients: [], reason: "already_notified" };
    }

    const { data: doc, error: dErr } = await supabaseAdmin
      .from("documents")
      .select("id, organization_id, title, reference, third_party_email, third_party_name, created_by, organizations:organization_id(name)")
      .eq("id", payment.document_id)
      .maybeSingle();
    if (dErr || !doc) return { sent: false, recipients: [], reason: dErr?.message ?? "document_not_found" };

    // 2. Resolve recipients (dedup, lower-cased)
    const recipients = new Map<string, "payer" | "issuer">();

    const payerEmail =
      typeof meta.payer_email === "string" && meta.payer_email.includes("@") ? meta.payer_email : null;
    if (payerEmail) recipients.set(payerEmail.toLowerCase(), "payer");

    // Document creator (issuer side)
    if (doc.created_by) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", doc.created_by)
        .maybeSingle();
      if (profile?.email) {
        const k = profile.email.toLowerCase();
        if (!recipients.has(k)) recipients.set(k, "issuer");
      }
    }

    // Third-party contact (issuer side notification if no explicit payer email)
    if (!payerEmail && doc.third_party_email) {
      const k = doc.third_party_email.toLowerCase();
      if (!recipients.has(k)) recipients.set(k, "payer");
    }

    if (recipients.size === 0) {
      return { sent: false, recipients: [], reason: "no_recipients" };
    }

    const orgName =
      (doc as { organizations?: { name?: string } }).organizations?.name ?? null;
    const paidAt = payment.paid_at ?? payment.created_at;
    const payerName =
      typeof meta.payer_name === "string" ? meta.payer_name : doc.third_party_name ?? null;

    // 3. Send (one email per recipient, with role-appropriate copy)
    const sent: string[] = [];
    const failed: Array<{ to: string; error: string }> = [];
    for (const [to, role] of recipients.entries()) {
      try {
        const html = renderPaymentReceiptEmail({
          recipientRole: role,
          documentTitle: doc.title,
          documentReference: doc.reference,
          amount: Number(payment.amount),
          currency: payment.currency,
          paidAt,
          method: payment.method,
          providerRef: payment.provider_ref,
          payerName,
          senderOrg: orgName,
        });
        const subject =
          role === "payer"
            ? `Confirmation de paiement — ${doc.reference ?? doc.title}`
            : `Paiement reçu — ${doc.reference ?? doc.title}`;
        await sendResendEmail({ to, subject, html });
        sent.push(to);
      } catch (e) {
        failed.push({ to, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // 4. Idempotency stamp + audit
    const newMeta = {
      ...meta,
      notification_sent_at: new Date().toISOString(),
      notification_recipients: sent,
      ...(failed.length ? { notification_failed: failed } : {}),
    };
    await supabaseAdmin
      .from("document_payments")
      .update({ metadata: newMeta })
      .eq("id", payment.id);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: doc.organization_id,
      user_id: null,
      action: sent.length > 0 ? "payment.notified" : "payment.notify_failed",
      resource: `document:${doc.id}`,
      metadata: {
        payment_id: payment.id,
        recipients: sent,
        failed,
        amount: Number(payment.amount),
        currency: payment.currency,
      },
    });

    return { sent: sent.length > 0, recipients: sent };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Best-effort audit on catastrophic failure
    try {
      await supabaseAdmin.from("audit_logs").insert({
        organization_id: null,
        user_id: null,
        action: "payment.notify_failed",
        resource: `payment:${paymentId}`,
        metadata: { error: msg },
      });
    } catch {
      /* swallow */
    }
    console.error("[notifyPaymentSucceeded] failed", paymentId, msg);
    return { sent: false, recipients: [], reason: msg };
  }
}
