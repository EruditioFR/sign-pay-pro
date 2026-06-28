import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, ArrowRightLeft, Eye, FileText } from "lucide-react";
import { toast } from "sonner";
import { listQuotes, createInvoiceFromQuote } from "@/lib/facturation.functions";
import { QuoteStatusBadge } from "@/components/facturation/QuoteStatusBadge";
import { formatEUR } from "@/components/facturation/FacturationKPICard";

export const Route = createFileRoute("/_authenticated/app/facturation/devis/")({
  component: DevisListPage,
});

function DevisListPage() {
  const navigate = Route.useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const listFn = useServerFn(listQuotes);
  const convertFn = useServerFn(createInvoiceFromQuote);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["facturation_quotes", { search, status }],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          status: status === "all" ? undefined : status,
        },
      }),
  });

  const convert = useMutation({
    mutationFn: (quoteId: string) => convertFn({ data: { quoteId } }),
    onSuccess: ({ invoice }) => {
      toast.success("Facture créée depuis le devis.");
      qc.invalidateQueries({ queryKey: ["facturation_quotes"] });
      qc.invalidateQueries({ queryKey: ["facturation_recent_invoices"] });
      navigate({
        to: "/app/facturation/factures/$id",
        params: { id: invoice.id as string },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data?.documents ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <FileText className="h-6 w-6 shrink-0 text-[color:var(--facturation)]" />
            <span className="truncate">Devis</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Gérez vos devis : édition, envoi, conversion en facture.
          </p>
        </div>
        <Button
          asChild
          size="sm"
          className="w-full bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90 sm:w-auto"
        >
          <Link to="/app/facturation/devis/new">
            <Plus className="mr-1 h-4 w-4" /> Nouveau devis
          </Link>
        </Button>
      </header>

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              placeholder="Rechercher (titre, client, n°)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-sm"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="draft">Brouillon</SelectItem>
                <SelectItem value="issued">Émis</SelectItem>
                <SelectItem value="sent">Envoyé</SelectItem>
                <SelectItem value="viewed">Consulté</SelectItem>
                <SelectItem value="rejected">Refusé</SelectItem>
                <SelectItem value="paid">Accepté</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mobile: cards */}
          <ul className="space-y-2 md:hidden">
            {q.isLoading && (
              <li className="rounded-md border border-border p-3 text-center text-sm text-muted-foreground">
                Chargement…
              </li>
            )}
            {!q.isLoading && rows.length === 0 && (
              <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Aucun devis.
              </li>
            )}
            {rows.map((r) => {
              const convertible = r.status === "sent" || r.status === "viewed" || r.status === "issued";
              return (
                <li key={r.id} className="rounded-md border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.third_party_name ?? "—"}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {r.document_number ?? "—"}
                      </p>
                    </div>
                    <QuoteStatusBadge status={r.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{r.issue_date ?? "—"}</span>
                    <span className="text-right font-medium text-foreground tabular-nums">
                      {formatEUR(r.amount_ht)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <Link to="/app/facturation/devis/$id/edit" params={{ id: r.id }}>
                        {r.status === "draft" ? (
                          <><Pencil className="mr-1 h-4 w-4" /> Éditer</>
                        ) : (
                          <><Eye className="mr-1 h-4 w-4" /> Voir</>
                        )}
                      </Link>
                    </Button>
                    {convertible && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={convert.isPending}
                        onClick={() => {
                          if (confirm("Convertir ce devis en facture ?")) {
                            convert.mutate(r.id);
                          }
                        }}
                        className="flex-1 text-[color:var(--facturation)] border-[color:var(--facturation)]/40"
                      >
                        <ArrowRightLeft className="mr-1 h-4 w-4" /> Convertir
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Devis</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Montant HT</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Chargement…
                    </TableCell>
                  </TableRow>
                )}
                {!q.isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Aucun devis.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const convertible = r.status === "sent" || r.status === "viewed" || r.status === "issued";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">
                        {r.document_number ?? "—"}
                      </TableCell>
                      <TableCell>{r.third_party_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.issue_date ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatEUR(r.amount_ht)}</TableCell>
                      <TableCell><QuoteStatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="ghost">
                            <Link
                              to="/app/facturation/devis/$id/edit"
                              params={{ id: r.id }}
                            >
                              {r.status === "draft" ? (
                                <Pencil className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Link>
                          </Button>
                          {convertible && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={convert.isPending}
                              onClick={() => {
                                if (
                                  confirm(
                                    "Convertir ce devis en facture ? Le devis sera marqué comme accepté.",
                                  )
                                ) {
                                  convert.mutate(r.id);
                                }
                              }}
                              className="text-[color:var(--facturation)] border-[color:var(--facturation)]/40"
                            >
                              <ArrowRightLeft className="mr-1 h-4 w-4" />
                              Convertir
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

