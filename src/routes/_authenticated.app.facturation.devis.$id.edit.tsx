import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, ArrowRightLeft, PenLine } from "lucide-react";
import { toast } from "sonner";
import { updateDocument } from "@/lib/documents.functions";
import {
  saveDocumentLines, getInvoiceFull, createInvoiceFromQuote,
} from "@/lib/facturation.functions";
import { getMyBillingProfile } from "@/lib/organization.functions";
import { computeTotals } from "@/components/facturation/InvoiceLineItems";
import { QuoteStatusBadge } from "@/components/facturation/QuoteStatusBadge";
import { SendQuoteDialog } from "@/components/facturation/SendQuoteDialog";
import {
  DocumentStepperForm, emptyStepperDoc, type StepperDoc,
} from "@/components/facturation/DocumentStepperForm";
import type { OrgProfile } from "@/lib/invoice-compliance";

export const Route = createFileRoute("/_authenticated/app/facturation/devis/$id/edit")({
  component: EditQuotePage,
});

function EditQuotePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getInvoiceFull);
  const updateFn = useServerFn(updateDocument);
  const saveLinesFn = useServerFn(saveDocumentLines);
  const convertFn = useServerFn(createInvoiceFromQuote);
  const getOrgFn = useServerFn(getMyBillingProfile);

  const dataQ = useQuery({
    queryKey: ["facturation_quote", id],
    queryFn: () => getFn({ data: { documentId: id } }),
  });

  const orgQ = useQuery({
    queryKey: ["billing-profile"],
    queryFn: () => getOrgFn(),
  });

  const [doc, setDoc] = useState<StepperDoc>(() => emptyStepperDoc());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!dataQ.data || !orgQ.data || hydrated) return;
    const d = dataQ.data.document as Record<string, unknown>;
    const lines = ((dataQ.data.lines ?? []) as Array<Record<string, unknown>>).map((l) => ({
      description: (l.description as string) ?? "",
      quantity: Number(l.quantity) || 0,
      unit_price_ht: Number(l.unit_price_ht) || 0,
      vat_rate: Number(l.vat_rate) || 0,
      discount_pct: Number(l.discount_pct) || 0,
    }));
    const base = emptyStepperDoc(orgQ.data as OrgProfile | null);
    setDoc({
      ...base,
      title: (d.title as string) ?? "",
      description: (d.description as string) ?? "",
      third_party_name: (d.third_party_name as string) ?? "",
      third_party_email: (d.third_party_email as string) ?? "",
      client_legal_form: (d.client_legal_form as string) ?? "",
      client_reference: (d.client_reference as string) ?? "",
      buyer_siret: (d.buyer_siret as string) ?? "",
      buyer_vat_number: (d.buyer_vat_number as string) ?? "",
      buyer_address: typeof d.buyer_address === "string"
        ? (d.buyer_address as string)
        : d.buyer_address
        ? JSON.stringify(d.buyer_address)
        : "",
      client_delivery_address: (d.client_delivery_address as string) ?? "",
      issue_date: (d.issue_date as string) ?? base.issue_date,
      service_date: (d.service_date as string) ?? "",
      due_date: (d.due_date as string) ?? base.due_date,
      validity_date: (d.validity_date as string) ?? base.validity_date,
      transaction_type: (d.transaction_type as string) ?? "B2B",
      payment_terms: (d.payment_terms as string) ?? base.payment_terms,
      payment_bank_details: (d.payment_bank_details as string) ?? base.payment_bank_details,
      late_penalty_rate: d.late_penalty_rate != null ? String(d.late_penalty_rate) : base.late_penalty_rate,
      recovery_indemnity: d.recovery_indemnity != null ? String(d.recovery_indemnity) : base.recovery_indemnity,
      early_discount_text: (d.early_discount_text as string) ?? base.early_discount_text,
      advance_paid: d.advance_paid != null ? String(d.advance_paid) : "0",
      header_note: (d.header_note as string) ?? "",
      footer_note: (d.footer_note as string) ?? "",
      internal_note: (d.internal_note as string) ?? "",
      legal_mentions: (d.legal_mentions as string) ?? "",
      document_number: (d.document_number as string) ?? null,
      lines: lines.length > 0 ? lines : [],
    });
    setHydrated(true);
  }, [dataQ.data, orgQ.data, hydrated]);

  const save = useMutation({
    mutationFn: async () => {
      const totals = computeTotals(doc.lines);
      await updateFn({
        data: {
          id,
          title: doc.title.trim() || "Devis",
          description: doc.description || null,
          third_party_name: doc.third_party_name || null,
          third_party_email: doc.third_party_email || null,
          issue_date: doc.issue_date || null,
          due_date: doc.due_date || null,
          service_date: doc.service_date || null,
          validity_date: doc.validity_date || null,
          transaction_type: doc.transaction_type || null,
          client_legal_form: doc.client_legal_form || null,
          client_reference: doc.client_reference || null,
          client_delivery_address: doc.client_delivery_address || null,
          buyer_siret: doc.buyer_siret || null,
          buyer_vat_number: doc.buyer_vat_number || null,
          payment_terms: doc.payment_terms || null,
          payment_bank_details: doc.payment_bank_details || null,
          late_penalty_rate: doc.late_penalty_rate ? Number(doc.late_penalty_rate) : null,
          recovery_indemnity: doc.recovery_indemnity ? Number(doc.recovery_indemnity) : null,
          early_discount_text: doc.early_discount_text || null,
          advance_paid: doc.advance_paid ? Number(doc.advance_paid) : null,
          header_note: doc.header_note || null,
          footer_note: doc.footer_note || null,
          internal_note: doc.internal_note || null,
          legal_mentions: doc.legal_mentions || null,
          amount_ht: totals.ht,
          amount_ttc: totals.ttc,
        },
      });
      await saveLinesFn({ data: { documentId: id, lines: doc.lines } });
    },
    onSuccess: () => {
      toast.success("Devis enregistré.");
      qc.invalidateQueries({ queryKey: ["facturation_quote", id] });
      qc.invalidateQueries({ queryKey: ["facturation_quotes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: () => convertFn({ data: { quoteId: id } }),
    onSuccess: ({ invoice }) => {
      toast.success("Facture créée depuis le devis.");
      qc.invalidateQueries({ queryKey: ["facturation_quotes"] });
      navigate({
        to: "/app/facturation/factures/$id",
        params: { id: invoice.id as string },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (dataQ.isLoading || orgQ.isLoading || !hydrated) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  const d = dataQ.data!.document as Record<string, unknown>;
  const status = (d.status as string) ?? "draft";
  const isDraft = status === "draft";

  return (
    <div className="space-y-4 max-w-5xl">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/facturation/devis"><ArrowLeft className="mr-1 h-4 w-4" /> Retour</Link>
      </Button>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {String(d.document_number ?? "Devis")}
          </h1>
          <p className="text-sm text-muted-foreground">{doc.title}</p>
        </div>
        <QuoteStatusBadge status={status} />
      </header>

      <DocumentStepperForm
        type="quote"
        org={(orgQ.data ?? null) as OrgProfile | null}
        value={doc}
        onChange={setDoc}
        readOnly={!isDraft}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {isDraft && (
              <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
                <Save className="mr-1 h-4 w-4" /> Enregistrer
              </Button>
            )}
            {(status === "draft" || status === "issued" || status === "sent" || status === "viewed") && (
              <Button asChild variant="outline">
                <Link to="/app/documents/$id" params={{ id }}>
                  <PenLine className="mr-1 h-4 w-4" /> Signer ce devis
                </Link>
              </Button>
            )}
            {(status === "draft" || status === "issued") && (
              <SendQuoteDialog
                documentId={id}
                defaultRecipient={{ name: doc.third_party_name, email: doc.third_party_email }}
                onSent={async () => {
                  await save.mutateAsync().catch(() => {});
                }}
              />
            )}
            {(status === "issued" || status === "sent" || status === "viewed") && (
              <Button
                disabled={convert.isPending}
                onClick={() => { if (confirm("Convertir ce devis en facture ?")) convert.mutate(); }}
                className="bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90"
              >
                <ArrowRightLeft className="mr-1 h-4 w-4" /> Convertir en facture
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
