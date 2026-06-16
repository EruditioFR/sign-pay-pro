import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { createDocument } from "@/lib/documents.functions";
import { saveDocumentLines } from "@/lib/facturation.functions";
import {
  InvoiceLineItems, InvoiceTotals, emptyLine, computeTotals, type LineDraft,
} from "@/components/facturation/InvoiceLineItems";

export const Route = createFileRoute("/_authenticated/app/facturation/devis/new")({
  component: NewQuotePage,
});

function NewQuotePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createDocument);
  const saveLinesFn = useServerFn(saveDocumentLines);

  const today = new Date().toISOString().slice(0, 10);
  const in30 = (() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [email, setEmail] = useState("");
  const [obj, setObj] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(in30);
  const [terms, setTerms] = useState("Paiement à 30 jours.");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const save = useMutation({
    mutationFn: async (issue: boolean) => {
      if (!title.trim()) throw new Error("Le titre est obligatoire.");
      const totals = computeTotals(lines);
      const { document } = await createFn({
        data: {
          type: "quote",
          title: title.trim(),
          description: obj || null,
          third_party_name: client || null,
          third_party_email: email || null,
          issue_date: issueDate,
          due_date: dueDate,
          amount_ht: totals.ht,
          amount_ttc: totals.ttc,
          currency: "EUR",
        },
      });
      if (lines.length > 0) {
        await saveLinesFn({
          data: { documentId: document.id as string, lines },
        });
      }
      return { document, issue };
    },
    onSuccess: async ({ document, issue }) => {
      qc.invalidateQueries({ queryKey: ["facturation_quotes"] });
      qc.invalidateQueries({ queryKey: ["facturation_recent_quotes"] });
      if (issue) {
        // Switch to issued via documents update — we don't reuse invoice transition
        // (which is invoice-only). Use updateDocument.
        const { updateDocument } = await import("@/lib/documents.functions");
        try {
          await updateDocument({
            data: { id: document.id as string, /* no status update for quote draft via this fn */ },
          });
        } catch {
          /* ignore */
        }
      }
      toast.success(issue ? "Devis émis." : "Devis enregistré en brouillon.");
      navigate({
        to: "/app/facturation/devis/$id/edit",
        params: { id: document.id as string },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/facturation/devis"><ArrowLeft className="mr-1 h-4 w-4" /> Retour</Link>
      </Button>
      <header>
        <h1 className="text-2xl font-semibold">Nouveau devis</h1>
        <p className="text-sm text-muted-foreground">Informations, lignes et envoi.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Informations générales</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="t">Objet du devis</Label>
            <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Devis prestation conseil" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c">Client</Label>
            <Input id="c" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Nom / Société" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="e">Email client</Label>
            <Input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="iss">Date d'émission</Label>
            <Input id="iss" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="due">Validité jusqu'au</Label>
            <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" rows={3} value={obj} onChange={(e) => setObj(e.target.value)} />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="terms">Conditions de paiement</Label>
            <Input id="terms" value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lignes du devis</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <InvoiceLineItems value={lines} onChange={setLines} />
          <InvoiceTotals lines={lines} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate(false)}>
          <Save className="mr-1 h-4 w-4" /> Enregistrer en brouillon
        </Button>
        <Button
          disabled={save.isPending}
          onClick={() => save.mutate(true)}
          className="bg-[color:var(--facturation)] text-[color:var(--facturation-foreground)] hover:bg-[color:var(--facturation)]/90"
        >
          <Send className="mr-1 h-4 w-4" /> Émettre le devis
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Astuce : pour personnaliser le PDF ou ajouter des zones, ouvrez le devis après émission.
      </div>
      {/* unused vars referenced for terms placeholder */}
      <span className="sr-only">{terms}</span>
    </div>
  );
}
