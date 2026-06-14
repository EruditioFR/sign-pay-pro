import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  listPendingSignaturesPage,
  getPendingSignaturesTotals,
  listPendingSignaturesOrgs,
} from "@/lib/signatures-overview.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Clock,
  FileText,
  Users,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { FilterPresetsMenu } from "@/components/filters/filter-presets-menu";
import { FilterResultCount } from "@/components/filters/filter-primitives";

interface PendingSignaturesPreset {
  q: string;
  org: string;
  sort: SortKey;
  dir: "asc" | "desc";
}

type SortKey = "waiting" | "expires" | "organization" | "document";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  org: fallback(z.string(), "").default(""),
  sort: fallback(
    z.enum(["waiting", "expires", "organization", "document"]),
    "waiting",
  ).default("waiting"),
  dir: fallback(z.enum(["asc", "desc"]), "asc").default("asc"),
  page: fallback(z.number().int().min(1).max(10_000), 1).default(1),
  limit: fallback(z.number().int().min(10).max(100), 25).default(25),
});

export const Route = createFileRoute("/_authenticated/app/pending-signatures")({
  validateSearch: zodValidator(searchSchema),
  component: PendingSignaturesPage,
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
function daysBetween(iso: string | null) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function PendingSignaturesPage() {
  const fetchPage = useServerFn(listPendingSignaturesPage);
  const fetchTotals = useServerFn(getPendingSignaturesTotals);
  const fetchOrgs = useServerFn(listPendingSignaturesOrgs);

  const { q, org, sort, dir, page, limit } = Route.useSearch();
  const navigate = useNavigate({ from: "/app/pending-signatures" });

  const setSearch = (
    patch: Partial<{
      q: string;
      org: string;
      sort: SortKey;
      dir: "asc" | "desc";
      page: number;
      limit: number;
    }>,
  ) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        ...patch,
        page: patch.page ?? 1,
      }),
    });
  };

  const totalsQuery = useQuery({
    queryKey: ["pending_signatures_totals"],
    queryFn: () => fetchTotals(),
    refetchInterval: 60_000,
  });

  const orgsQuery = useQuery({
    queryKey: ["pending_signatures_orgs"],
    queryFn: () => fetchOrgs(),
    staleTime: 60_000,
  });

  const pageQuery = useQuery({
    queryKey: ["pending_signatures_page", { q, org, sort, dir, page, limit }],
    queryFn: () =>
      fetchPage({
        data: {
          q,
          org: org ? org : null,
          sort,
          dir,
          page,
          limit,
        },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const data = pageQuery.data;
  const totals = totalsQuery.data;
  const orgs = orgsQuery.data ?? [];
  const showOrgCol = orgs.length > 1;

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * limit;
  const rows = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Signatures en attente
          </h1>
          <p className="text-sm text-muted-foreground">
            Vue globale de tous les documents en attente de signature, multi-organisations.
          </p>
        </div>
        <ActivityExportsMenu />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Documents en attente" value={String(totals?.documents ?? 0)} />
        <StatCard icon={Users} label="Signataires à relancer" value={String(totals?.pending_signers ?? 0)} />
        <StatCard icon={Building2} label="Organisations" value={String(totals?.organizations ?? 0)} />
        <StatCard
          icon={AlertTriangle}
          label="Documents expirés"
          value={String(totals?.overdue ?? 0)}
          tone={totals && totals.overdue > 0 ? "warn" : "default"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Recherche titre, référence, signataire…"
              defaultValue={q}
              onChange={(e) => setSearch({ q: e.target.value })}
              className="sm:w-72"
            />
            {showOrgCol && (
              <select
                value={org}
                onChange={(e) => setSearch({ org: e.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Toutes les organisations</option>
                {orgs.map((o) => (
                  <option key={o.organization_id} value={o.organization_id}>
                    {o.organization_name ?? "—"}
                  </option>
                ))}
              </select>
            )}
            <select
              value={limit}
              onChange={(e) => setSearch({ limit: Number(e.target.value) })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Lignes par page"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <FilterPresetsMenu<PendingSignaturesPreset>
              scope="pending-signatures-v1"
              current={{ q, org, sort, dir }}
              onApply={(v) => setSearch({ ...v })}
              isEqual={(a, b) =>
                a.q === b.q && a.org === b.org && a.sort === b.sort && a.dir === b.dir
              }
              canSave={!!(q || org || sort !== "waiting" || dir !== "asc")}
            />
            <FilterResultCount
              count={total}
              loading={pageQuery.isFetching}
              zeroLabel="0 document"
              oneLabel="1 document"
              manyLabel={(n) => `${n} documents`}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pageQuery.isLoading && !data ? (
            <div className="p-6 text-sm text-muted-foreground">Chargement…</div>
          ) : total === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Aucun document en attente de signature.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        label="Document"
                        sortKey="document"
                        current={sort}
                        dir={dir}
                        onSort={(s, d) => setSearch({ sort: s, dir: d })}
                      />
                      {showOrgCol && (
                        <SortableHead
                          label="Organisation"
                          sortKey="organization"
                          current={sort}
                          dir={dir}
                          onSort={(s, d) => setSearch({ sort: s, dir: d })}
                        />
                      )}
                      <TableHead>Avancement</TableHead>
                      <TableHead>Prochain signataire</TableHead>
                      <SortableHead
                        label="En attente depuis"
                        sortKey="waiting"
                        current={sort}
                        dir={dir}
                        onSort={(s, d) => setSearch({ sort: s, dir: d })}
                      />
                      <SortableHead
                        label="Expire"
                        sortKey="expires"
                        current={sort}
                        dir={dir}
                        onSort={(s, d) => setSearch({ sort: s, dir: d })}
                      />
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((g) => {
                      const overdue =
                        g.earliest_expires_at &&
                        g.earliest_expires_at < new Date().toISOString();
                      const days = daysBetween(g.oldest_pending_at);
                      return (
                        <TableRow key={g.document_id}>
                          <TableCell>
                            <Link
                              to="/app/documents/$id"
                              params={{ id: g.document_id }}
                              className="block"
                            >
                              <div className="font-medium">{g.document_title}</div>
                              <div className="text-xs text-muted-foreground">
                                {g.document_reference ?? "—"} · {g.document_type}
                              </div>
                            </Link>
                          </TableCell>
                          {showOrgCol && (
                            <TableCell className="text-sm">
                              {g.organization_name ?? "—"}
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <Badge variant="secondary">
                                {g.signed_signers}/{g.total_signers} signés
                              </Badge>
                              {g.pending_signers > 0 && (
                                <Badge variant="outline">
                                  {g.pending_signers} en attente
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {g.next_signer_email ? (
                              <div>
                                <div className="font-medium">
                                  {g.next_signer_name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {g.next_signer_email}
                                </div>
                              </div>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span
                              className={
                                days >= 7
                                  ? "text-amber-600 font-medium"
                                  : "text-muted-foreground"
                              }
                            >
                              <Clock className="mr-1 inline h-3 w-3" />
                              {days} j
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            <span
                              className={
                                overdue
                                  ? "text-destructive font-medium"
                                  : "text-muted-foreground"
                              }
                            >
                              {fmtDate(g.earliest_expires_at)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Link
                              to="/app/documents/$id"
                              params={{ id: g.document_id }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-center justify-between gap-2 border-t border-border px-4 py-3 sm:flex-row">
                <div className="text-xs text-muted-foreground">
                  {start + 1}–{Math.min(start + limit, total)} sur {total}
                  {pageQuery.isFetching && " · …"}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSearch({ page: 1 })}
                    disabled={safePage <= 1}
                    aria-label="Première page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSearch({ page: safePage - 1 })}
                    disabled={safePage <= 1}
                    aria-label="Page précédente"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2 text-xs">
                    Page {safePage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSearch({ page: safePage + 1 })}
                    disabled={safePage >= totalPages}
                    aria-label="Page suivante"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSearch({ page: totalPages })}
                    disabled={safePage >= totalPages}
                    aria-label="Dernière page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (s: SortKey, d: "asc" | "desc") => void;
}) {
  const active = current === sortKey;
  return (
    <TableHead>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium hover:text-foreground"
        onClick={() => onSort(sortKey, active && dir === "asc" ? "desc" : "asc")}
      >
        {label}
        {active &&
          (dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </TableHead>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div
          className={
            tone === "warn"
              ? "rounded-md bg-destructive/10 p-3"
              : "rounded-md bg-primary/10 p-3"
          }
        >
          <Icon
            className={
              tone === "warn"
                ? "h-5 w-5 text-destructive"
                : "h-5 w-5 text-primary"
            }
          />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
