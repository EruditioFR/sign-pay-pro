import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listBusinessVerticalsSummary,
  seedBusinessVerticalTemplates,
} from "@/lib/business-verticals.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Briefcase, Building2, Car, Home, PackageSearch, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ComponentType } from "react";

export const Route = createFileRoute("/_authenticated/admin/business-verticals/")({
  component: BusinessVerticalsPage,
});

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  real_estate: Home,
  car_rental: Car,
  services: Briefcase,
  goods_sales: PackageSearch,
};

function BusinessVerticalsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listBusinessVerticalsSummary);
  const seed = useServerFn(seedBusinessVerticalTemplates);

  const { data, isLoading } = useQuery({
    queryKey: ["business_verticals"],
    queryFn: () => list(),
  });

  const seedMut = useMutation({
    mutationFn: (vertical: "real_estate" | "car_rental" | "services" | "goods_sales") =>
      seed({ data: { vertical } }),
    onSuccess: (res) => {
      toast.success(
        `Importé : ${res.inserted_document_templates} modèle(s) document, ${res.inserted_workflow_templates} circuit(s).`,
      );
      qc.invalidateQueries({ queryKey: ["business_verticals"] });
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
          {(data?.verticals ?? []).map((v) => {
            const Icon = ICONS[v.id] ?? Sparkles;
            const alreadySeeded =
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
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      Variables dynamiques
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
                      onClick={() => seedMut.mutate(v.id)}
                      disabled={seedMut.isPending || alreadySeeded}
                    >
                      {alreadySeeded ? "Déjà importé" : "Importer les modèles"}
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
