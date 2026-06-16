import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Receipt, Clock, CheckCircle2, FileText } from "lucide-react";
import {
  getFacturationStats,
  listQuotes,
  listInvoices,
  type FacturationDocRow,
} from "@/lib/facturation.functions";
import {
  FacturationKPICard,
  formatEUR,
} from "@/components/facturation/FacturationKPICard";
import { QuoteStatusBadge } from "@/components/facturation/QuoteStatusBadge";
import { InvoiceStatusBadge } from "@/components/facturation/InvoiceStatusBadge";

export const Route = createFileRoute("/_authenticated/app/facturation/")({
  component: FacturationDashboard,
});

function FacturationDashboard() {
  const statsFn = useServerFn(getFacturationStats);
  const quotesFn = useServerFn(listQuotes);
  const invoicesFn = useServerFn(listInvoices);

  const stats = useQuery({
    queryKey: ["facturation_stats"],
    queryFn: () => statsFn(),
  });
  const quotes = useQuery({
    queryKey: ["facturation_recent_quotes"],
    queryFn: () => quotesFn({}),
  });
  const invoices = useQuery({
    queryKey: ["facturation_recent_invoices"],
    queryFn: () => invoicesFn({}),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[color:var(--facturation)]" />
            Facturation
          </h1>
          <p className="text-sm text-muted-foreground">
            Pilotez vos devis, vos factures et vos encaissements.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/app/facturation/devis/new">
              <Plus className="mr-1 h-4 w-4" /> Nouveau devis
            </Link>
          </Button>
          <Button
            asChild
            className="bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90"
          >
            <Link to="/app/facturation/factures">
              <Receipt className="mr-1 h-4 w-4" /> Voir les factures
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <FacturationKPICard
          label="Facturé ce mois"
          value={formatEUR(stats.data?.billedThisMonth)}
          icon={<Receipt className="h-4 w-4" />}
          tone="accent"
        />
        <FacturationKPICard
          label="En attente de paiement"
          value={formatEUR(stats.data?.awaitingPayment)}
          hint={`${stats.data?.openInvoicesCount ?? 0} facture(s)`}
          icon={<Clock className="h-4 w-4" />}
        />
        <FacturationKPICard
          label="Payé ce mois"
          value={formatEUR(stats.data?.paidThisMonth)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="accent"
        />
        <FacturationKPICard
          label="Devis en cours"
          value={stats.data?.openQuotesCount ?? 0}
          icon={<FileText className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <RecentList
          title="Derniers devis"
          rows={quotes.data?.documents ?? []}
          emptyHint="Aucun devis pour le moment."
          newHref="/app/facturation/devis/new"
          newLabel="Nouveau devis"
          listHref="/app/facturation/devis"
          isInvoice={false}
        />
        <RecentList
          title="Dernières factures"
          rows={invoices.data?.documents ?? []}
          emptyHint="Aucune facture pour le moment."
          newHref="/app/facturation/devis"
          newLabel="Créer un devis d'abord"
          listHref="/app/facturation/factures"
          isInvoice
        />
      </section>
    </div>
  );
}

function RecentList({
  title,
  rows,
  emptyHint,
  newHref,
  newLabel,
  listHref,
  isInvoice,
}: {
  title: string;
  rows: FacturationDocRow[];
  emptyHint: string;
  newHref: string;
  newLabel: string;
  listHref: string;
  isInvoice: boolean;
}) {
  const first5 = rows.slice(0, 5);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to={listHref}>Tout voir</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {first5.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>{emptyHint}</p>
            <Button asChild size="sm" variant="outline">
              <Link to={newHref}>{newLabel}</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {first5.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link
                  to={
                    isInvoice
                      ? "/app/facturation/factures/$id"
                      : "/app/facturation/devis/$id/edit"
                  }
                  params={{ id: d.id }}
                  className="flex-1 min-w-0"
                >
                  <div className="font-medium truncate">
                    {d.document_number ?? d.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.third_party_name ?? "—"} · {formatEUR(d.amount_ttc)}
                  </div>
                </Link>
                {isInvoice ? (
                  <InvoiceStatusBadge status={d.status} />
                ) : (
                  <QuoteStatusBadge status={d.status} />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
