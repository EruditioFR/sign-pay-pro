import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Copy, Receipt, CheckCircle2, Send, Link as LinkIcon, FileText, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { getInvoiceFull } from "@/lib/facturation.functions";
import { transitionInvoiceStatus } from "@/lib/invoice-lifecycle.functions";
import { manualNextStatuses, type InvoiceStatus } from "@/lib/invoice-lifecycle";
import { createDocumentPaymentLink } from "@/lib/stripe-payment-links.functions";
import { archiveDocument } from "@/lib/documents.functions";
import { InvoiceStatusBadge } from "@/components/facturation/InvoiceStatusBadge";
import { formatEUR } from "@/components/facturation/FacturationKPICard";
import { PaymentDialog } from "@/components/payment-dialog";
import { GeneratePdfButton } from "@/components/generate-pdf-button";
import { ExportFacturXButton } from "@/components/export-factur-x-button";
import { SendQuoteDialog } from "@/components/facturation/SendQuoteDialog";
import { InvoiceDraftEditor } from "@/components/facturation/InvoiceDraftEditor";
import { InvoiceComplianceIndicator } from "@/components/facturation/InvoiceComplianceIndicator";
import { checkInvoiceCompliance, type OrgProfile, type InvoiceDoc } from "@/lib/invoice-compliance";
import { getMyBillingProfile } from "@/lib/organization.functions";

export const Route = createFileRoute("/_authenticated/app/facturation/factures/$id")({
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getInvoiceFull);
  const transitionFn = useServerFn(transitionInvoiceStatus);
  const createLinkFn = useServerFn(createDocumentPaymentLink);
  const archiveFn = useServerFn(archiveDocument);
  const [creatingLink, setCreatingLink] = useState(false);

  const q = useQuery({
    queryKey: ["facturation_invoice", id],
    queryFn: () => getFn({ data: { documentId: id } }),
  });

  const transition = useMutation({
    mutationFn: (to: InvoiceStatus) =>
      transitionFn({ data: { documentId: id, to } }),
    onSuccess: () => {
      toast.success("Statut mis à jour.");
      qc.invalidateQueries({ queryKey: ["facturation_invoice", id] });
      qc.invalidateQueries({ queryKey: ["facturation_invoices"] });
      qc.invalidateQueries({ queryKey: ["pending_invoices_count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || !q.data) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  const doc = q.data.document as Record<string, unknown>;
  const lines = q.data.lines as Array<Record<string, unknown>>;
  const payments = q.data.payments as Array<Record<string, unknown>>;
  const events = q.data.events as Array<Record<string, unknown>>;
  const status = (doc.status as string) ?? "draft";
  const amountTtc = Number(doc.amount_ttc) || 0;
  const amountHt = Number(doc.amount_ht) || 0;
  const currency = (doc.currency as string) ?? "EUR";

  const succeededPayments = payments.filter((p) => p.status === "succeeded");
  const paid = succeededPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const stripeLink = payments.find(
    (p) => p.method === "stripe_link" && (p.metadata as { url?: string })?.url,
  );
  const stripeLinkUrl =
    (stripeLink?.metadata as { url?: string } | undefined)?.url ?? null;
  const remaining = Math.max(0, amountTtc - paid);

  const next = manualNextStatuses(status);

  const tagOrigin = (doc.tags as string[] | null | undefined)?.find((t) =>
    t.startsWith("origin_quote:"),
  );
  const originQuoteId = tagOrigin ? tagOrigin.slice("origin_quote:".length) : null;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/facturation/factures">
          <ArrowLeft className="mr-1 h-4 w-4" /> Factures
        </Link>
      </Button>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[color:var(--facturation)]" />
            {String(doc.document_number ?? "Facture")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {(doc.title as string) ?? ""}
          </p>
        </div>
        <InvoiceStatusBadge status={status} />
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: document */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Document</CardTitle>
              <div className="flex gap-2">
                <GeneratePdfButton documentId={id} />
                <ExportFacturXButton documentId={id} documentType="invoice" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2" />
                <p>Aperçu PDF disponible via « Télécharger ».</p>
                <p className="text-xs mt-1">Le rendu inline arrive bientôt.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Lignes</CardTitle></CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune ligne enregistrée.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2">Description</th>
                      <th className="text-right py-2">Qté</th>
                      <th className="text-right py-2">PU HT</th>
                      <th className="text-right py-2">TVA</th>
                      <th className="text-right py-2">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id as string} className="border-b border-border/60">
                        <td className="py-2">{l.description as string}</td>
                        <td className="text-right py-2">{Number(l.quantity)}</td>
                        <td className="text-right py-2">
                          {formatEUR(Number(l.unit_price_ht))}
                        </td>
                        <td className="text-right py-2">{Number(l.vat_rate)}%</td>
                        <td className="text-right py-2 font-medium">
                          {formatEUR(Number(l.line_total_ht))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="text-right pt-2 text-muted-foreground">Total HT</td>
                      <td className="text-right pt-2 font-medium">{formatEUR(amountHt)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="text-right text-muted-foreground">Total TVA</td>
                      <td className="text-right">{formatEUR(amountTtc - amountHt)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="text-right pt-1 font-semibold">Total TTC</td>
                      <td className="text-right pt-1 font-bold text-[color:var(--facturation)]">
                        {formatEUR(amountTtc)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: management */}
        <div className="space-y-4">
          <Card className="border-[color:var(--facturation)]/30">
            <CardHeader><CardTitle className="text-base">Statut & actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <InvoiceStatusBadge status={status} />
              <div className="flex flex-col gap-2 pt-2">
                {status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() => transition.mutate("issued")}
                    disabled={transition.isPending}
                    className="bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90"
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Émettre
                  </Button>
                )}
                {(status === "issued") && (
                  <SendQuoteDialog
                    documentId={id}
                    kind="invoice"
                    defaultRecipient={{
                      name: (doc.third_party_name as string) ?? null,
                      email: (doc.third_party_email as string) ?? null,
                    }}
                    onSent={() => {
                      qc.invalidateQueries({ queryKey: ["facturation_invoice", id] });
                      qc.invalidateQueries({ queryKey: ["facturation_invoices"] });
                      qc.invalidateQueries({ queryKey: ["pending_invoices_count"] });
                    }}
                  />
                )}
                {(status === "sent" || status === "viewed" || status === "partially_paid") && (
                  <Button
                    size="sm"
                    onClick={() => transition.mutate("paid")}
                    disabled={transition.isPending}
                    variant="outline"
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Marquer payée
                  </Button>
                )}
                {status === "paid" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await archiveFn({ data: { id } });
                        toast.success("Facture archivée.");
                        qc.invalidateQueries({ queryKey: ["facturation_invoice", id] });
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    Archiver
                  </Button>
                )}
                {next.length === 0 && status !== "paid" && (
                  <p className="text-xs text-muted-foreground">
                    Aucune action manuelle disponible pour ce statut.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Paiement</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total TTC</span>
                <span className="font-semibold">{formatEUR(amountTtc)} {currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Encaissé</span>
                <span>{formatEUR(paid)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Restant dû</span>
                <span className={remaining > 0 ? "text-orange-600 font-semibold" : "text-[color:var(--facturation)] font-semibold"}>
                  {formatEUR(remaining)}
                </span>
              </div>

              {stripeLinkUrl ? (
                <div className="rounded-md border border-border bg-muted/30 p-2">
                  <div className="text-xs text-muted-foreground mb-1">Lien Stripe</div>
                  <div className="flex items-center gap-1">
                    <input
                      readOnly
                      value={stripeLinkUrl}
                      className="flex-1 text-xs bg-transparent border-0 outline-none"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(stripeLinkUrl);
                        toast.success("Lien copié.");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                amountTtc > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={creatingLink}
                    onClick={async () => {
                      setCreatingLink(true);
                      try {
                        await createLinkFn({
                          data: {
                            document_id: id,
                            amount: amountTtc,
                            currency,
                            label: (doc.title as string) ?? "Facture",
                          },
                        });
                        toast.success("Lien Stripe créé.");
                        qc.invalidateQueries({ queryKey: ["facturation_invoice", id] });
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setCreatingLink(false);
                      }
                    }}
                  >
                    <LinkIcon className="mr-1 h-4 w-4" /> Créer un lien Stripe
                  </Button>
                )
              )}

              <PaymentDialog
                documentId={id}
                suggestedAmount={remaining > 0 ? remaining : undefined}
                currency={currency}
              />

              {succeededPayments.length > 0 && (
                <ul className="divide-y divide-border rounded-md border border-border text-xs">
                  {succeededPayments.map((p) => (
                    <li key={p.id as string} className="flex justify-between px-2 py-1.5">
                      <span>{formatEUR(Number(p.amount))} · {String(p.method)}</span>
                      <span className="text-muted-foreground">
                        {p.paid_at ? new Date(p.paid_at as string).toLocaleDateString() : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Client</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="font-medium">{(doc.third_party_name as string) ?? "—"}</div>
              {Boolean(doc.third_party_email) && (
                <div className="text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {doc.third_party_email as string}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Informations</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div><span className="text-muted-foreground">N° :</span> {(doc.document_number as string) ?? "—"}</div>
              <div><span className="text-muted-foreground">Émise le :</span> {(doc.issue_date as string) ?? "—"}</div>
              <div><span className="text-muted-foreground">Échéance :</span> {(doc.due_date as string) ?? "—"}</div>
              {originQuoteId && (
                <div className="pt-2">
                  <Button asChild variant="ghost" size="sm" className="px-0">
                    <Link
                      to="/app/facturation/devis/$id/edit"
                      params={{ id: originQuoteId }}
                    >
                      ← Devis d'origine
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Historique</CardTitle></CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun évènement.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {events.map((e) => {
                    const meta = (e.metadata as Record<string, unknown>) ?? {};
                    return (
                      <li key={e.id as string} className="flex gap-2">
                        <span className="text-muted-foreground w-20 shrink-0">
                          {new Date(e.created_at as string).toLocaleDateString()}
                        </span>
                        <span>
                          {e.action as string}
                          {meta.to ? ` → ${meta.to as string}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
