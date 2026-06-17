/**
 * Helper: load a document's current PDF (or build one from data) and return
 * it as a base64-encoded email attachment payload.
 *
 * Used by share + signature-request emails so the recipient receives the
 * PDF alongside the action link.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildDocumentPdf } from "@/lib/pdf.functions";
import type { EmailAttachment } from "@/lib/email-sender";

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack limits on large PDFs.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  // btoa is available in the Worker runtime.
  return btoa(binary);
}

function safeFilename(title: string | null | undefined, reference: string | null | undefined): string {
  const base = (reference || title || "document").toString().trim();
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "document";
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

export async function buildDocumentPdfAttachment(
  documentId: string,
): Promise<EmailAttachment | null> {
  const { data: doc } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name, country")
    .eq("id", doc.organization_id)
    .maybeSingle();

  const { data: currentFile } = await supabaseAdmin
    .from("document_files")
    .select("storage_path")
    .eq("document_id", documentId)
    .eq("is_current", true)
    .maybeSingle();

  let pdfBytes: Uint8Array | null = null;
  if (currentFile?.storage_path) {
    const { data: blob } = await supabaseAdmin.storage
      .from("documents")
      .download(currentFile.storage_path);
    if (blob) pdfBytes = new Uint8Array(await blob.arrayBuffer());
  }
  if (!pdfBytes) {
    try {
      pdfBytes = await buildDocumentPdf(doc, org ?? { name: "—", country: "FR" }, null);
    } catch {
      return null;
    }
  }
  if (!pdfBytes || pdfBytes.byteLength === 0) return null;

  return {
    filename: safeFilename(doc.title as string | null, (doc as { reference?: string | null }).reference ?? null),
    content: bytesToBase64(pdfBytes),
    content_type: "application/pdf",
  };
}
