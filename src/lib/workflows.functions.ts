import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleEnum = z.enum(["super_admin", "reseller", "admin_client", "manager", "user"]);
const DocTypeEnum = z.enum(["purchase_order", "quote", "invoice", "contract", "other"]);

const StepSchema = z.object({
  position: z.number().int().min(1),
  name: z.string().min(1).max(100),
  approver_role: RoleEnum.optional().nullable(),
  approver_user_id: z.string().uuid().optional().nullable(),
  required: z.boolean().default(true),
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(150),
  document_type: DocTypeEnum.optional().nullable(),
  active: z.boolean().default(true),
  steps: z.array(StepSchema).min(1).max(20),
});

export const listWorkflowTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("workflow_templates")
      .select("id, name, document_type, active, created_at, workflow_template_steps(id, position, name, approver_role, approver_user_id, required)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

const TplIdSchema = z.object({ id: z.string().uuid() });

export const getWorkflowTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TplIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tpl, error } = await supabase
      .from("workflow_templates")
      .select("*, workflow_template_steps(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tpl) throw new Error("Modèle introuvable");
    return { template: tpl };
  });

export const createWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateTemplateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const { data: tpl, error } = await supabase
      .from("workflow_templates")
      .insert({
        organization_id: me.organization_id,
        name: data.name,
        document_type: data.document_type ?? null,
        active: data.active,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const stepRows = data.steps.map((s) => ({
      template_id: tpl.id,
      position: s.position,
      name: s.name,
      approver_role: s.approver_role ?? null,
      approver_user_id: s.approver_user_id ?? null,
      required: s.required,
    }));
    const { error: sErr } = await supabase.from("workflow_template_steps").insert(stepRows);
    if (sErr) throw new Error(sErr.message);

    return { template: tpl };
  });

const UpdateTemplateSchema = CreateTemplateSchema.extend({ id: z.string().uuid() });

export const updateWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateTemplateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, steps, ...patch } = data;

    const { error } = await supabase
      .from("workflow_templates")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);

    // wipe & rewrite steps
    await supabase.from("workflow_template_steps").delete().eq("template_id", id);
    const stepRows = steps.map((s) => ({
      template_id: id,
      position: s.position,
      name: s.name,
      approver_role: s.approver_role ?? null,
      approver_user_id: s.approver_user_id ?? null,
      required: s.required,
    }));
    const { error: sErr } = await supabase.from("workflow_template_steps").insert(stepRows);
    if (sErr) throw new Error(sErr.message);

    return { ok: true };
  });

export const deleteWorkflowTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TplIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("workflow_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SubmitSchema = z.object({ documentId: z.string().uuid(), templateId: z.string().uuid() });

export const submitDocumentForValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: tpl, error: tErr } = await supabase
      .from("workflow_templates")
      .select("id, organization_id, workflow_template_steps(position, name, approver_role, approver_user_id, required)")
      .eq("id", data.templateId)
      .maybeSingle();
    if (tErr || !tpl) throw new Error("Modèle introuvable");

    const { data: wf, error: wErr } = await supabase
      .from("document_workflows")
      .insert({
        document_id: data.documentId,
        template_id: tpl.id,
        status: "pending_validation",
        current_step: 1,
      })
      .select()
      .single();
    if (wErr) throw new Error(wErr.message);

    const tplSteps = (tpl.workflow_template_steps ?? []) as Array<{
      position: number;
      name: string;
      approver_role: string | null;
      approver_user_id: string | null;
      required: boolean;
    }>;
    const stepRows = tplSteps
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        workflow_id: wf.id,
        position: s.position,
        name: s.name,
        approver_role: s.approver_role,
        approver_user_id: s.approver_user_id,
        required: s.required,
        status: "pending",
      }));
    if (stepRows.length) {
      const { error: sErr } = await supabase.from("document_workflow_steps").insert(stepRows);
      if (sErr) throw new Error(sErr.message);
    }

    await supabase
      .from("documents")
      .update({ status: "pending_validation", current_workflow_id: wf.id })
      .eq("id", data.documentId);

    await supabase.from("audit_logs").insert({
      organization_id: tpl.organization_id,
      user_id: userId,
      action: "document.submitted",
      resource: `document:${data.documentId}`,
      metadata: { workflow_id: wf.id, template_id: tpl.id },
    });

    return { workflow: wf };
  });

const DecideSchema = z.object({
  stepId: z.string().uuid(),
  comment: z.string().max(2000).optional(),
});

async function decideStep(
  supabase: ReturnType<typeof createSupabaseStub>,
  userId: string,
  stepId: string,
  decision: "approved" | "rejected",
  comment?: string
) {
  const { error } = await supabase
    .from("document_workflow_steps")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: userId,
      comment: comment ?? null,
    })
    .eq("id", stepId);
  if (error) throw new Error(error.message);
}
// Type helper for the supabase client passed through middleware context.
type SupabaseClientLike = Awaited<
  ReturnType<typeof requireSupabaseAuth.context>
> extends infer T
  ? T extends { supabase: infer S }
    ? S
    : never
  : never;
function createSupabaseStub(): SupabaseClientLike {
  return undefined as unknown as SupabaseClientLike;
}

export const approveStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DecideSchema.parse(input))
  .handler(async ({ data, context }) => {
    await decideStep(context.supabase as never, context.userId, data.stepId, "approved", data.comment);
    return { ok: true };
  });

export const rejectStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DecideSchema.parse(input))
  .handler(async ({ data, context }) => {
    await decideStep(context.supabase as never, context.userId, data.stepId, "rejected", data.comment);
    return { ok: true };
  });

export const listMyPendingApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Fetch user's roles to also include role-based pending steps
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleNames = (roles ?? []).map((r) => r.role);

    const { data: directSteps } = await supabase
      .from("document_workflow_steps")
      .select(
        "id, name, position, status, approver_role, approver_user_id, decided_at, comment, document_workflows(id, status, document_id, documents(id, title, type, status, organization_id))"
      )
      .eq("status", "pending")
      .or(
        `approver_user_id.eq.${userId}${
          roleNames.length ? `,approver_role.in.(${roleNames.join(",")})` : ""
        }`
      )
      .limit(200);

    return { steps: directSteps ?? [] };
  });
