import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentUser } from "@/lib/auth.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const fetchMe = useServerFn(getCurrentUser);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("nav.profile")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div><span className="text-muted-foreground">{t("auth.full_name")} : </span>{me?.fullName}</div>
        <div><span className="text-muted-foreground">{t("auth.email")} : </span>{me?.email}</div>
        <div><span className="text-muted-foreground">{t("dashboard.your_org")} : </span>{me?.organizationName}</div>
        <div><span className="text-muted-foreground">{t("dashboard.your_role")} : </span>{me ? t(`roles.${me.primaryRole}`) : "—"}</div>
      </CardContent>
    </Card>
  );
}
