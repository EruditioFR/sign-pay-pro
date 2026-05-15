import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.dashboard")}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("nav.users")}</CardTitle></CardHeader>
          <CardContent>
            <Button asChild size="sm"><Link to="/admin/users">{t("nav.users")}</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("nav.settings")}</CardTitle></CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline"><Link to="/admin/settings">{t("nav.settings")}</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
