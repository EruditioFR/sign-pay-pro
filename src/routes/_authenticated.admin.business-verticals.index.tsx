import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import {
  listBusinessVerticalsSummary,
  listVerticalTemplates,
  seedBusinessVerticalTemplates,
} from "@/lib/business-verticals.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Car,
  CheckCircle2,
  Circle,
  Home,
  PackageSearch,
  Pencil,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { ComponentType } from "react";

export const Route = createFileRoute("/_authenticated/admin/business-verticals/")({
  component: BusinessVerticalsPage,
});

type VerticalId = "real_estate" | "car_rental" | "services" | "goods_sales";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  real_estate: Home,
  car_rental: Car,
  services: Briefcase,
  goods_sales: PackageSearch,
};

const VERTICAL_IDS: VerticalId[] = ["real_estate", "car_rental", "services", "goods_sales"];

function BusinessVerticalsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listBusinessVerticalsSummary);
  const listTpls = useServerFn(listVerticalTemplates);
  const seed = useServerFn(seedBusinessVerticalTemplates);

  const { data, isLoading } = useQuery({
    queryKey: ["business_verticals"],
    queryFn: () => list(),
  });

  const perVertical = useQueries({
    queries: VERTICAL_IDS.map((id) => ({
      queryKey: ["vertical_templates", id],
      queryFn: () => listTpls({ data: { vertical: id } }),
    })),
  });

  const seedMut = useMutation({
    mutationFn: (vertical: VerticalId) => seed({ data: { vertical } }),
    onSuccess: (res) => {
      const created = res.inserted_document_templates;
      const updated = res.updated_document_templates;
      const wf = res.inserted_workflow_templates;
      toast.success(
        `${created} créé(s), ${updated} mis à jour, ${wf} circuit(s).`,
      );
      qc.invalidateQueries({ queryKey: ["business_verticals"] });
      qc.invalidateQueries({ queryKey: ["vertical_templates"] });
      qc.invalidateQueries({ queryKey: ["doc_templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Secteurs métiers
          </h1>
          <p className="text-sm text-muted-foreground">
            Importez en un clic les modèles de documents et circuits de validation dédiés à votre métier.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/templates">
            <ArrowLeft className="mr-1 h-4 w-4" /> Modèles
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data?.verticals ?? []).map((v, idx) => {
            const Icon = ICONS[v.id] ?? Sparkles;
            const tplData = perVertical[idx]?.data;
            const fullySeeded =
              v.seeded.documents >= v.documentTemplatesCount &&
              v.seeded.workflows >= v.workflowTemplatesCount;
            return (
              <Card key={v.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-5 w-5" />
                    {v.label}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{v.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {v.documentTypes.map((dt) => (
                      <Badge key={dt} variant="outline">
                        {dt}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {v.documentTemplatesCount} modèle(s) document · {v.workflowTemplatesCount} circuit(s) · {v.variables.length} variable(s) dynamique(s)
                  </div>

                  <div className="rounded-md border divide-y">
                    {(tplData?.templates ?? v.documentTemplates).map((t) => {
                      const seeded = "seeded" in t ? t.seeded : false;
                      const id = "id" in t ? t.id : null;
                      return (
                        <div
                          key={t.name}
                          className="flex items-start justify-between gap-2 p-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {seeded ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="font-medium truncate">{t.name}</span>
                              <Badge variant="secondary" className="text-[10px]">
                                {t.document_type}
                              </Badge>
                            </div>
                            {t.required_fields.length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-1 pl-6">
                                {t.required_fields.map((f) => (
                                  <code
                                    key={f}
                                    className="rounded bg-muted px-1 py-0.5 text-[10px]"
                                    title="Champ requis"
                                  >
                                    {f}
                                  </code>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          {seeded && id ? (
                            <Button asChild variant="ghost" size="sm" className="shrink-0">
                              <Link to="/app/templates/$id/edit" params={{ id }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      Variables dynamiques disponibles
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {v.variables.map((va) => (
                        <code
                          key={va.key}
                          className="rounded bg-muted px-1.5 py-0.5"
                          title={va.label}
                        >
                          {`{{${va.key}}}`}
                        </code>
                      ))}
                    </div>
                  </details>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      {v.seeded.documents}/{v.documentTemplatesCount} importés
                    </span>
                    <Button
                      size="sm"
                      onClick={() => seedMut.mutate(v.id as VerticalId)}
                      disabled={seedMut.isPending}
                      variant={fullySeeded ? "outline" : "default"}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      {fullySeeded ? "Mettre à jour" : "Importer les modèles"}
                    </Button>
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
