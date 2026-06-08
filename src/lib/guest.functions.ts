import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendResendEmail } from "@/lib/email-sender";

const emailSchema = z.string().trim().toLowerCase().email().max(255);
const tokenSchema = z.string().uuid();

function originFromEnv() {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.VITE_APP_URL ||
    "https://sign-pay-pro.lovable.app"
  );
}

function magicUrl(token: string) {
  return `${originFromEnv()}/guest/${token}`;
}

async function getOrCreateSession(email: string) {
  const { data: existing } = await supabaseAdmin
    .from("guest_sessions")
    .select("*")
    .ilike("email", email)
    .is("claimed_by_user_id", null)
    .maybeSingle();

  if (existing) {
    // Renew token + expiry
    const { data: updated, error } = await supabaseAdmin
      .from("guest_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        token_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { session: updated, created: false };
  }

  const { data: created, error } = await supabaseAdmin
    .from("guest_sessions")
    .insert({ email })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { session: created, created: true };
}

async function getOrCreateGuestOrg(sessionId: string, email: string) {
  const { data: existing } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("guest_session_id", sessionId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabaseAdmin
    .from("organizations")
    .insert({
      name: `Invité (${email})`,
      country: "FR",
      is_guest: true,
      guest_session_id: sessionId,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

async function loadSessionByToken(token: string) {
  const { data, error } = await supabaseAdmin
    .from("guest_sessions")
    .select("*")
    .eq("magic_token", token)
    .is("claimed_by_user_id", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lien invalide ou expiré.");
  if (new Date(data.token_expires_at).getTime() < Date.now()) {
    throw new Error("Ce lien a expiré.");
  }
  // Slide expiry
  await supabaseAdmin
    .from("guest_sessions")
    .update({
      last_seen_at: new Date().toISOString(),
      token_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    })
    .eq("id", data.id);
  return data;
}

// ------------------- Public server fns -------------------

export const createGuestCircuit = createServerFn({ method: "POST" })
  .inputValidator((data: {
    email: string;
    title: string;
    description?: string;
    amount_ttc?: number | null;
    signers: { name: string; email: string }[];
    validators?: { name: string; email: string; required?: boolean }[];
    sequential?: boolean;
  }) =>
    z
      .object({
        email: emailSchema,
        title: z.string().trim().min(1).max(150),
        description: z.string().trim().max(2000).optional(),
        amount_ttc: z.number().nonnegative().nullable().optional(),
        sequential: z.boolean().optional(),
        signers: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              email: emailSchema,
            })
          )
          .min(1)
          .max(10),
        validators: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              email: emailSchema,
              required: z.boolean().optional(),
            })
          )
          .max(10)
          .optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { session, created } = await getOrCreateSession(data.email);
    const orgId = await getOrCreateGuestOrg(session.id, data.email);

    const hasValidators = (data.validators?.length ?? 0) > 0;

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .insert({
        organization_id: orgId,
        created_by: null,
        title: data.title,
        description: data.description ?? null,
        amount_ttc: data.amount_ttc ?? null,
        type: "other",
        status: hasValidators ? "pending_validation" : "pending_validation",
        guest_session_id: session.id,
      } as never)
      .select("id, title")
      .single();
    if (docErr) throw new Error(docErr.message);

    // Signers
    if (data.signers.length > 0) {
      const rows = data.signers.map((s, i) => ({
        document_id: doc.id,
        signer_name: s.name,
        signer_email: s.email,
        order_index: i + 1,
        sequential: data.sequential ?? false,
        invited_by: null,
      }));
      const { error: sigErr } = await supabaseAdmin
        .from("document_signature_requests")
        .insert(rows as never);
      if (sigErr) throw new Error(sigErr.message);
    }

    // Validation workflow (invité, sans utilisateur authentifié)
    if (hasValidators) {
      const { data: wf, error: wfErr } = await supabaseAdmin
        .from("document_workflows")
        .insert({
          document_id: doc.id,
          status: "pending_validation",
          current_step: 1,
          guest_session_id: session.id,
        } as never)
        .select("id")
        .single();
      if (wfErr) throw new Error(wfErr.message);

      const stepRows = data.validators!.map((v, i) => ({
        workflow_id: wf.id,
        position: i + 1,
        name: `Validation de ${v.name}`,
        approver_email: v.email,
        approver_name: v.name,
        required: v.required ?? true,
        status: "pending" as const,
      }));
      const { data: steps, error: stErr } = await supabaseAdmin
        .from("document_workflow_steps")
        .insert(stepRows as never)
        .select("id, approval_token, approver_email, approver_name, name");
      if (stErr) throw new Error(stErr.message);

      // Send approval emails
      for (const st of steps ?? []) {
        try {
          const approveUrl = `${originFromEnv()}/approve/${(st as { approval_token: string }).approval_token}`;
          await sendResendEmail({
            to: (st as { approver_email: string }).approver_email,
            subject: `Validation requise : ${data.title}`,
            html: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#111">
              <h2>Une validation vous est demandée</h2>
              <p>Bonjour ${escapeHtml((st as { approver_name: string }).approver_name)},</p>
              <p>${escapeHtml(data.email)} vous demande de valider le document « <strong>${escapeHtml(data.title)}</strong> ».</p>
              <p><a href="${approveUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Examiner et décider</a></p>
              <p style="font-size:12px;color:#666">Lien : ${approveUrl}</p>
            </body></html>`,
          });
        } catch (e) {
          console.error("[guest] validator email failed", e);
        }
      }
    }

    // Email creator
    try {
      const url = magicUrl(session.magic_token);
      await sendResendEmail({
        to: data.email,
        subject: created
          ? "Votre espace invité — circuit créé"
          : "Nouveau circuit créé sur votre espace invité",
        html: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#111">
          <h2>Votre circuit est en route</h2>
          <p>Bonjour,</p>
          <p>Le circuit « <strong>${escapeHtml(data.title)}</strong> » a bien été créé.
          ${hasValidators ? `Vos validateurs ont reçu un email d'invitation.` : ""}
          Vous pouvez le suivre via le lien sécurisé ci-dessous :</p>
          <p><a href="${url}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Ouvrir mon espace</a></p>
          <p style="font-size:12px;color:#666">Ou copiez ce lien : <br/>${url}</p>
        </body></html>`,
      });
    } catch (e) {
      console.error("[guest] email failed", e);
    }

    return { ok: true, document_id: doc.id, magic_token: session.magic_token };
  });

export const requestGuestMagicLink = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) =>
    z.object({ email: emailSchema }).parse(data)
  )
  .handler(async ({ data }) => {
    const { data: session } = await supabaseAdmin
      .from("guest_sessions")
      .select("*")
      .ilike("email", data.email)
      .is("claimed_by_user_id", null)
      .maybeSingle();

    if (session) {
      // rotate expiry
      await supabaseAdmin
        .from("guest_sessions")
        .update({
          token_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        })
        .eq("id", session.id);

      try {
        const url = magicUrl(session.magic_token);
        await sendResendEmail({
          to: data.email,
          subject: "Votre lien d'accès à votre espace invité",
          html: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;color:#111">
            <h2>Voici votre lien d'accès</h2>
            <p><a href="${url}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Ouvrir mon espace</a></p>
            <p style="font-size:12px;color:#666">${url}</p>
          </body></html>`,
        });
      } catch (e) {
        console.error("[guest] resend email failed", e);
      }
    }

    // Toujours la même réponse (anti-énumération)
    return { ok: true };
  });

export const getGuestDashboard = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) =>
    z.object({ token: tokenSchema }).parse(data)
  )
  .handler(async ({ data }) => {
    const session = await loadSessionByToken(data.token);

    const { data: documents, error } = await supabaseAdmin
      .from("documents")
      .select("id, title, status, amount_ttc, created_at")
      .eq("guest_session_id", session.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const docIds = (documents ?? []).map((d) => d.id);
    let signers: Array<{
      document_id: string;
      signer_name: string;
      signer_email: string;
      status: string;
      order_index: number;
    }> = [];
    if (docIds.length > 0) {
      const { data: sigs } = await supabaseAdmin
        .from("document_signature_requests")
        .select("document_id, signer_name, signer_email, status, order_index")
        .in("document_id", docIds);
      signers = (sigs ?? []) as typeof signers;
    }

    let workflowSteps: Array<{
      document_id: string;
      position: number;
      name: string;
      status: string;
      approver_name: string | null;
      approver_email: string | null;
      decided_at: string | null;
      comment: string | null;
    }> = [];
    if (docIds.length > 0) {
      const { data: wfs } = await supabaseAdmin
        .from("document_workflows")
        .select("id, document_id, document_workflow_steps(position, name, status, approver_name, approver_email, decided_at, comment)")
        .in("document_id", docIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const wf of (wfs ?? []) as any[]) {
        for (const st of wf.document_workflow_steps ?? []) {
          workflowSteps.push({ document_id: wf.document_id, ...st });
        }
      }
    }

    return {
      session: { email: session.email },
      documents: documents ?? [],
      signers,
      workflowSteps,
    };
  });

export const cancelGuestSignerRequest = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; request_id: string }) =>
    z.object({ token: tokenSchema, request_id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }) => {
    const session = await loadSessionByToken(data.token);

    // Verify ownership via join
    const { data: req } = await supabaseAdmin
      .from("document_signature_requests")
      .select("id, document_id, documents!inner(guest_session_id)")
      .eq("id", data.request_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ownerSession = (req as any)?.documents?.guest_session_id;
    if (!req || ownerSession !== session.id) {
      throw new Error("Requête introuvable.");
    }

    const { error } = await supabaseAdmin
      .from("document_signature_requests")
      .update({ status: "cancelled" } as never)
      .eq("id", data.request_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
