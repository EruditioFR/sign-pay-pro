/**
 * Publishes a signed PDF as the new current version of a document in
 * `document_files`, so the user immediately sees the signed PDF in the
 * document's files list. Best-effort: errors are logged but never thrown.
 *
 * Ordering is important: we insert the new "current" row FIRST, and only
 * then mark previous versions as non-current. If we did it the other way
 * around (and the insert failed for any reason), the document would end
 * up with no current file at all.
 */
export async function publishSignedPdfAsCurrentFile(params: {
  supabaseAdmin: any;
  organizationId: string;
  documentId: string;
  documentType: string;
  documentReference: string | null;
  signedBytes: Uint8Array;
  signedAt: Date;
  uploadedBy: string | null;
}) {
  const {
    supabaseAdmin,
    organizationId,
    documentId,
    documentType,
    documentReference,
    signedBytes,
    signedAt,
    uploadedBy,
  } = params;
  try {
    const docPath = `${organizationId}/${documentId}/${signedAt.getTime()}-signed.pdf`;
    const { error: docUpErr } = await supabaseAdmin.storage
      .from("documents")
      .upload(docPath, signedBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (docUpErr) {
      console.error("publishSignedPdfAsCurrentFile upload failed:", docUpErr.message);
      return;
    }

    // Resolve a fallback uploader (document creator) when none is provided.
    let resolvedUploadedBy = uploadedBy;
    if (!resolvedUploadedBy) {
      const { data: docRow } = await supabaseAdmin
        .from("documents")
        .select("created_by")
        .eq("id", documentId)
        .maybeSingle();
      resolvedUploadedBy = docRow?.created_by ?? null;
    }

    const { data: prev } = await supabaseAdmin
      .from("document_files")
      .select("version")
      .eq("document_id", documentId)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (prev?.[0]?.version ?? 0) + 1;

    // Insert FIRST so we never end up without a current file.
    const { error: insErr } = await supabaseAdmin.from("document_files").insert({
      document_id: documentId,
      version: nextVersion,
      storage_path: docPath,
      file_name: `${documentType}-${documentReference ?? documentId.slice(0, 8)}-signed.pdf`,
      mime_type: "application/pdf",
      size_bytes: signedBytes.byteLength,
      uploaded_by: resolvedUploadedBy,
      is_current: true,
    });
    if (insErr) {
      console.error("publishSignedPdfAsCurrentFile insert failed:", insErr.message);
      return;
    }

    // Now flip every other version to non-current.
    const { error: updErr } = await supabaseAdmin
      .from("document_files")
      .update({ is_current: false })
      .eq("document_id", documentId)
      .neq("storage_path", docPath);
    if (updErr) {
      console.error("publishSignedPdfAsCurrentFile update is_current failed:", updErr.message);
    }
  } catch (e) {
    console.error("publishSignedPdfAsCurrentFile failed:", e);
  }
}

/**
 * Backfill: when a document is already signed but its signed PDF was never
 * promoted into `document_files` (older code path), copy the latest signature's
 * PDF from `signed-documents` to `documents` and add a new current row.
 * Idempotent: if a `-signed.pdf` already exists as current, no-op.
 */
export async function ensureSignedPdfInFiles(
  supabaseAdmin: any,
  documentId: string,
): Promise<boolean> {
  try {
    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("id, organization_id, type, reference, status, created_by")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc) return false;
    if (!["signed", "paid", "partially_paid", "archived"].includes(doc.status)) return false;

    const { data: files } = await supabaseAdmin
      .from("document_files")
      .select("id, storage_path, is_current")
      .eq("document_id", documentId);
    const alreadyPublished = (files ?? []).some(
      (f: any) => f.is_current && typeof f.storage_path === "string" && f.storage_path.endsWith("-signed.pdf"),
    );
    if (alreadyPublished) return false;

    const { data: sig } = await supabaseAdmin
      .from("document_signatures")
      .select("pdf_storage_path, signed_at, created_at")
      .eq("document_id", documentId)
      .not("pdf_storage_path", "is", null)
      .order("signed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!sig?.pdf_storage_path) return false;

    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from("signed-documents")
      .download(sig.pdf_storage_path);
    if (dlErr || !blob) {
      console.error("ensureSignedPdfInFiles download failed:", dlErr?.message);
      return false;
    }
    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const signedAt = sig.signed_at ? new Date(sig.signed_at) : new Date();
    await publishSignedPdfAsCurrentFile({
      supabaseAdmin,
      organizationId: doc.organization_id,
      documentId,
      documentType: doc.type,
      documentReference: doc.reference ?? null,
      signedBytes: bytes,
      signedAt,
      uploadedBy: doc.created_by ?? null,
    });
    return true;
  } catch (e) {
    console.error("ensureSignedPdfInFiles failed:", e);
    return false;
  }
}
