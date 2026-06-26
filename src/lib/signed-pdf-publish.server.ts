/**
 * Publishes a signed PDF as the new current version of a document in
 * `document_files`, so the user immediately sees the signed PDF in the
 * document's files list. Best-effort: errors are logged but never thrown.
 */
export async function publishSignedPdfAsCurrentFile(params: {
  supabaseAdmin: {
    storage: {
      from: (b: string) => {
        upload: (
          p: string,
          d: Uint8Array,
          o: { contentType: string; upsert?: boolean },
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    from: (t: string) => any;
  };
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
        upsert: false,
      });
    if (docUpErr) {
      console.error("publishSignedPdfAsCurrentFile upload failed:", docUpErr.message);
      return;
    }

    await supabaseAdmin
      .from("document_files")
      .update({ is_current: false })
      .eq("document_id", documentId);

    const { data: prev } = await supabaseAdmin
      .from("document_files")
      .select("version")
      .eq("document_id", documentId)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (prev?.[0]?.version ?? 0) + 1;

    await supabaseAdmin.from("document_files").insert({
      document_id: documentId,
      version: nextVersion,
      storage_path: docPath,
      file_name: `${documentType}-${documentReference ?? documentId.slice(0, 8)}-signed.pdf`,
      mime_type: "application/pdf",
      size_bytes: signedBytes.byteLength,
      uploaded_by: uploadedBy,
      is_current: true,
    });
  } catch (e) {
    console.error("publishSignedPdfAsCurrentFile failed:", e);
  }
}
