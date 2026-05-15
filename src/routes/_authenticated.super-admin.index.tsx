import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/super-admin/")({
  component: () => {
    const { t } = useTranslation();
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Super Admin</h1>
        <Card>
          <CardHeader><CardTitle>{t("nav.tenants")}</CardTitle></CardHeader>
          <CardContent>
            <Button asChild size="sm"><Link to="/super-admin/tenants">{t("nav.tenants")}</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  },
});
