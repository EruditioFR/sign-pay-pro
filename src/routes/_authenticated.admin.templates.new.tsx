import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createDocumentTemplate } from "@/lib/templates.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateForm } from "@/components/template-form";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/templates/new")({
  component: NewTemplatePage,
});

function NewTemplatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useServerFn(createDocumentTemplate);

  const mut = useMutation({
    mutationFn: (data: Record<string, unknown>) => create({ data: data as never }),
    onSuccess: () => {
      toast.success(t("templates.saved"));
      navigate({ to: "/admin/templates" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/templates"><ArrowLeft className="mr-1 h-4 w-4" />{t("templates.title")}</Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>{t("templates.new")}</CardTitle></CardHeader>
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
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
