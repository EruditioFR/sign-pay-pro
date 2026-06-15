import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listDocumentTemplates, deleteDocumentTemplate } from "@/lib/templates.functions";
import { BUSINESS_VERTICALS } from "@/lib/business-verticals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/templates/")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(listDocumentTemplates);
  const del = useServerFn(deleteDocumentTemplate);
  const [verticalFilter, setVerticalFilter] = useState<string>("all");

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

  const allTemplates = (data?.templates ?? []) as Array<
    Record<string, unknown> & {
      id: string;
      name: string;
      document_type: string | null;
      business_vertical?: string | null;
      is_default?: boolean;
      active?: boolean;
    }
  >;
  const templates =
    verticalFilter === "all"
      ? allTemplates
      : verticalFilter === "none"
        ? allTemplates.filter((tpl) => !tpl.business_vertical)
        : allTemplates.filter((tpl) => tpl.business_vertical === verticalFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t("templates.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("templates.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/business-verticals">
              <Building2 className="mr-1 h-4 w-4" /> Secteurs métiers
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/admin/templates/new"><Plus className="mr-1 h-4 w-4" />{t("templates.new")}</Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filtrer par métier :</span>
        <Select value={verticalFilter} onValueChange={setVerticalFilter}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modèles</SelectItem>
            <SelectItem value="none">Sans métier</SelectItem>
            {BUSINESS_VERTICALS.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("templates.empty")}</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((tpl) => {
            const vertical = BUSINESS_VERTICALS.find((v) => v.id === tpl.business_vertical);
            return (
            <Card key={tpl.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{tpl.name}</CardTitle>
                  <div className="flex gap-1">
                    {vertical && <Badge variant="secondary">{vertical.label}</Badge>}
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
                  <ConfirmAction
                    title="Supprimer ce modèle ?"
                    description={t("templates.delete_confirm")}
                    confirmLabel="Supprimer"
                    onConfirm={() => delMut.mutateAsync(tpl.id)}
                  >
                    <Button size="sm" variant="ghost" aria-label="Supprimer">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </ConfirmAction>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

