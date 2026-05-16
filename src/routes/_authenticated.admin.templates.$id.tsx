import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDocumentTemplate, updateDocumentTemplate } from "@/lib/templates.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateForm } from "@/components/template-form";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/templates/$id")({
  component: EditTemplatePage,
});

function EditTemplatePage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const get = useServerFn(getDocumentTemplate);
  const update = useServerFn(updateDocumentTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["doc_template", id],
    queryFn: () => get({ data: { id } }),
  });

  const mut = useMutation({
    mutationFn: (patch: Record<string, unknown>) => update({ data: patch as never }),
    onSuccess: () => {
      toast.success(t("templates.saved"));
      qc.invalidateQueries({ queryKey: ["doc_template", id] });
      qc.invalidateQueries({ queryKey: ["doc_templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const tpl = data.template;

  return (
    <div className="space-y-4 max-w-3xl">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/templates"><ArrowLeft className="mr-1 h-4 w-4" />{t("templates.title")}</Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>{tpl.name}</CardTitle></CardHeader>
        <CardContent>
          <TemplateForm
            initial={{
              name: tpl.name,
              document_type: tpl.document_type,
              logo_url: tpl.logo_url ?? "",
              primary_color: tpl.primary_color ?? "#1f2937",
              legal_mentions: tpl.legal_mentions ?? "",
              payment_terms: tpl.payment_terms ?? "",
              iban: tpl.iban ?? "",
              bic: tpl.bic ?? "",
              vat_number: tpl.vat_number ?? "",
              active: tpl.active,
              is_default: tpl.is_default,
            }}
            submitting={mut.isPending}
            onSubmit={(v) =>
              mut.mutate({
                id,
                ...v,
                logo_url: v.logo_url || null,
                document_type: (v.document_type as
                  | "purchase_order" | "quote" | "invoice" | "contract" | "other"
                  | null) ?? null,
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
