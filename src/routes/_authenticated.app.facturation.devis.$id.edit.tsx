import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Send, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { updateDocument } from "@/lib/documents.functions";
import {
  saveDocumentLines, getInvoiceFull, createInvoiceFromQuote,
} from "@/lib/facturation.functions";
import {
  InvoiceLineItems, InvoiceTotals, emptyLine, computeTotals, type LineDraft,
} from "@/components/facturation/InvoiceLineItems";
import { QuoteStatusBadge } from "@/components/facturation/QuoteStatusBadge";

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

  const dataQ = useQuery({
    queryKey: ["facturation_quote", id],
    queryFn: () => getFn({ data: { documentId: id } }),
  });

  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [email, setEmail] = useState("");
  const [obj, setObj] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!dataQ.data || hydrated) return;
    const d = dataQ.data.document as Record<string, unknown>;
    setTitle((d.title as string) ?? "");
    setClient((d.third_party_name as string) ?? "");
    setEmail((d.third_party_email as string) ?? "");
    setObj((d.description as string) ?? "");
    setIssueDate((d.issue_date as string) ?? "");
    setDueDate((d.due_date as string) ?? "");
    const incoming = (dataQ.data.lines ?? []) as Array<Record<string, unknown>>;
    setLines(
      incoming.length > 0
        ? incoming.map((l) => ({
            description: (l.description as string) ?? "",
            quantity: Number(l.quantity) || 0,
            unit_price_ht: Number(l.unit_price_ht) || 0,
            vat_rate: Number(l.vat_rate) || 0,
            discount_pct: Number(l.discount_pct) || 0,
          }))
        : [emptyLine()],
    );
    setHydrated(true);
  }, [dataQ.data, hydrated]);

  const save = useMutation({
    mutationFn: async () => {
      const totals = computeTotals(lines);
      await updateFn({
        data: {
          id,
          title: title.trim(),
          description: obj || null,
          third_party_name: client || null,
          third_party_email: email || null,
          issue_date: issueDate || null,
          due_date: dueDate || null,
          amount_ht: totals.ht,
          amount_ttc: totals.ttc,
        },
      });
      await saveLinesFn({ data: { documentId: id, lines } });
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

  if (dataQ.isLoading || !dataQ.data) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  const d = dataQ.data.document as Record<string, unknown>;
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
          <p className="text-sm text-muted-foreground">
            {(d.title as string) ?? ""}
          </p>
        </div>
        <QuoteStatusBadge status={status} />
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Informations générales</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5 md:col-span-2">
            <Label>Objet du devis</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isDraft} />
          </div>
          <div className="grid gap-1.5">
            <Label>Client</Label>
            <Input value={client} onChange={(e) => setClient(e.target.value)} disabled={!isDraft} />
          </div>
          <div className="grid gap-1.5">
            <Label>Email client</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!isDraft} />
          </div>
          <div className="grid gap-1.5">
            <Label>Date d'émission</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={!isDraft} />
          </div>
          <div className="grid gap-1.5">
            <Label>Validité jusqu'au</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!isDraft} />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label>Description</Label>
            <Textarea rows={3} value={obj} onChange={(e) => setObj(e.target.value)} disabled={!isDraft} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lignes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <InvoiceLineItems value={lines} onChange={setLines} disabled={!isDraft} />
          <InvoiceTotals lines={lines} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {isDraft && (
          <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
            <Save className="mr-1 h-4 w-4" /> Enregistrer
          </Button>
        )}
        {(status === "draft" || status === "issued") && (
          <Button
            disabled={save.isPending}
            onClick={async () => {
              await save.mutateAsync();
              await updateFn({ data: { id, status: "sent" } });
              toast.success("Devis marqué comme envoyé.");
              qc.invalidateQueries({ queryKey: ["facturation_quote", id] });
            }}
            variant="outline"
          >
            <Send className="mr-1 h-4 w-4" /> Marquer comme envoyé
          </Button>
        )}
        {(status === "issued" || status === "sent" || status === "viewed") && (
          <Button
            disabled={convert.isPending}
            onClick={() => {
              if (confirm("Convertir ce devis en facture ?")) convert.mutate();
            }}
            className="bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90"
          >
            <ArrowRightLeft className="mr-1 h-4 w-4" /> Convertir en facture
          </Button>
        )}
      </div>
    </div>
  );
}
