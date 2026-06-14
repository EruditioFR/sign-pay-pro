import { createFileRoute, Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const search = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/pay/cancelled")({
  validateSearch: (raw) => search.parse(raw),
  component: PayCancelled;
});

function PayCancelled() {
  const { t } = useTranslation();
  const { token } = Route.useSearch();
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
        <XCircle className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">{t("pay.cancelled_title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("pay.cancelled_text")}</p>
        {token && (
          <Link
            to="/p/$token"
            params={{ token }}
            className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
          >
            {t("pay.back_to_document")}
          </Link>
        )}
      </div>
    </div>
  );
}
