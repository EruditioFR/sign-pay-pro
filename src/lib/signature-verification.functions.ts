/**
 * Signature integrity verification & audit trail export.
 *
 * - `verifyDocumentSignaturesIntegrity` : re-télécharge chaque PDF signé
 *   depuis le bucket `signed-documents`, recalcule le SHA-256 et compare
 *   avec `document_signatures.pdf_hash_sha256`. Une divergence est
 *   immédiatement journalisée dans `audit_logs` avec
 *   `action = 'signature.integrity_failed'`.
 *
 * - `exportSignatureAuditTrail` : retourne une piste d'audit structurée
 *   (signataires, IP, user-agent, consentement, niveau, hashes) directement
 *   exportable en JSON par l'UI.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sha256Hex } from "@/lib/signature-conformity";

const DocIdSchema = z.object({ document_id: z.string().uuid() });

export type SignatureIntegrityCheck = {
  signature_id: string;
  signer_email: string | null;
  signer_name: string;
  signed_at: string;
  signature_level: string;
  expected_hash: string | null;
  actual_hash: string | null;
  storage_path: string | null;
  /** true = PDF intact ; false = altéré ; null = non vérifiable (PDF absent). */
  ok: boolean | null;
  reason?: string;
};

export const verifyDocumentSignaturesIntegrity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DocIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS garantit que l'utilisateur a le droit d'accéder au document.
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, organization_id")
      .eq("id", data.document_id)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document introuvable");

    const { data: sigs, error: sigsErr } = await supabase
      .from("document_signatures")
      .select(
        "id, signer_name, signer_email, signed_at, signature_level, pdf_hash_sha256, pdf_storage_path",
      )
      .eq("document_id", data.document_id)
      .order("signed_at", { ascending: true });
    if (sigsErr) throw new Error(sigsErr.message);

    // Téléchargement des PDFs signés : le bucket est privé, on passe par
    // le client admin (RLS bypass) UNIQUEMENT pour le download de l'objet
    // déjà autorisé via la lecture RLS des signatures ci-dessus.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const checks: SignatureIntegrityCheck[] = [];
    for (const s of sigs ?? []) {
      const base = {
        signature_id: s.id,
        signer_email: s.signer_email,
        signer_name: s.signer_name,
        signed_at: s.signed_at,
        signature_level: s.signature_level as string,
        expected_hash: s.pdf_hash_sha256,
        storage_path: s.pdf_storage_path,
      };

      if (!s.pdf_storage_path || !s.pdf_hash_sha256) {
        checks.push({ ...base, actual_hash: null, ok: null, reason: "no_stored_pdf" });
        continue;
      }

      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from("signed-documents")
        .download(s.pdf_storage_path);
      if (dlErr || !blob) {
        checks.push({ ...base, actual_hash: null, ok: null, reason: "download_failed" });
        continue;
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const actual = await sha256Hex(bytes);
      const ok = actual === s.pdf_hash_sha256;
      checks.push({ ...base, actual_hash: actual, ok });

      if (!ok) {
        // Journal d'audit : altération détectée à la consultation.
        await supabaseAdmin.from("audit_logs").insert({
          organization_id: doc.organization_id,
          user_id: userId,
          action: "signature.integrity_failed",
          resource: `document:${doc.id}`,
          metadata: {
            signature_id: s.id,
            signer_email: s.signer_email,
            expected_hash: s.pdf_hash_sha256,
            actual_hash: actual,
            storage_path: s.pdf_storage_path,
            checked_at: new Date().toISOString(),
          },
        });
      }
    }

    const summary = {
      total: checks.length,
      verified: checks.filter((c) => c.ok === true).length,
      altered: checks.filter((c) => c.ok === false).length,
      unverifiable: checks.filter((c) => c.ok === null).length,
      checked_at: new Date().toISOString(),
    };

    return { checks, summary };
  });

export const exportSignatureAuditTrail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DocIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select(
        "id, type, title, reference, document_number, invoice_number, organization_id, created_at",
      )
      .eq("id", data.document_id)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document introuvable");

    const { data: sigs, error: sigsErr } = await supabase
      .from("document_signatures")
      .select("*")
      .eq("document_id", data.document_id)
      .order("signed_at", { ascending: true });
    if (sigsErr) throw new Error(sigsErr.message);

    const { data: requests } = await supabase
      .from("document_signature_requests")
      .select(
        "id, signer_name, signer_email, order_index, status, sequential, signature_level, auth_method_required, expires_at, created_at, signed_at, declined_at, decline_reason",
      )
      .eq("document_id", data.document_id)
      .order("order_index", { ascending: true });

    const { data: logs } = await supabase
      .from("audit_logs")
      .select("id, action, user_id, metadata, created_at")
      .eq("resource", `document:${data.document_id}`)
      .order("created_at", { ascending: true })
      .limit(500);

    const signatures = (sigs ?? []).map((s) => ({
      signature_id: s.id,
      signature_level: s.signature_level,
      auth_method: s.auth_method,
      signer: { name: s.signer_name, email: s.signer_email },
      signed_at: s.signed_at,
      consent: {
        text: s.consent_text,
        accepted_at: s.consent_accepted_at,
      },
      network: {
        ip: s.ip,
        user_agent: s.user_agent,
        country: s.country,
        timezone: s.timezone,
      },
      hashes: {
        original_pdf_sha256: s.original_pdf_hash_sha256,
        signed_pdf_sha256: s.pdf_hash_sha256,
      },
      storage_path: s.pdf_storage_path,
      evidence: s.evidence,
    }));

    return {
      generated_at: new Date().toISOString(),
      document: {
        id: doc.id,
        type: doc.type,
        title: doc.title,
        legal_number: doc.document_number ?? doc.invoice_number ?? doc.reference ?? null,
        organization_id: doc.organization_id,
        created_at: doc.created_at,
      },
      signature_requests: requests ?? [],
      signatures,
      audit_log: (logs ?? []).filter((l) =>
        (l.action as string).startsWith("signature.") ||
        (l.action as string).startsWith("document.signed") ||
        (l.action as string).startsWith("document.multi_signed"),
      ),
    };
  });
