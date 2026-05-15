import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: () => {
    const { t } = useTranslation();
    return (
      <Card>
        <CardHeader><CardTitle>{t("nav.settings")}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">{t("dashboard.coming_soon")}</CardContent>
      </Card>
    );
  },
});
