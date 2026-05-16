import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listPendingSignaturesOverview } from "@/lib/signatures-overview.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Clock, FileText, Users, AlertTriangle, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/pending-signatures")({
  component: PendingSignaturesPage,
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
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
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("");

  const orgs = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of data?.groups ?? []) {
      m.set(g.organization_id, g.organization_name ?? "—");
    }
    return Array.from(m.entries());
  }, [data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.groups ?? []).filter((g) => {
      if (orgFilter && g.organization_id !== orgFilter) return false;
      if (!term) return true;
      return (
        g.document_title.toLowerCase().includes(term) ||
        (g.document_reference ?? "").toLowerCase().includes(term) ||
        (g.organization_name ?? "").toLowerCase().includes(term) ||
        g.signers.some(
          (s) =>
            s.signer_email.toLowerCase().includes(term) ||
            s.signer_name.toLowerCase().includes(term)
        )
      );
    });
  }, [data, q, orgFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signatures en attente</h1>
        <p className="text-sm text-muted-foreground">
          Vue globale de tous les documents en attente de signature, multi-organisations.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Documents en attente" value={String(data?.totals.documents ?? 0)} />
        <StatCard icon={Users} label="Signataires à relancer" value={String(data?.totals.pending_signers ?? 0)} />
        <StatCard icon={Building2} label="Organisations" value={String(data?.totals.organizations ?? 0)} />
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
              onChange={(e) => setQ(e.target.value)}
              className="sm:w-72"
            />
            {orgs.length > 1 && (
              <select
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Aucun document en attente de signature.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    {orgs.length > 1 && <TableHead>Organisation</TableHead>}
                    <TableHead>Avancement</TableHead>
                    <TableHead>Prochain signataire</TableHead>
                    <TableHead>En attente depuis</TableHead>
                    <TableHead>Expire</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((g) => {
                    const overdue =
                      g.earliest_expires_at && g.earliest_expires_at < new Date().toISOString();
                    const days = daysBetween(g.oldest_pending_at);
                    return (
                      <TableRow key={g.document_id} className="cursor-pointer">
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
                        {orgs.length > 1 && (
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
                              <Badge variant="outline">{g.pending_signers} en attente</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {g.next_signer ? (
                            <div>
                              <div className="font-medium">{g.next_signer.name}</div>
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
                              days >= 7 ? "text-amber-600 font-medium" : "text-muted-foreground"
                            }
                          >
                            <Clock className="mr-1 inline h-3 w-3" />
                            {days} j
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span
                            className={
                              overdue ? "text-destructive font-medium" : "text-muted-foreground"
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
          )}
        </CardContent>
      </Card>
    </div>
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
              tone === "warn" ? "h-5 w-5 text-destructive" : "h-5 w-5 text-primary"
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
