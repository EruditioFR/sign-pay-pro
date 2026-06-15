import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteWorkflowTemplate, listWorkflowTemplates } from "@/lib/workflows.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/workflows/")({
  component: WorkflowsListPage,
});

function WorkflowsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listWorkflowTemplates);
  const del = useServerFn(deleteWorkflowTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["workflow_templates"],
    queryFn: () => list(),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow_templates"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("workflows.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("workflows.subtitle")}</p>
        </div>
        <Button onClick={() => navigate({ to: "/admin/workflows/new" })}>
          <Plus className="mr-1 h-4 w-4" />{t("documents.new")}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("workflows.title")}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : !data || data.templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.templates.map((tpl) => (
                <li key={tpl.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{tpl.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {tpl.document_type ? t(`documents.types.${tpl.document_type}`) : "—"}
                      {" · "}
                      {tpl.workflow_template_steps?.length ?? 0} étapes
                      {!tpl.active && (
                        <Badge variant="secondary" className="ml-2">{t("users.inactive")}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/admin/workflows/$id" params={{ id: tpl.id }}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <ConfirmAction
                      title="Supprimer ce modèle de workflow ?"
                      description="Le modèle sera définitivement supprimé. Les workflows déjà créés ne sont pas affectés."
                      confirmLabel="Supprimer"
                      onConfirm={() => delMut.mutateAsync(tpl.id)}
                    >
                      <Button variant="ghost" size="sm" aria-label="Supprimer">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </ConfirmAction>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
