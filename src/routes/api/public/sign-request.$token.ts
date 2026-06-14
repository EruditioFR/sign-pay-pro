import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { buildDocumentPdf } from "@/lib/pdf.functions";
import {
  CONFORMITY_MODULE_VERSION,
  CURRENT_SUPPORTED_LEVEL,
  DEFAULT_CONSENT_TEXT_FR,
  CONSENT_TEXT_VERSION,
  assertAuthMethodAllowed,
  sha256Hex,
  tokenHint,
  type SignatureEvidence,
} from "@/lib/signature-conformity";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

async function loadRequest(token: string) {
  const { data: req } = await supabaseAdmin
    .from("document_signature_requests")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (!req) return null;
  if (req.expires_at && new Date(req.expires_at) < new Date()) return null;
  return req;
}

// Is this request currently "playable"? When sequential, only the smallest
// pending order_index for the document can sign.
async function isNextInLine(req: {
  id: string;
  document_id: string;
  sequential: boolean;
  order_index: number;
  status: string;
}) {
  if (req.status !== "pending") return false;
  if (!req.sequential) return true;
  const { data: ahead } = await supabaseAdmin
    .from("document_signature_requests")
    .select("id, order_index, status")
    .eq("document_id", req.document_id)
    .eq("status", "pending")
    .lt("order_index", req.order_index)
    .limit(1);
  return !ahead || ahead.length === 0;
}

const SignBody = z.object({
  action: z.literal("sign"),
  signature_image_b64: z.string().min(50).max(2_000_000),
  // Consentement explicite — exigé pour la conformité SES (eIDAS art. 25).
  consent: z.object({
    accepted: z.literal(true),
    text: z.string().min(20).max(2000).optional(),
  }),
  placement: z
    .object({
      page_index: z.number().int().min(0).max(500),
      x: z.number().min(0).max(5000),
      y: z.number().min(0).max(5000),
      width: z.number().min(20).max(2000),
    })
    .optional()
    .nullable(),
});
const DeclineBody = z.object({
  action: z.literal("decline"),
  reason: z.string().max(500).optional().nullable(),
});
const PostBody = z.discriminatedUnion("action", [SignBody, DeclineBody]);

export const Route = createFileRoute("/api/public/sign-request/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const req = await loadRequest(params.token);
        if (!req) return json({ error: "invalid_or_expired" }, { status: 404 });

        const { data: doc } = await supabaseAdmin
          .from("documents")
          .select(
            "id, organization_id, type, title, reference, amount_ttc, currency, third_party_name, issue_date, due_date",
          )
          .eq("id", req.document_id)
          .maybeSingle();
        if (!doc) return json({ error: "not_found" }, { status: 404 });

        const { data: file } = await supabaseAdmin
          .from("document_files")
          .select("storage_path")
          .eq("document_id", doc.id)
          .eq("is_current", true)
          .maybeSingle();

        let pdfUrl: string | null = null;
        if (file) {
          const { data: signed } = await supabaseAdmin.storage
            .from("documents")
            .createSignedUrl(file.storage_path, 600);
          pdfUrl = signed?.signedUrl ?? null;
        }

        const { data: org } = await supabaseAdmin
          .from("organizations")
          .select("name, country")
          .eq("id", doc.organization_id)
          .maybeSingle();

        const next = await isNextInLine(req);

        return json({
          document: doc,
          organization: org,
          pdfUrl,
          request: {
            id: req.id,
            signer_name: req.signer_name,
            signer_email: req.signer_email,
            order_index: req.order_index,
            sequential: req.sequential,
            status: req.status,
            expires_at: req.expires_at,
            signed_at: req.signed_at,
            signature_level: req.signature_level ?? CURRENT_SUPPORTED_LEVEL,
            auth_method_required: req.auth_method_required ?? "email_link",
          },
          conformity: {
            signature_level: req.signature_level ?? CURRENT_SUPPORTED_LEVEL,
            consent_text: DEFAULT_CONSENT_TEXT_FR,
            consent_version: CONSENT_TEXT_VERSION,
            module_version: CONFORMITY_MODULE_VERSION,
          },
          can_sign: next,
        });
      },

      POST: async ({ params, request }) => {
        const req = await loadRequest(params.token);
        if (!req) return json({ error: "invalid_or_expired" }, { status: 404 });

        const raw = await request.json().catch(() => null);
        const parsed = PostBody.safeParse(raw);
        if (!parsed.success) return json({ error: "invalid_input" }, { status: 400 });
        const body = parsed.data;

        if (req.status !== "pending") {
          return json({ error: "request_closed" }, { status: 409 });
        }

        if (body.action === "decline") {
          await supabaseAdmin
            .from("document_signature_requests")
            .update({ status: "declined", decline_reason: body.reason ?? null })
            .eq("id", req.id);
          return json({ ok: true });
        }

        const next = await isNextInLine(req);
        if (!next) return json({ error: "not_your_turn" }, { status: 409 });

        const ip = request.headers.get("x-forwarded-for") ?? null;
        const ua = request.headers.get("user-agent") ?? null;

        const { data: doc } = await supabaseAdmin
          .from("documents")
          .select("*")
          .eq("id", req.document_id)
          .maybeSingle();
        if (!doc) return json({ error: "not_found" }, { status: 404 });

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

        // Empreinte du PDF AVANT apposition — preuve d'intégrité du contrat soumis.
        const originalHashHex = await sha256Hex(basePdfBytes);

        const pdf = await PDFDocument.load(basePdfBytes);
        const signedAt = new Date();
        const pngB64 = body.signature_image_b64.replace(/^data:image\/png;base64,/, "");
        let sigImg;
        try {
          sigImg = await pdf.embedPng(Uint8Array.from(atob(pngB64), (c) => c.charCodeAt(0)));
        } catch {
          return json({ error: "invalid_signature_image" }, { status: 400 });
        }

        const pages = pdf.getPages();
        if (body.placement) {
          const idx = Math.min(body.placement.page_index, pages.length - 1);
          const page = pages[idx];
          const pageH = page.getHeight();
          const ratio = sigImg.height / sigImg.width;
          const w = body.placement.width;
          const h = w * ratio;
          const xPdf = body.placement.x;
          const yPdf = pageH - body.placement.y - h;
          page.drawImage(sigImg, { x: xPdf, y: yPdf, width: w, height: h });
          page.drawText(
            `Signé par ${req.signer_name} — ${signedAt.toISOString()}`,
            { x: xPdf, y: Math.max(yPdf - 10, 4), size: 7 },
          );
        } else {
          const page = pdf.addPage([595.28, 320]);
          const dims = sigImg.scale(0.4);
          page.drawText("SIGNATURE", { x: 50, y: 270, size: 14 });
          page.drawText(`Signataire : ${req.signer_name}`, { x: 50, y: 244, size: 11 });
          page.drawText(`Email : ${req.signer_email}`, { x: 50, y: 228, size: 10 });
          page.drawText(`Date : ${signedAt.toISOString()}`, { x: 50, y: 212, size: 10 });
          if (ip) page.drawText(`IP : ${ip}`, { x: 50, y: 196, size: 9 });
          page.drawImage(sigImg, { x: 50, y: 60, width: dims.width, height: dims.height });
        }

        // Append a summary page with both signatures (client + provider)
        try {
          const { data: creator } = doc.created_by
            ? await supabaseAdmin
                .from("profiles")
                .select("signature_image_b64, full_name, email")
                .eq("id", doc.created_by)
                .maybeSingle()
            : { data: null };

          const summary = pdf.addPage([595.28, 400]);
          const dims = sigImg.scale(0.4);
          summary.drawText("SIGNATURE CLIENT", { x: 50, y: 340, size: 12 });
          summary.drawText(`Signataire : ${req.signer_name}`, { x: 50, y: 320, size: 10 });
          summary.drawText(`Email : ${req.signer_email}`, { x: 50, y: 306, size: 9 });
          summary.drawText(`Date : ${signedAt.toISOString()}`, { x: 50, y: 292, size: 9 });
          summary.drawImage(sigImg, { x: 50, y: 100, width: dims.width, height: dims.height });

          summary.drawText("SIGNATURE PRESTATAIRE", { x: 320, y: 340, size: 12 });
          summary.drawText(`${creator?.full_name ?? org?.name ?? "—"}`, { x: 320, y: 320, size: 10 });
          if (creator?.email) summary.drawText(`Email : ${creator.email}`, { x: 320, y: 306, size: 9 });
          if (creator?.signature_image_b64) {
            const pb64 = creator.signature_image_b64.replace(/^data:image\/png;base64,/, "");
            const provImg = await pdf.embedPng(Uint8Array.from(atob(pb64), (c) => c.charCodeAt(0)));
            const pdims = provImg.scale(0.4);
            summary.drawImage(provImg, { x: 320, y: 100, width: pdims.width, height: pdims.height });
          } else {
            summary.drawText("(Signature non configurée)", { x: 320, y: 200, size: 9 });
          }
        } catch (e) {
          console.error("provider signature stamp failed:", e);
        }


        const signedBytes = await pdf.save();
        const signedHashHex = await sha256Hex(signedBytes);

        const path = `${doc.organization_id}/${doc.id}/req-${req.id}-${signedAt.getTime()}.pdf`;
        const { error: upErr } = await supabaseAdmin.storage
          .from("signed-documents")
          .upload(path, signedBytes, { contentType: "application/pdf" });
        if (upErr) return json({ error: upErr.message }, { status: 500 });

        // Bloc de conformité : niveau + auth + consentement + evidence.
        const signatureLevel = req.signature_level ?? CURRENT_SUPPORTED_LEVEL;
        const authMethod = req.auth_method_required ?? "email_link";
        try {
          assertAuthMethodAllowed(signatureLevel, authMethod);
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 400 });
        }

        const consentText = body.consent.text ?? DEFAULT_CONSENT_TEXT_FR;
        const consentAcceptedAt = signedAt.toISOString();

        const evidence: SignatureEvidence = {
          signature_level: signatureLevel,
          auth_method: authMethod,
          request_token_hint: tokenHint(params.token),
          request_id: req.id,
          signer: { name: req.signer_name, email: req.signer_email },
          consent: {
            text: consentText,
            version: CONSENT_TEXT_VERSION,
            accepted_at: consentAcceptedAt,
          },
          signed_at: consentAcceptedAt,
          original_pdf_hash_sha256: originalHashHex,
          signed_pdf_hash_sha256: signedHashHex,
          network: { ip, user_agent: ua },
          placement: body.placement ?? null,
          conformity_module_version: CONFORMITY_MODULE_VERSION,
        };

        const { data: sig, error: sigErr } = await supabaseAdmin
          .from("document_signatures")
          .insert({
            document_id: doc.id,
            share_link_id: null,
            signer_name: req.signer_name,
            signer_email: req.signer_email,
            signature_image_b64: body.signature_image_b64.slice(0, 500_000),
            ip,
            user_agent: ua,
            pdf_hash_sha256: signedHashHex,
            pdf_storage_path: path,
            signature_level: signatureLevel,
            auth_method: authMethod,
            consent_text: consentText,
            consent_accepted_at: consentAcceptedAt,
            original_pdf_hash_sha256: originalHashHex,
            evidence,
          })
          .select()
          .single();
        if (sigErr) return json({ error: sigErr.message }, { status: 500 });

        await supabaseAdmin
          .from("document_signature_requests")
          .update({
            status: "signed",
            signed_at: signedAt.toISOString(),
            signature_id: sig.id,
          })
          .eq("id", req.id);

        return json({ ok: true, signature_id: sig.id, hash: hashHex });
      },
    },
  },
});
