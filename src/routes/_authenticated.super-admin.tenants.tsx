import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllTenants } from "@/lib/auth.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/super-admin/tenants")({
  component: TenantsPage,
});

function TenantsPage() {
  const { t } = useTranslation();
  const fetch = useServerFn(listAllTenants);
  const { data, isLoading } = useQuery({ queryKey: ["tenants"], queryFn: () => fetch({ data: {} }) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("tenants.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("tenants.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tenants.name")}</TableHead>
                <TableHead>{t("tenants.country")}</TableHead>
                <TableHead>{t("tenants.plan")}</TableHead>
                <TableHead>{t("tenants.status")}</TableHead>
                <TableHead>{t("tenants.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.tenants ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.name}</TableCell>
                  <TableCell>{o.country}</TableCell>
                  <TableCell>{o.plan}</TableCell>
                  <TableCell>
                    <Badge variant={o.active ? "default" : "outline"}>
                      {o.active ? t("users.active") : t("users.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(o.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
