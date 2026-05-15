import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkflowTemplate, updateWorkflowTemplate } from "@/lib/workflows.functions";
import { WorkflowTemplateEditor, type TemplatePayload } from "@/components/workflow-template-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/workflows/$id")({
  component: EditWorkflowPage,
});

function EditWorkflowPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fetchTpl = useServerFn(getWorkflowTemplate);
  const update = useServerFn(updateWorkflowTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["workflow_template", id],
    queryFn: () => fetchTpl({ data: { id } }),
  });

  const mut = useMutation({
    mutationFn: (payload: TemplatePayload) => update({ data: { id, ...payload } }),
    onSuccess: () => {
      toast.success(t("common.save"));
      navigate({ to: "/admin/workflows" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const tpl = data.template as {
    name: string;
    document_type: TemplatePayload["document_type"];
    active: boolean;
    workflow_template_steps: TemplatePayload["steps"];
  };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/workflows"><ArrowLeft className="mr-1 h-4 w-4" />{t("workflows.title")}</Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>{tpl.name}</CardTitle></CardHeader>
        <CardContent>
          <WorkflowTemplateEditor
            initial={{
              name: tpl.name,
              document_type: tpl.document_type,
              active: tpl.active,
              steps: tpl.workflow_template_steps,
            }}
            submitLabel={t("common.save")}
            onSubmit={(p) => mut.mutate(p)}
            busy={mut.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
