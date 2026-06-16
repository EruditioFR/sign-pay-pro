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
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[color:var(--facturation)]" />
            Factures
          </h1>
          <p className="text-sm text-muted-foreground">
            Cycle de vie complet : émission, envoi, paiement, archivage.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/app/facturation/devis">
            Convertir depuis un devis →
          </Link>
        </Button>
      </header>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Rechercher (titre, client, n°)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {INVOICE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
        </CardContent>
      </Card>
    </div>
  );
}
