/**
 * Signature lifecycle notifications.
 *
 * Triggered from:
 *   - public sign-request endpoint (signed / declined / next-in-sequence)
 *   - cron reminder endpoint (/api/public/cron/signature-reminders)
 *
 * All failures are caught and logged; the caller HTTP path is never broken
 * by a notification error.
 */
import {
  sendResendEmail,
  renderSignatureCompletedEmail,
  renderSignatureDeclinedEmail,
  renderSignatureReminderEmail,
  renderSignatureRequestEmail,
} from "@/lib/email-sender";

import type { supabaseAdmin as SupabaseAdmin } from "@/integrations/supabase/client.server";
type AdminClient = typeof SupabaseAdmin;

async function safeReport(source: string, e: unknown, ctx: Record<string, unknown> = {}) {
  try {
    const { reportServerError } = await import("@/lib/observability.server");
    void reportServerError(e, { source, category: "technical", context: ctx });
  } catch {
    /* ignore */
  }
}

async function loadDoc(admin: AdminClient, documentId: string) {
  const { data: doc } = await admin
    .from("documents")
    .select("id, organization_id, title, reference, created_by")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;
  const [{ data: org }, { data: creator }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", doc.organization_id).maybeSingle(),
    doc.created_by
      ? admin.from("profiles").select("email, full_name").eq("id", doc.created_by).maybeSingle()
      : Promise.resolve({ data: null as { email: string | null; full_name: string | null } | null }),
  ]);
  return { doc, org, creator };
}

/**
 * Send "document fully signed" emails to creator + every signer.
 * Idempotent: stamps documents.metadata.signature_completed_notified_at.
 */
export async function notifySignatureCompleted(
  admin: AdminClient,
  documentId: string,
  origin: string | null,
): Promise<{ sent: boolean; recipients: string[]; reason?: string }> {
  try {
    const loaded = await loadDoc(admin, documentId);
    if (!loaded) return { sent: false, recipients: [], reason: "document_not_found" };
    const { doc, org, creator } = loaded;

    const { data: docMeta } = await admin
      .from("documents")
      .select("metadata")
      .eq("id", documentId)
      .maybeSingle();
    const meta = ((docMeta?.metadata ?? {}) as Record<string, unknown>) || {};
    if (meta.signature_completed_notified_at) {
      return { sent: false, recipients: [], reason: "already_notified" };
    }

    const { data: requests } = await admin
      .from("document_signature_requests")
      .select("signer_name, signer_email, signed_at, status")
      .eq("document_id", documentId)
      .order("order_index", { ascending: true });

    const signers = (requests ?? [])
      .filter((r) => r.status === "signed")
      .map((r) => ({ name: r.signer_name, email: r.signer_email, signed_at: r.signed_at }));

    if (signers.length === 0) return { sent: false, recipients: [], reason: "no_signers" };

    const recipients = new Map<string, "signer" | "creator">();
    for (const s of signers) recipients.set(s.signer_email.toLowerCase(), "signer");
    if (creator?.email) {
      const k = creator.email.toLowerCase();
      if (!recipients.has(k)) recipients.set(k, "creator");
    }

    const url = origin ? `${origin}/app/documents/${doc.id}` : null;
    const sent: string[] = [];
    const failed: Array<{ to: string; error: string }> = [];
    for (const [to, role] of recipients.entries()) {
      try {
        const html = renderSignatureCompletedEmail({
          recipientName: role === "creator" ? creator?.full_name ?? null : null,
          recipientRole: role,
          documentTitle: doc.title,
          documentReference: doc.reference,
          signers,
          senderOrg: org?.name ?? null,
          url: role === "creator" ? url : null,
        });
        await sendResendEmail({
          to,
          subject: `Document signé — ${doc.reference ?? doc.title}`,
          html,
        });
        sent.push(to);
      } catch (e) {
        failed.push({ to, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await admin
      .from("documents")
      .update({
        metadata: {
          ...meta,
          signature_completed_notified_at: new Date().toISOString(),
          signature_completed_recipients: sent,
          ...(failed.length ? { signature_completed_failed: failed } : {}),
        },
      } as never)
      .eq("id", documentId);

    await admin.from("audit_logs").insert({
      organization_id: doc.organization_id,
      action: sent.length ? "signature.notified_completed" : "signature.notify_failed",
      resource: `document:${doc.id}`,
      metadata: { recipients: sent, failed },
    });

    return { sent: sent.length > 0, recipients: sent };
  } catch (e) {
    await safeReport("signature.notify_completed", e, { documentId });
    return { sent: false, recipients: [], reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function notifySignatureDeclined(
  admin: AdminClient,
  documentId: string,
  signerName: string,
  signerEmail: string,
  reason: string | null,
): Promise<{ sent: boolean }> {
  try {
    const loaded = await loadDoc(admin, documentId);
    if (!loaded?.creator?.email) return { sent: false };
    const { doc, org, creator } = loaded;
    const html = renderSignatureDeclinedEmail({
      recipientName: creator.full_name,
      documentTitle: doc.title,
      signerName,
      signerEmail,
      reason,
      senderOrg: org?.name ?? null,
    });
    await sendResendEmail({
      to: creator.email,
      subject: `Signature refusée — ${doc.reference ?? doc.title}`,
      html,
    });
    await admin.from("audit_logs").insert({
      organization_id: doc.organization_id,
      action: "signature.notified_declined",
      resource: `document:${doc.id}`,
      metadata: { signer_email: signerEmail, reason },
    });
    return { sent: true };
  } catch (e) {
    await safeReport("signature.notify_declined", e, { documentId });
    return { sent: false };
  }
}

/**
 * After a signed request in sequential mode, email the next pending signer.
 */
export async function notifyNextSequentialSigner(
  admin: AdminClient,
  documentId: string,
  origin: string | null,
): Promise<{ sent: boolean }> {
  try {
    const { data: next } = await admin
      .from("document_signature_requests")
      .select("id, signer_name, signer_email, token, expires_at, sequential")
      .eq("document_id", documentId)
      .eq("status", "pending")
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next || !next.sequential) return { sent: false };
    const loaded = await loadDoc(admin, documentId);
    if (!loaded) return { sent: false };
    const url = origin ? `${origin}/s/${next.token}` : `/s/${next.token}`;
    await sendResendEmail({
      to: next.signer_email,
      subject: `Signature requise : ${loaded.doc.title}`,
      html: renderSignatureRequestEmail({
        signerName: next.signer_name,
        documentTitle: loaded.doc.title,
        url,
        expiresAt: next.expires_at,
        senderOrg: loaded.org?.name ?? null,
      }),
    });
    return { sent: true };
  } catch (e) {
    await safeReport("signature.notify_next", e, { documentId });
    return { sent: false };
  }
}

/**
 * Cron-driven: send a reminder for signature requests expiring within `withinHours`.
 * Idempotent: a reminder is sent at most once per request (reminder_sent_at metadata).
 */
export async function sendSignatureReminders(
  admin: AdminClient,
  origin: string,
  withinHours = 48,
): Promise<{ scanned: number; sent: number; failed: number }> {
  const now = Date.now();
  const upper = new Date(now + withinHours * 3600_000).toISOString();
  const lower = new Date(now).toISOString();

  const { data: rows } = await admin
    .from("document_signature_requests")
    .select(
      "id, document_id, signer_name, signer_email, token, expires_at, status, metadata, order_index, sequential",
    )
    .eq("status", "pending")
    .gte("expires_at", lower)
    .lte("expires_at", upper)
    .limit(500);

  let sent = 0;
  let failed = 0;
  for (const r of rows ?? []) {
    const meta = ((r as { metadata?: Record<string, unknown> }).metadata ?? {}) || {};
    if ((meta as Record<string, unknown>).reminder_sent_at) continue;

    // In sequential mode, only remind the current next-in-line signer.
    if (r.sequential) {
      const { data: ahead } = await admin
        .from("document_signature_requests")
        .select("id")
        .eq("document_id", r.document_id)
        .eq("status", "pending")
        .lt("order_index", r.order_index)
        .limit(1);
      if (ahead && ahead.length > 0) continue;
    }

    try {
      const loaded = await loadDoc(admin, r.document_id);
      if (!loaded) continue;
      await sendResendEmail({
        to: r.signer_email,
        subject: `Rappel — Signature en attente : ${loaded.doc.title}`,
        html: renderSignatureReminderEmail({
          signerName: r.signer_name,
          documentTitle: loaded.doc.title,
          url: `${origin}/s/${r.token}`,
          expiresAt: r.expires_at,
          senderOrg: loaded.org?.name ?? null,
        }),
      });
      await admin
        .from("document_signature_requests")
        .update({
          metadata: { ...(meta as Record<string, unknown>), reminder_sent_at: new Date().toISOString() },
        } as never)
        .eq("id", r.id);
      sent++;
    } catch (e) {
      failed++;
      await safeReport("signature.reminder", e, { requestId: r.id });
    }
  }
  return { scanned: rows?.length ?? 0, sent, failed };
}
