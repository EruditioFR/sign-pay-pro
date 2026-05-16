import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { listPendingSignaturesOverview } from "@/lib/signatures-overview.functions";
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
function daysBetween(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function PendingSignaturesPage() {
  const fetchOverview = useServerFn(listPendingSignaturesOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["pending_signatures_overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 60_000,
  });

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

  const orgs = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of data?.groups ?? []) {
      m.set(g.organization_id, g.organization_name ?? "—");
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.groups ?? []).filter((g) => {
      if (org && g.organization_id !== org) return false;
      if (!term) return true;
      return (
        g.document_title.toLowerCase().includes(term) ||
        (g.document_reference ?? "").toLowerCase().includes(term) ||
        (g.organization_name ?? "").toLowerCase().includes(term) ||
        g.signers.some(
          (s) =>
            s.signer_email.toLowerCase().includes(term) ||
            s.signer_name.toLowerCase().includes(term),
        )
      );
    });
  }, [data, q, org]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const mult = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort) {
        case "waiting":
          return a.oldest_pending_at.localeCompare(b.oldest_pending_at) * mult;
        case "expires": {
          const av = a.earliest_expires_at ?? "\uffff";
          const bv = b.earliest_expires_at ?? "\uffff";
          return av.localeCompare(bv) * mult;
        }
        case "organization":
          return (
            (a.organization_name ?? "").localeCompare(b.organization_name ?? "") *
            mult
          );
        case "document":
          return a.document_title.localeCompare(b.document_title) * mult;
      }
    });
    return arr;
  }, [filtered, sort, dir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const pageRows = sorted.slice(start, start + limit);

  const showOrgCol = orgs.length > 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Signatures en attente
        </h1>
        <p className="text-sm text-muted-foreground">
          Vue globale de tous les documents en attente de signature, multi-organisations.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Documents en attente"
          value={String(data?.totals.documents ?? 0)}
        />
        <StatCard
          icon={Users}
          label="Signataires à relancer"
          value={String(data?.totals.pending_signers ?? 0)}
        />
        <StatCard
          icon={Building2}
          label="Organisations"
          value={String(data?.totals.organizations ?? 0)}
        />
        <StatCard
          icon={AlertTriangle}
          label="Documents expirés"
          value={String(data?.totals.overdue ?? 0)}
          tone={data && data.totals.overdue > 0 ? "warn" : "default"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Recherche titre, référence, signataire…"
              value={q}
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
                {orgs.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
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
                    {pageRows.map((g) => {
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
                            {g.next_signer ? (
                              <div>
                                <div className="font-medium">
                                  {g.next_signer.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {g.next_signer.email}
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
        onClick={() =>
          onSort(sortKey, active && dir === "asc" ? "desc" : "asc")
        }
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
