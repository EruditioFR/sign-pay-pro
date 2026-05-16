import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDocumentTemplates, deleteDocumentTemplate } from "@/lib/templates.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/templates/")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(listDocumentTemplates);
  const del = useServerFn(deleteDocumentTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["doc_templates"],
    queryFn: () => list(),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success(t("templates.deleted"));
      qc.invalidateQueries({ queryKey: ["doc_templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = data?.templates ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("templates.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("templates.subtitle")}</p>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/templates/new"><Plus className="mr-1 h-4 w-4" />{t("templates.new")}</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("templates.empty")}</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((tpl) => (
            <Card key={tpl.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{tpl.name}</CardTitle>
                  <div className="flex gap-1">
                    {tpl.is_default && <Badge variant="secondary">{t("templates.is_default")}</Badge>}
                    {!tpl.active && <Badge variant="outline">—</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {tpl.document_type ? t(`documents.types.${tpl.document_type}`) : "—"}
                </p>
                <div className="flex gap-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/admin/templates/$id" params={{ id: tpl.id }}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(t("templates.delete_confirm"))) delMut.mutate(tpl.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
