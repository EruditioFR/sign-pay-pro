import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createWorkflowTemplate } from "@/lib/workflows.functions";
import { WorkflowTemplateEditor, type TemplatePayload } from "@/components/workflow-template-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/workflows/new")({
  component: NewWorkflowPage,
});

function NewWorkflowPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useServerFn(createWorkflowTemplate);

  const mut = useMutation({
    mutationFn: (payload: TemplatePayload) => create({ data: payload }),
    onSuccess: () => {
      toast.success(t("documents.created"));
      navigate({ to: "/admin/workflows" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/workflows"><ArrowLeft className="mr-1 h-4 w-4" />{t("workflows.title")}</Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>{t("documents.new")}</CardTitle></CardHeader>
        <CardContent>
          <WorkflowTemplateEditor
            submitLabel={t("common.save")}
            onSubmit={(p) => mut.mutate(p)}
            busy={mut.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
