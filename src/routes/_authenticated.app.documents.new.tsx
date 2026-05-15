import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createDocument, type DocumentType } from "@/lib/documents.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/documents/new")({
  component: NewDocumentPage,
});

function NewDocumentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useServerFn(createDocument);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("documents.new")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const res = await create({
                data: {
                  type: (fd.get("type") as DocumentType) ?? "other",
                  title: String(fd.get("title") ?? ""),
                  reference: (fd.get("reference") as string) || null,
                  description: (fd.get("description") as string) || null,
                  amount_ht: fd.get("amount_ht") ? Number(fd.get("amount_ht")) : null,
                  amount_ttc: fd.get("amount_ttc") ? Number(fd.get("amount_ttc")) : null,
                  currency: (fd.get("currency") as string) || "EUR",
                  third_party_name: (fd.get("third_party_name") as string) || null,
                  third_party_email: (fd.get("third_party_email") as string) || null,
                  issue_date: (fd.get("issue_date") as string) || null,
                  due_date: (fd.get("due_date") as string) || null,
                  tags: [],
                },
              });
              toast.success(t("documents.created"));
              navigate({ to: "/app/documents/$id", params: { id: res.document.id } });
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : t("common.error"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="md:col-span-2 grid gap-2">
            <Label htmlFor="title">{t("documents.field.title")}</Label>
            <Input id="title" name="title" required maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">{t("documents.field.type")}</Label>
            <Select name="type" defaultValue="quote">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["purchase_order", "quote", "invoice", "contract", "other"] as DocumentType[]).map((tp) => (
                  <SelectItem key={tp} value={tp}>{t(`documents.types.${tp}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reference">{t("documents.field.reference")}</Label>
            <Input id="reference" name="reference" maxLength={100} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="third_party_name">{t("documents.field.third_party")}</Label>
            <Input id="third_party_name" name="third_party_name" maxLength={200} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="third_party_email">{t("documents.field.third_party_email")}</Label>
            <Input id="third_party_email" name="third_party_email" type="email" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amount_ht">{t("documents.field.amount_ht")}</Label>
            <Input id="amount_ht" name="amount_ht" type="number" step="0.01" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amount_ttc">{t("documents.field.amount_ttc")}</Label>
            <Input id="amount_ttc" name="amount_ttc" type="number" step="0.01" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="currency">{t("documents.field.currency")}</Label>
            <Input id="currency" name="currency" defaultValue="EUR" maxLength={3} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="issue_date">{t("documents.field.issue_date")}</Label>
            <Input id="issue_date" name="issue_date" type="date" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="due_date">{t("documents.field.due_date")}</Label>
            <Input id="due_date" name="due_date" type="date" />
          </div>
          <div className="md:col-span-2 grid gap-2">
            <Label htmlFor="description">{t("documents.field.description")}</Label>
            <Textarea id="description" name="description" rows={4} maxLength={2000} />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/documents" })}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
