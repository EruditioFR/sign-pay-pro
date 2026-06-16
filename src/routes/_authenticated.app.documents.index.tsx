import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DocumentStatusBadge } from "@/components/status-badge";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentFiltersBar, type DocumentFiltersValue } from "@/components/document-filters-bar";
import { searchDocuments } from "@/lib/documents-search.functions";
import type { DocumentStatus, DocumentType } from "@/lib/documents.functions";
import { Plus, ChevronLeft, ChevronRight, FileSignature, Archive, FileText } from "lucide-react";

const DocType = z.enum(["purchase_order", "quote", "invoice", "contract", "other"]);
const DocStatus = z.enum([
  "draft", "pending_validation", "validated", "rejected",
  "sent", "signed", "paid", "partially_paid", "archived", "cancelled",
]);

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  types: fallback(z.array(DocType), []).default([]),
  statuses: fallback(z.array(DocStatus), []).default([]),
  currencies: fallback(z.array(z.string().length(3)), []).default([]),
  organization_id: z.string().uuid().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  min_amount: z.number().optional(),
  max_amount: z.number().optional(),
  signature: fallback(z.enum(["any", "none", "pending", "signed"]), "any").default("any"),
  payment: fallback(z.enum(["any", "none", "partial", "paid"]), "any").default("any"),
  archived: fallback(z.enum(["exclude", "include", "only"]), "exclude").default("exclude"),
  sort: fallback(z.enum(["created_at", "updated_at", "issue_date", "due_date", "amount_ttc"]), "created_at").default("created_at"),
  dir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
  page: fallback(z.number().int().min(1), 1).default(1),
  pageSize: fallback(z.number().int().min(10).max(100), 25).default(25),
});
type DocsSearch = z.infer<typeof searchSchema>;


export const Route = createFileRoute("/_authenticated/app/documents/")({
  validateSearch: zodValidator(searchSchema),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const filters: DocumentFiltersValue = {
    q: search.q,
    types: search.types as DocumentType[],
    statuses: search.statuses as DocumentStatus[],
    currencies: search.currencies,
    organization_id: search.organization_id,
    from_date: search.from_date,
    to_date: search.to_date,
    min_amount: search.min_amount,
    max_amount: search.max_amount,
    signature: search.signature,
    payment: search.payment,
    archived: search.archived,
    sort: search.sort,
    dir: search.dir,
  };

  const onChange = (next: Partial<DocumentFiltersValue>) => {
    navigate({
      search: (prev: DocsSearch) => ({ ...prev, ...next, page: 1 }),
      replace: true,
    });
  };

  const onReset = () => {
    navigate({
      search: () => ({
        q: "", types: [], statuses: [], currencies: [],
        signature: "any", payment: "any", archived: "exclude",
        sort: "created_at", dir: "desc", page: 1, pageSize: search.pageSize,
      }),
    });
  };

  const fetchSearch = useServerFn(searchDocuments);
  const { data, isFetching } = useQuery({
    queryKey: ["documents_search", search],
    queryFn: () =>
      fetchSearch({
        data: {
          q: search.q || undefined,
          types: search.types.length ? search.types : undefined,
          statuses: search.statuses.length ? search.statuses : undefined,
          currencies: search.currencies.length ? search.currencies : undefined,
          organization_id: search.organization_id,
          from_date: search.from_date,
          to_date: search.to_date,
          min_amount: search.min_amount,
          max_amount: search.max_amount,
          signature: search.signature,
          payment: search.payment,
          archived: search.archived,
          sort: search.sort,
          dir: search.dir,
          limit: search.pageSize,
          offset: (search.page - 1) * search.pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

  // Hide quotes/invoices — they live in the dedicated /app/facturation module.
  const allRows = data?.rows ?? [];
  const rows = allRows.filter((r) => r.type !== "quote" && r.type !== "invoice");
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / search.pageSize));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate">{t("documents.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {total > 0
                ? t("docs_search.results_count", { count: total })
                : t("documents.subtitle")}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link to="/app/documents/new">
              <Plus className="mr-1 h-4 w-4" /> {t("documents.new")}
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DocumentFiltersBar
          value={filters}
          onChange={onChange}
          onReset={onReset}
          totalCount={total}
          loading={isFetching}
          presetScope="documents-v1"
        />

        {isFetching && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("docs_search.no_results")}
            description={t("documents.subtitle")}
            action={
              <Button asChild>
                <Link to="/app/documents/new">
                  <Plus className="mr-1 h-4 w-4" /> {t("documents.new")}
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("documents.field.title")}</TableHead>
                    <TableHead>{t("documents.field.type")}</TableHead>
                    <TableHead>{t("documents.field.third_party")}</TableHead>
                    <TableHead className="text-right">{t("documents.field.amount")}</TableHead>
                    <TableHead>{t("documents.field.status")}</TableHead>
                    <TableHead>{t("documents.field.issue_date")}</TableHead>
                    <TableHead className="text-right">·</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d) => (
                    <TableRow key={d.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell className="font-medium">
                        <Link to="/app/documents/$id" params={{ id: d.id }} className="hover:underline">
                          {d.title}
                          {d.reference && <span className="ml-2 text-xs text-muted-foreground">{d.reference}</span>}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`documents.types.${d.type}`)}</TableCell>
                      <TableCell>
                        <div className="truncate max-w-[180px]">{d.third_party_name ?? "—"}</div>
                        {d.third_party_email && (
                          <div className="text-xs text-muted-foreground truncate max-w-[180px]">{d.third_party_email}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {d.amount_ttc != null ? `${Number(d.amount_ttc).toLocaleString()} ${d.currency}` : "—"}
                      </TableCell>
                      <TableCell><DocumentStatusBadge status={d.status} /></TableCell>
                      <TableCell>{d.issue_date ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2 text-muted-foreground">
                          {d.signers_total > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs" title="Signatures">
                              <FileSignature className="h-3 w-3" />
                              {d.signers_signed}/{d.signers_total}
                            </span>
                          )}
                          <PaymentStatusBadge
                            documentStatus={d.status}
                            amountTtc={d.amount_ttc}
                            dueDate={d.due_date}
                            paidAmount={d.payments_total}
                            hideWhenNotApplicable
                          />
                          {d.archived_at && (
                            <span className="inline-flex items-center gap-1 text-xs" title="Archivé">
                              <Archive className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-xs text-muted-foreground">
                {t("docs_search.page_of", { page: search.page, total: totalPages })}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="sm"
                  disabled={search.page <= 1 || isFetching}
                  onClick={() => navigate({ search: (p: DocsSearch) => ({ ...p, page: Math.max(1, p.page - 1) }) })}
                >
                  <ChevronLeft className="h-4 w-4" /> {t("docs_search.previous")}
                </Button>
                <Button
                  variant="outline" size="sm"
                  disabled={search.page >= totalPages || isFetching}
                  onClick={() => navigate({ search: (p: DocsSearch) => ({ ...p, page: p.page + 1 }) })}
                >
                  {t("docs_search.next")} <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
