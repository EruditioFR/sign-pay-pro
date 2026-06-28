import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { Eye, Receipt, ArrowLeft } from "lucide-react";
import { listInvoices } from "@/lib/facturation.functions";
import { InvoiceStatusBadge } from "@/components/facturation/InvoiceStatusBadge";
import { formatEUR } from "@/components/facturation/FacturationKPICard";
import { INVOICE_STATUSES } from "@/lib/invoice-lifecycle";

export const Route = createFileRoute("/_authenticated/app/facturation/factures/")({
  component: FacturesListPage,
});

function FacturesListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const listFn = useServerFn(listInvoices);
  const q = useQuery({
    queryKey: ["facturation_invoices", { search, status }],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          status: status === "all" ? undefined : status,
        },
      }),
  });

  const rows = q.data?.documents ?? [];

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/facturation">
          <ArrowLeft className="mr-1 h-4 w-4" /> Tableau de bord
        </Link>
      </Button>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <Receipt className="h-6 w-6 shrink-0 text-[color:var(--facturation)]" />
            <span className="truncate">Factures</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Cycle de vie complet : émission, envoi, paiement, archivage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
            <Link to="/app/facturation/devis">Depuis un devis →</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="flex-1 bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90 sm:flex-none"
          >
            <Link to="/app/facturation/factures/new">Nouvelle facture</Link>
          </Button>
        </div>
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
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {INVOICE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
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
                Aucune facture. Créez un devis puis convertissez-le en facture.
              </li>
            )}
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to="/app/facturation/factures/$id"
                  params={{ id: r.id }}
                  className="block rounded-md border border-border bg-card p-3 active:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.third_party_name ?? "—"}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {r.document_number ?? "—"}
                      </p>
                    </div>
                    <InvoiceStatusBadge status={r.status} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Émise : {r.issue_date ?? "—"}</span>
                    <span className="text-right font-medium text-foreground tabular-nums">
                      {formatEUR(r.amount_ttc)}
                    </span>
                    <span>Échéance : {r.due_date ?? "—"}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead className="text-right">Montant TTC</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      Chargement…
                    </TableCell>
                  </TableRow>
                )}
                {!q.isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      Aucune facture. Créez un devis puis convertissez-le en facture.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.document_number ?? "—"}
                    </TableCell>
                    <TableCell>{r.third_party_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.issue_date ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.due_date ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEUR(r.amount_ttc)}
                    </TableCell>
                    <TableCell><InvoiceStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          to="/app/facturation/factures/$id"
                          params={{ id: r.id }}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

