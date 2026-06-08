import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const tokenSchema = z.string().uuid();

export const getGuestApprovalStep = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) =>
    z.object({ token: tokenSchema }).parse(data)
  )
  .handler(async ({ data }) => {
    const { data: step, error } = await supabaseAdmin
      .from("document_workflow_steps")
      .select(
        "id, name, position, status, approver_name, approver_email, decided_at, comment, workflow_id, document_workflows!inner(document_id, status, documents!inner(id, title, description, amount_ttc, status))"
      )
      .eq("approval_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!step) throw new Error("Lien invalide.");
    return { step };
  });

export const decideGuestApprovalStep = createServerFn({ method: "POST" })
  .inputValidator((data: {
    token: string;
    decision: "approve" | "reject";
    comment?: string;
  }) =>
    z
      .object({
        token: tokenSchema,
        decision: z.enum(["approve", "reject"]),
        comment: z.string().trim().max(2000).optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { data: step, error } = await supabaseAdmin
      .from("document_workflow_steps")
      .select("id, status, workflow_id, position")
      .eq("approval_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!step) throw new Error("Lien invalide.");
    if (step.status !== "pending") {
      throw new Error("Cette étape a déjà été traitée.");
    }

    // Enforce sequential order: previous required steps must be approved
    const { data: prev } = await supabaseAdmin
      .from("document_workflow_steps")
      .select("position, status, required")
      .eq("workflow_id", step.workflow_id)
      .lt("position", step.position);
    const blocking = (prev ?? []).find(
      (s) => s.required && s.status !== "approved"
    );
    if (blocking) {
      throw new Error("Les étapes précédentes ne sont pas encore validées.");
    }

    const newStatus = data.decision === "approve" ? "approved" : "rejected";
    const { error: uErr } = await supabaseAdmin
      .from("document_workflow_steps")
      .update({
        status: newStatus,
        decided_at: new Date().toISOString(),
        decided_by: null,
        comment: data.comment ?? null,
      } as never)
      .eq("id", step.id);
    if (uErr) throw new Error(uErr.message);

    return { ok: true, status: newStatus };
  });
