import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listDocuments, ALL_DOCUMENT_STATUSES, type DocumentType, type DocumentStatus } from "@/lib/documents.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DocumentStatusBadge } from "@/components/status-badge";
import { Archive, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/documents/")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<DocumentType | "all">("all");
  const [status, setStatus] = useState<DocumentStatus | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);

  const fetchDocs = useServerFn(listDocuments);
  const { data, isLoading } = useQuery({
    queryKey: ["documents", search, type, status, includeArchived],
    queryFn: () =>
      fetchDocs({
        data: {
          search: search || undefined,
          type: type === "all" ? undefined : type,
          status: status === "all" ? undefined : status,
          includeArchived,
        },
      }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>{t("documents.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("documents.subtitle")}</p>
          </div>
          <Button asChild>
            <Link to="/app/documents/new">
              <Plus className="mr-1 h-4 w-4" /> {t("documents.new")}
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          <Input
            placeholder={t("documents.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={type} onValueChange={(v) => setType(v as DocumentType | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("documents.filter.all_types")}</SelectItem>
              {(["purchase_order", "quote", "invoice", "contract", "other"] as DocumentType[]).map((tp) => (
                <SelectItem key={tp} value={tp}>{t(`documents.types.${tp}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as DocumentStatus | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("documents.filter.all_statuses")}</SelectItem>
              {(["draft", "pending_validation", "validated", "rejected", "archived"] as DocumentStatus[]).map((st) => (
                <SelectItem key={st} value={st}>{t(`documents.status.${st}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !data?.documents.length ? (
          <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("documents.field.title")}</TableHead>
                <TableHead>{t("documents.field.type")}</TableHead>
                <TableHead>{t("documents.field.third_party")}</TableHead>
                <TableHead>{t("documents.field.amount")}</TableHead>
                <TableHead>{t("documents.field.status")}</TableHead>
                <TableHead>{t("documents.field.issue_date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.documents.map((d) => (
                <TableRow key={d.id} className="cursor-pointer hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <Link to="/app/documents/$id" params={{ id: d.id }}>
                      {d.title}
                      {d.reference && <span className="ml-2 text-xs text-muted-foreground">{d.reference}</span>}
                    </Link>
                  </TableCell>
                  <TableCell>{t(`documents.types.${d.type}`)}</TableCell>
                  <TableCell>{d.third_party_name ?? "—"}</TableCell>
                  <TableCell>
                    {d.amount_ttc != null ? `${d.amount_ttc.toLocaleString()} ${d.currency}` : "—"}
                  </TableCell>
                  <TableCell><DocumentStatusBadge status={d.status} /></TableCell>
                  <TableCell>{d.issue_date ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
