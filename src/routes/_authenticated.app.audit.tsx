import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { listAuditLogs, listAuditActions, type AuditLogRow } from "@/lib/audit-logs.functions";
import { getCurrentUser } from "@/lib/auth.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileSearch,
  ShieldCheck,
} from "lucide-react";
import { ActivityExportsMenu } from "@/components/activity-exports-menu";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  action: fallback(z.string(), "").default(""),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  page: fallback(z.number().int().min(1).max(10_000), 1).default(1),
  limit: fallback(z.number().int().min(10).max(200), 50).default(50),
});

export const Route = createFileRoute("/_authenticated/app/audit")({
  validateSearch: zodValidator(searchSchema),
  component: AuditLogsPage,
});

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function actionBadge(action: string) {
  if (action.endsWith(".deleted") || action.endsWith(".declined") || action.endsWith(".revoked"))
    return "destructive";
  if (action.endsWith(".created") || action.endsWith(".signed") || action.endsWith(".granted"))
    return "default";
  if (action.endsWith(".updated") || action.endsWith(".status_changed"))
    return "secondary";
  return "outline";
}

function metadataPreview(meta: unknown) {
  if (!meta || typeof meta !== "object") return "—";
  try {
    const json = JSON.stringify(meta);
    return json.length > 120 ? json.slice(0, 117) + "..." : json;
  } catch {
    return "—";
  }
}


function AuditLogsPage() {
  const { q, action, from, to, page, limit } = Route.useSearch();
  const navigate = Route.useNavigate();
  const fetchMe = useServerFn(getCurrentUser);
  const fetchLogs = useServerFn(listAuditLogs);
  const fetchActions = useServerFn(listAuditActions);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });

  const offset = (page - 1) * limit;

  const filters = {
    q: q || null,
    action: action || null,
    from: from ? new Date(from).toISOString() : null,
    to: to ? new Date(to + "T23:59:59").toISOString() : null,
    organizationId: null,
    userId: null,
    resource: null,
    limit,
    offset,
  };

  const logsQuery = useQuery({
    queryKey: ["audit_logs", filters],
    queryFn: () => fetchLogs({ data: filters }),
    enabled: !!me,
    placeholderData: keepPreviousData,
  });

  const actionsQuery = useQuery({
    queryKey: ["audit_actions"],
    queryFn: () => fetchActions({ data: { organizationId: null } }),
    enabled: !!me,
    staleTime: 5 * 60_000,
  });

  const rows = logsQuery.data?.rows ?? [];
  const total = logsQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const updateSearch = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });

  const handleExport = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const isSuperAdmin = me?.primaryRole === "super_admin";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Journal d'audit
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Toutes les actions sensibles tracées
            {isSuperAdmin ? " (toutes organisations)" : " de votre organisation"}.
          </p>
        </div>
        <ActivityExportsMenu from={from || null} to={to || null} />

      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Recherche</label>
              <Input
                placeholder="Action, ressource, email, contenu…"
                value={q}
                onChange={(e) => updateSearch({ q: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Action</label>
              <Select
                value={action || "all"}
                onValueChange={(v) => updateSearch({ action: v === "all" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {(actionsQuery.data?.actions ?? []).map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Du</label>
              <Input type="date" value={from} onChange={(e) => updateSearch({ from: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Au</label>
              <Input type="date" value={to} onChange={(e) => updateSearch({ to: e.target.value })} />
            </div>
          </div>
          {(q || action || from || to) && (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateSearch({ q: "", action: "", from: "", to: "", page: 1 })}
              >
                Réinitialiser
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {total.toLocaleString("fr-FR")} événement{total > 1 ? "s" : ""}
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            Page {page} / {totalPages}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Ressource</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  {isSuperAdmin && <TableHead>Organisation</TableHead>}
                  <TableHead>Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsQuery.isLoading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center text-sm text-muted-foreground py-8">
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center text-sm text-muted-foreground py-12">
                      <FileSearch className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      Aucun événement.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const docId = r.resource?.startsWith("document:")
                      ? r.resource.slice("document:".length)
                      : null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {fmtDateTime(r.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionBadge(r.action) as never} className="font-mono text-[10px]">
                            {r.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {docId ? (
                            <Link
                              to="/app/documents/$id"
                              params={{ id: docId }}
                              className="text-primary hover:underline"
                            >
                              {r.resource}
                            </Link>
                          ) : (
                            r.resource ?? "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.user_full_name || r.user_email ? (
                            <div>
                              <div className="font-medium">{r.user_full_name ?? "—"}</div>
                              <div className="text-muted-foreground">{r.user_email ?? "—"}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Système</span>
                          )}
                        </TableCell>
                        {isSuperAdmin && (
                          <TableCell className="text-xs">{r.organization_name ?? "—"}</TableCell>
                        )}
                        <TableCell className="text-xs font-mono max-w-md truncate" title={metadataPreview(r.metadata)}>
                          {metadataPreview(r.metadata)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {total > 0 && (
            <>
              Affichage {offset + 1}–{Math.min(offset + limit, total)} sur {total}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(limit)} onValueChange={(v) => updateSearch({ limit: Number(v), page: 1 })}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => updateSearch({ page: 1 })}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => updateSearch({ page: page - 1 })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => updateSearch({ page: page + 1 })}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => updateSearch({ page: totalPages })}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
