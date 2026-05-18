import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PDFDocument } from "pdf-lib";
import { buildDocumentPdf } from "@/lib/pdf.functions";
import { sendResendEmail, renderShareEmail, getOriginFromRequest } from "@/lib/email.server";
import { z } from "zod";

const CreateLinkSchema = z.object({
  document_id: z.string().uuid(),
  recipient_email: z.string().email().optional().nullable().or(z.literal("")),
  recipient_name: z.string().max(150).optional().nullable(),
  expires_in_days: z.number().int().min(1).max(365).default(30),
  allow_sign: z.boolean().default(true),
  allow_pay: z.boolean().default(true),
  max_views: z.number().int().min(1).max(1000).optional().nullable(),
});

export const createShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateLinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const expiresAt = new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString();

    const { data: link, error } = await supabase
      .from("document_share_links")
      .insert({
        document_id: data.document_id,
        recipient_email: data.recipient_email || null,
        recipient_name: data.recipient_name || null,
        expires_at: expiresAt,
        allow_sign: data.allow_sign,
        allow_pay: data.allow_pay,
        max_views: data.max_views ?? null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // mark document as sent if still in 'validated'
    await supabase
      .from("documents")
      .update({ status: "sent" })
      .eq("id", data.document_id)
      .eq("status", "validated");

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "document.shared",
      resource: `document:${data.document_id}`,
      metadata: { link_id: link.id, recipient: data.recipient_email },
    });

    // Send email via Resend if a recipient email is provided
    let email_sent = false;
    let email_error: string | null = null;
    if (data.recipient_email) {
      try {
        const { data: doc } = await supabaseAdmin
          .from("documents")
          .select("title, organization_id")
          .eq("id", data.document_id)
          .maybeSingle();
        const { data: org } = doc
          ? await supabaseAdmin.from("organizations").select("name").eq("id", doc.organization_id).maybeSingle()
          : { data: null };
        const origin = getOriginFromRequest(getRequest());
        const url = `${origin}/s/${link.token}`;
        await sendResendEmail({
          to: data.recipient_email,
          subject: `Document partagé : ${doc?.title ?? "Document"}`,
          html: renderShareEmail({
            recipientName: data.recipient_name,
            documentTitle: doc?.title ?? "Document",
            url,
            expiresAt: expiresAt,
            senderOrg: org?.name,
          }),
        });
        email_sent = true;
      } catch (e) {
        email_error = e instanceof Error ? e.message : String(e);
        console.error("share email failed:", email_error);
      }
    }

    return { link, email_sent, email_error };
  });

export const listShareLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: links, error } = await supabase
      .from("document_share_links")
      .select("*")
      .eq("document_id", data.document_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { links: links ?? [] };
  });

export const revokeShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("document_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDocumentSignatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("document_signatures")
      .select("id, signer_name, signer_email, signed_at, ip, pdf_storage_path, pdf_hash_sha256")
      .eq("document_id", data.document_id)
      .order("signed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { signatures: rows ?? [] };
  });

export const listDocumentPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("document_payments")
      .select("*")
      .eq("document_id", data.document_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { payments: rows ?? [] };
  });

const RecordPaymentSchema = z.object({
  document_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default("EUR"),
  method: z.enum(["manual", "bank_transfer", "cash", "check"]).default("manual"),
  provider_ref: z.string().max(120).optional().nullable(),
  paid_at: z.string().optional().nullable(),
});

export const recordManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecordPaymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: payment, error } = await supabase
      .from("document_payments")
      .insert({
        document_id: data.document_id,
        amount: data.amount,
        currency: data.currency,
        method: data.method,
        status: "succeeded",
        provider_ref: data.provider_ref || null,
        paid_at: data.paid_at || new Date().toISOString(),
        recorded_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { payment };
  });

export const getSignedPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from("signed-documents")
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

const SignInternalSchema = z.object({
  document_id: z.string().uuid(),
  signer_name: z.string().min(1).max(150),
  signer_email: z.string().email().optional().nullable().or(z.literal("")),
  signature_image_b64: z.string().min(50).max(2_000_000),
  placement: z
    .object({
      page_index: z.number().int().min(0).max(500),
      x: z.number().min(0).max(5000),
      y: z.number().min(0).max(5000),
      width: z.number().min(20).max(2000),
    })
    .optional()
    .nullable(),
  initials_image_b64: z.string().min(50).max(1_000_000).optional().nullable(),
  apply_initials_each_page: z.boolean().optional().default(false),
});

export const getCurrentDocumentPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, organization_id")
      .eq("id", data.document_id)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document introuvable");

    const { data: file } = await supabaseAdmin
      .from("document_files")
      .select("storage_path")
      .eq("document_id", doc.id)
      .eq("is_current", true)
      .maybeSingle();
    if (!file) return { url: null as string | null };

    const { data: signed, error } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrl(file.storage_path, 600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl as string | null };
  });

export const signDocumentInternal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SignInternalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify the user can see this document (RLS-checked via user client).
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.document_id)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document introuvable");

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
      basePdfBytes = blob
        ? new Uint8Array(await blob.arrayBuffer())
        : await buildDocumentPdf(doc, org ?? { name: "—", country: "FR" }, null);
    } else {
      basePdfBytes = await buildDocumentPdf(doc, org ?? { name: "—", country: "FR" }, null);
    }

    const pdf = await PDFDocument.load(basePdfBytes);
    const signedAt = new Date();

    const pngB64 = data.signature_image_b64.replace(/^data:image\/png;base64,/, "");
    let sigImg;
    try {
      sigImg = await pdf.embedPng(Uint8Array.from(atob(pngB64), (c) => c.charCodeAt(0)));
    } catch {
      throw new Error("Signature invalide");
    }

    const pages = pdf.getPages();
    if (data.placement) {
      const idx = Math.min(data.placement.page_index, pages.length - 1);
      const page = pages[idx];
      const pageH = page.getHeight();
      const ratio = sigImg.height / sigImg.width;
      const w = data.placement.width;
      const h = w * ratio;
      // Convert from top-left origin (UI) to bottom-left (PDF).
      const xPdf = data.placement.x;
      const yPdf = pageH - data.placement.y - h;
      page.drawImage(sigImg, { x: xPdf, y: yPdf, width: w, height: h });
      page.drawText(
        `Signé par ${data.signer_name} — ${signedAt.toISOString()}`,
        { x: xPdf, y: Math.max(yPdf - 10, 4), size: 7 },
      );
    } else {
      // Fallback: append a dedicated signature page (legacy behaviour).
      const page = pdf.addPage([595.28, 400]);
      const dims = sigImg.scale(0.4);
      page.drawText("SIGNATURE", { x: 50, y: 340, size: 14 });
      page.drawText(`Signé par : ${data.signer_name}`, { x: 50, y: 310, size: 11 });
      if (data.signer_email) page.drawText(`Email : ${data.signer_email}`, { x: 50, y: 294, size: 10 });
      page.drawText(`Date : ${signedAt.toISOString()}`, { x: 50, y: 278, size: 10 });
      page.drawText(`Signataire interne (user_id: ${userId})`, { x: 50, y: 262, size: 9 });
      page.drawImage(sigImg, { x: 50, y: 100, width: dims.width, height: dims.height });
    }

    // Initials on every page (optional)
    if (data.apply_initials_each_page && data.initials_image_b64) {
      const initB64 = data.initials_image_b64.replace(/^data:image\/png;base64,/, "");
      let initImg;
      try {
        initImg = await pdf.embedPng(Uint8Array.from(atob(initB64), (c) => c.charCodeAt(0)));
      } catch {
        throw new Error("Paraphe invalide");
      }
      const initW = 60;
      const initH = initW * (initImg.height / initImg.width);
      const signedPageIdx = data.placement
        ? Math.min(data.placement.page_index, pages.length - 1)
        : -1;
      pages.forEach((p, idx) => {
        if (idx === signedPageIdx) return; // skip the page that already has the main signature
        const pw = p.getWidth();
        const x = pw - initW - 24;
        const y = 24;
        p.drawImage(initImg, { x, y, width: initW, height: initH });
        p.drawText(`Paraphe ${data.signer_name}`, {
          x,
          y: y + initH + 2,
          size: 6,
        });
      });
    }

    const signedBytes = await pdf.save();

    const hashBuf = await crypto.subtle.digest("SHA-256", signedBytes as BufferSource);
    const hashHex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const path = `${doc.organization_id}/${doc.id}/signed-${signedAt.getTime()}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("signed-documents")
      .upload(path, signedBytes, { contentType: "application/pdf" });
    if (upErr) throw new Error(upErr.message);

    const { data: sig, error: sigErr } = await supabaseAdmin
      .from("document_signatures")
      .insert({
        document_id: doc.id,
        share_link_id: null,
        signer_name: data.signer_name,
        signer_email: data.signer_email || null,
        signature_image_b64: data.signature_image_b64.slice(0, 500_000),
        ip: null,
        user_agent: "internal",
        pdf_hash_sha256: hashHex,
        pdf_storage_path: path,
      })
      .select()
      .single();
    if (sigErr) throw new Error(sigErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: doc.organization_id,
      user_id: userId,
      action: "document.signed_internal",
      resource: `document:${doc.id}`,
      metadata: { signature_id: sig.id, hash: hashHex, path },
    });

    return { signature_id: sig.id, hash: hashHex, path };
  });
