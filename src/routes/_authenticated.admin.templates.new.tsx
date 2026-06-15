import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createDocumentTemplate } from "@/lib/templates.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TemplateForm } from "@/components/template-form";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const VerticalEnum = z
  .enum(["real_estate", "car_rental", "services", "goods_sales"])
  .optional();

const searchSchema = z.object({ vertical: VerticalEnum });

const VERTICAL_LABELS: Record<string, string> = {
  real_estate: "Immobilier",
  car_rental: "Location de véhicules",
  services: "Prestations de services",
  goods_sales: "Vente de biens",
};

export const Route = createFileRoute("/_authenticated/admin/templates/new")({
  validateSearch: (raw) => searchSchema.parse(raw),
  component: NewTemplatePage,
});

function NewTemplatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { vertical } = Route.useSearch();
  const create = useServerFn(createDocumentTemplate);

  const mut = useMutation({
    mutationFn: (data: Record<string, unknown>) => create({ data: data as never }),
    onSuccess: () => {
      toast.success(t("templates.saved"));
      if (vertical) navigate({ to: "/admin/business-verticals" });
      else navigate({ to: "/admin/templates" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <Button asChild variant="ghost" size="sm">
        <Link to={vertical ? "/admin/business-verticals" : "/admin/templates"}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {vertical ? "Secteurs métiers" : t("templates.title")}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t("templates.new")}
            {vertical ? (
              <Badge variant="secondary">{VERTICAL_LABELS[vertical]}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateForm
            submitting={mut.isPending}
            onSubmit={(v) =>
              mut.mutate({
                ...v,
                logo_url: v.logo_url || null,
                document_type: (v.document_type as
                  | "purchase_order" | "quote" | "invoice" | "contract" | "other"
                  | null) ?? null,
                ...(vertical ? { business_vertical: vertical } : {}),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
