import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentUser } from "@/lib/auth.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, FileCheck2, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({
  component: UserDashboard,
});

function UserDashboard() {
  const { t } = useTranslation();
  const fetchMe = useServerFn(getCurrentUser);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("dashboard.welcome", { name: me?.fullName ?? "" })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.your_role")} : {me ? t(`roles.${me.primaryRole}`) : "—"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={FileText} label={t("dashboard.documents_in_progress")} value="0" />
        <StatCard icon={FileCheck2} label={t("dashboard.documents_signed")} value="0" />
        <StatCard icon={Clock} label={t("dashboard.documents_pending")} value="0" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.quick_actions")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("dashboard.coming_soon")}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="rounded-md bg-primary/10 p-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
