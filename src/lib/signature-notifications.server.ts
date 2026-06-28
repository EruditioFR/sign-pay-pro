/**
 * Signature lifecycle notifications.
 *
 * Triggered from:
 *   - public sign-request endpoint (signed / declined / next-in-sequence)
 *   - cron reminder endpoint (/api/public/cron/signature-reminders)
 *
 * Idempotency: we use audit_logs as the source of truth (no schema change).
 * Failures are caught and logged; the caller HTTP path is never broken.
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

async function alreadyAudited(admin: AdminClient, action: string, resource: string): Promise<boolean> {
  const { data } = await admin
    .from("audit_logs")
    .select("id")
    .eq("action", action)
    .eq("resource", resource)
    .limit(1);
  return !!(data && data.length > 0);
}

async function loadDoc(admin: AdminClient, documentId: string) {
  const { data: doc } = await admin
    .from("documents")
    .select("id, organization_id, title, reference, created_by")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;
  const [{ data: org }, creatorRes] = await Promise.all([
    admin.from("organizations").select("name").eq("id", doc.organization_id).maybeSingle(),
    doc.created_by
      ? admin.from("profiles").select("email, full_name").eq("id", doc.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const creator = (creatorRes.data ?? null) as { email: string | null; full_name: string | null } | null;
  return { doc, org, creator };
}

/**
 * Load the latest signed PDF bytes for a document and return it as a base64
 * attachment suitable for Resend. Returns null on any error or if missing.
 * Skips attachment if file is larger than ~20 MB (Resend soft limit).
 */
async function loadSignedPdfAttachment(
  admin: AdminClient,
  documentId: string,
  filename: string,
): Promise<{ filename: string; content: string; content_type: string } | null> {
  try {
    const { data: sig } = await admin
      .from("document_signatures")
      .select("pdf_storage_path")
      .eq("document_id", documentId)
      .not("pdf_storage_path", "is", null)
      .order("signed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!sig?.pdf_storage_path) return null;
    const { data: blob } = await admin.storage
      .from("signed-documents")
      .download(sig.pdf_storage_path);
    if (!blob) return null;
    const ab = await blob.arrayBuffer();
    if (ab.byteLength > 20 * 1024 * 1024) return null;
    // Convert to base64 without spreading the whole buffer (V8 stack limit).
    const bytes = new Uint8Array(ab);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    const content = btoa(binary);
    return { filename, content, content_type: "application/pdf" };
  } catch (e) {
    console.error("loadSignedPdfAttachment failed:", e);
    return null;
  }
}

/**
 * Insert an in-app notification for the document creator. Best-effort.
 */
async function insertCreatorNotification(
  admin: AdminClient,
  opts: {
    documentId: string;
    organizationId: string;
    creatorUserId: string;
    title: string;
    body: string | null;
    linkUrl: string | null;
  },
): Promise<void> {
  try {
    await admin.from("user_notifications").insert({
      user_id: opts.creatorUserId,
      organization_id: opts.organizationId,
      type: "document.signed",
      title: opts.title,
      body: opts.body,
      link_url: opts.linkUrl,
      document_id: opts.documentId,
    });
  } catch (e) {
    console.error("insertCreatorNotification failed:", e);
  }
}

/**
 * Send "document fully signed" emails to creator + every signer.
 */
export async function notifySignatureCompleted(
  admin: AdminClient,
  documentId: string,
  origin: string | null,
): Promise<{ sent: boolean; recipients: string[]; reason?: string }> {
  try {
    const resource = `document:${documentId}`;
    if (await alreadyAudited(admin, "signature.notified_completed", resource)) {
      return { sent: false, recipients: [], reason: "already_notified" };
    }

    const loaded = await loadDoc(admin, documentId);
    if (!loaded) return { sent: false, recipients: [], reason: "document_not_found" };
    const { doc, org, creator } = loaded;

    const { data: requests } = await admin
      .from("document_signature_requests")
      .select("signer_name, signer_email, signed_at, status")
      .eq("document_id", documentId)
      .order("order_index", { ascending: true });

    const signed = (requests ?? []).filter((r) => r.status === "signed");
    if (signed.length === 0) return { sent: false, recipients: [], reason: "no_signers" };

    const signers = signed.map((r) => ({
      name: r.signer_name,
      email: r.signer_email,
      signed_at: r.signed_at,
    }));

    const recipients = new Map<string, "signer" | "creator">();
    for (const s of signers) recipients.set(s.email.toLowerCase(), "signer");
    if (creator?.email) {
      const k = creator.email.toLowerCase();
      if (!recipients.has(k)) recipients.set(k, "creator");
    }

    const url = origin ? `${origin}/app/documents/${doc.id}?view=signed` : null;
    const attachment = await loadSignedPdfAttachment(
      admin,
      documentId,
      `${doc.reference ?? doc.title.replace(/[^\w-]+/g, "_").slice(0, 60)}-signe.pdf`,
    );
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
          // Only attach the PDF to the creator; signers already have it on screen.
          attachments: role === "creator" && attachment ? [attachment] : undefined,
        });
        sent.push(to);
      } catch (e) {
        failed.push({ to, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // In-app notification for the creator.
    if (doc.created_by) {
      await insertCreatorNotification(admin, {
        documentId: doc.id,
        organizationId: doc.organization_id,
        creatorUserId: doc.created_by,
        title: `Document signé — ${doc.reference ?? doc.title}`,
        body: `Tous les signataires ont signé « ${doc.title} ».`,
        linkUrl: `/app/documents/${doc.id}?view=signed`,
      });
    }

    await admin.from("audit_logs").insert({
      organization_id: doc.organization_id,
      action: sent.length ? "signature.notified_completed" : "signature.notify_failed",
      resource,
      metadata: { recipients: sent, failed },
    });

    return { sent: sent.length > 0, recipients: sent };
  } catch (e) {
    await safeReport("signature.notify_completed", e, { documentId });
    return { sent: false, recipients: [], reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Notify the document creator that a single signature was just collected.
 * Used by:
 *  - share-link signing (no signature_request row)
 *  - sign-request flow (per-signature event, before the full "completed" mail)
 *
 * Idempotent via audit_logs: action="signature.notified_signed", resource="signature:{id}".
 */
export async function notifyDocumentSigned(
  admin: AdminClient,
  opts: {
    documentId: string;
    signatureId: string;
    signerName: string;
    signerEmail?: string | null;
    signedAt?: string | null;
    origin: string | null;
  },
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const resource = `signature:${opts.signatureId}`;
    if (await alreadyAudited(admin, "signature.notified_signed", resource)) {
      return { sent: false, reason: "already_notified" };
    }
    const loaded = await loadDoc(admin, opts.documentId);
    if (!loaded?.creator?.email) return { sent: false, reason: "no_creator_email" };
    const creatorEmail = loaded.creator.email;
    const { doc, org, creator } = loaded;
    const url = opts.origin ? `${opts.origin}/app/documents/${doc.id}?view=signed` : null;
    const html = renderSignatureCompletedEmail({
      recipientName: creator.full_name,
      recipientRole: "creator",
      documentTitle: doc.title,
      documentReference: doc.reference,
      signers: [
        {
          name: opts.signerName,
          email: opts.signerEmail || "—",
          signed_at: opts.signedAt ?? new Date().toISOString(),
        },
      ],
      senderOrg: org?.name ?? null,
      url,
    });
    await sendResendEmail({
      to: creatorEmail,
      subject: `Document signé — ${doc.reference ?? doc.title}`,
      html,
    });
    await admin.from("audit_logs").insert({
      organization_id: doc.organization_id,
      action: "signature.notified_signed",
      resource,
      metadata: { signer_email: opts.signerEmail ?? null, signer_name: opts.signerName },
    });
    return { sent: true };
  } catch (e) {
    await safeReport("signature.notify_signed", e, { documentId: opts.documentId });
    return { sent: false, reason: e instanceof Error ? e.message : String(e) };
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
    const creatorEmail = creator.email;
    if (!creatorEmail) return { sent: false };
    const html = renderSignatureDeclinedEmail({
      recipientName: creator.full_name,
      documentTitle: doc.title,
      signerName,
      signerEmail,
      reason,
      senderOrg: org?.name ?? null,
    });
    await sendResendEmail({
      to: creatorEmail,
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
 * Idempotent via audit_logs (resource = signature_request:{id}).
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
    .select("id, document_id, signer_name, signer_email, token, expires_at, status, order_index, sequential")
    .eq("status", "pending")
    .gte("expires_at", lower)
    .lte("expires_at", upper)
    .limit(500);

  let sent = 0;
  let failed = 0;
  for (const r of rows ?? []) {
    const resource = `signature_request:${r.id}`;
    if (await alreadyAudited(admin, "signature.reminder_sent", resource)) continue;

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
      await admin.from("audit_logs").insert({
        organization_id: loaded.doc.organization_id,
        action: "signature.reminder_sent",
        resource,
        metadata: { signer_email: r.signer_email, expires_at: r.expires_at },
      });
      sent++;
    } catch (e) {
      failed++;
      await safeReport("signature.reminder", e, { requestId: r.id });
    }
  }
  return { scanned: rows?.length ?? 0, sent, failed };
}
