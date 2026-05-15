import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllTenants } from "@/lib/auth.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/reseller/")({
  component: () => {
    const { t } = useTranslation();
    const fetch = useServerFn(listAllTenants);
    const { data } = useQuery({ queryKey: ["reseller-clients"], queryFn: () => fetch({ data: {} }) });
    return (
      <Card>
        <CardHeader><CardTitle>{t("nav.clients")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(data?.tenants ?? []).map((c) => (
              <li key={c.id} className="flex justify-between border-b border-border py-2">
                <span>{c.name}</span>
                <span className="text-muted-foreground">{c.country} · {c.plan}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  },
});
