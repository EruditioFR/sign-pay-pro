import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BUSINESS_VERTICALS, type BusinessVerticalId } from "./business-verticals";

const VerticalSchema = z.object({
  vertical: z.enum(["real_estate", "car_rental", "services", "goods_sales"]),
});

/**
 * Seed (idempotent) all document & workflow templates for a given business
 * vertical into the caller's organization. Skips templates that already exist
 * (matched on name + business_vertical).
 */
export const seedBusinessVerticalTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => VerticalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vertical = data.vertical as BusinessVerticalId;
    const def = BUSINESS_VERTICALS.find((v) => v.id === vertical);
    if (!def) throw new Error("Secteur métier inconnu");

    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");
    const orgId = me.organization_id;

    // Existing document templates for this vertical (avoid duplicates)
    const { data: existingDocs } = await supabase
      .from("document_templates")
      .select("name")
      .eq("organization_id", orgId)
      .eq("business_vertical", vertical);
    const existingDocNames = new Set((existingDocs ?? []).map((r) => r.name));

    const docRows = def.documentTemplates
      .filter((p) => !existingDocNames.has(p.name))
      .map((p) => ({
        organization_id: orgId,
        business_vertical: vertical,
        name: p.name,
        document_type: p.document_type,
        primary_color: p.primary_color ?? "#1f2937",
        header_html: p.header_html ?? null,
        footer_html: p.footer_html ?? null,
        legal_mentions: p.legal_mentions ?? null,
        payment_terms: p.payment_terms ?? null,
        active: true,
        is_default: false,
      }));

    let insertedDocs = 0;
    if (docRows.length > 0) {
      const { error } = await supabase.from("document_templates").insert(docRows);
      if (error) throw new Error(error.message);
      insertedDocs = docRows.length;
    }

    // Existing workflow templates
    const { data: existingWf } = await supabase
      .from("workflow_templates")
      .select("name")
      .eq("organization_id", orgId)
      .eq("business_vertical", vertical);
    const existingWfNames = new Set((existingWf ?? []).map((r) => r.name));

    let insertedWorkflows = 0;
    for (const wf of def.workflowTemplates) {
      if (existingWfNames.has(wf.name)) continue;
      const { data: created, error: wErr } = await supabase
        .from("workflow_templates")
        .insert({
          organization_id: orgId,
          business_vertical: vertical,
          name: wf.name,
          document_type: wf.document_type,
          active: true,
        })
        .select()
        .single();
      if (wErr) throw new Error(wErr.message);

      const stepRows = wf.steps.map((s) => ({
        template_id: created.id,
        position: s.position,
        name: s.name,
        approver_role: s.approver_role,
        required: s.required,
      }));
      const { error: sErr } = await supabase
        .from("workflow_template_steps")
        .insert(stepRows);
      if (sErr) throw new Error(sErr.message);
      insertedWorkflows += 1;
    }

    return {
      vertical,
      inserted_document_templates: insertedDocs,
      inserted_workflow_templates: insertedWorkflows,
    };
  });

export const listBusinessVerticalsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id) throw new Error("Organisation introuvable");

    const [{ data: docs }, { data: wfs }] = await Promise.all([
      supabase
        .from("document_templates")
        .select("business_vertical")
        .eq("organization_id", me.organization_id)
        .not("business_vertical", "is", null),
      supabase
        .from("workflow_templates")
        .select("business_vertical")
        .eq("organization_id", me.organization_id)
        .not("business_vertical", "is", null),
    ]);

    const counts: Record<string, { documents: number; workflows: number }> = {};
    for (const v of BUSINESS_VERTICALS) counts[v.id] = { documents: 0, workflows: 0 };
    for (const r of docs ?? []) {
      const k = r.business_vertical as string;
      if (counts[k]) counts[k].documents += 1;
    }
    for (const r of wfs ?? []) {
      const k = r.business_vertical as string;
      if (counts[k]) counts[k].workflows += 1;
    }

    return {
      verticals: BUSINESS_VERTICALS.map((v) => ({
        id: v.id,
        label: v.label,
        description: v.description,
        documentTypes: v.documentTypes,
        variables: v.variables,
        documentTemplatesCount: v.documentTemplates.length,
        workflowTemplatesCount: v.workflowTemplates.length,
        seeded: counts[v.id],
      })),
    };
  });
