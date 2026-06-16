import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { createDocument, updateDocument } from "@/lib/documents.functions";
import { saveDocumentLines } from "@/lib/facturation.functions";
import { getMyBillingProfile } from "@/lib/organization.functions";
import { computeTotals, emptyLine } from "@/components/facturation/InvoiceLineItems";
import {
  DocumentStepperForm, emptyStepperDoc, type StepperDoc,
} from "@/components/facturation/DocumentStepperForm";
import type { OrgProfile } from "@/lib/invoice-compliance";

export const Route = createFileRoute("/_authenticated/app/facturation/devis/new")({
  component: NewQuotePage,
});

function NewQuotePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createDocument);
  const saveLinesFn = useServerFn(saveDocumentLines);
  const updateFn = useServerFn(updateDocument);
  const getOrgFn = useServerFn(getMyBillingProfile);

  const orgQ = useQuery({
    queryKey: ["billing-profile"],
    queryFn: () => getOrgFn(),
  });

  const [doc, setDoc] = useState<StepperDoc>(() => emptyStepperDoc());
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (orgQ.data && !seeded) {
      setDoc({ ...emptyStepperDoc(orgQ.data as OrgProfile | null), lines: [emptyLine()] });
      setSeeded(true);
    }
  }, [orgQ.data, seeded]);

  const save = useMutation({
    mutationFn: async (issue: boolean) => {
      if (!doc.title.trim()) throw new Error("L'objet est obligatoire.");
      const totals = computeTotals(doc.lines);
      const { document } = await createFn({
        data: {
          type: "quote",
          title: doc.title.trim(),
          description: doc.description || null,
          third_party_name: doc.third_party_name || null,
          third_party_email: doc.third_party_email || null,
          issue_date: doc.issue_date,
          due_date: doc.due_date,
          amount_ht: totals.ht,
          amount_ttc: totals.ttc,
          currency: "EUR",
        },
      });
      const docId = document.id as string;
      // Patch additional fields not handled by createDocument
      await updateFn({
        data: {
          id: docId,
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
          header_note: doc.header_note || null,
          footer_note: doc.footer_note || null,
          internal_note: doc.internal_note || null,
          legal_mentions: doc.legal_mentions || null,
        },
      });
      if (doc.lines.length > 0) {
        await saveLinesFn({ data: { documentId: docId, lines: doc.lines } });
      }
      return { document, issue };
    },
    onSuccess: ({ document, issue }) => {
      qc.invalidateQueries({ queryKey: ["facturation_quotes"] });
      toast.success(issue ? "Devis émis." : "Devis enregistré.");
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
        <p className="text-sm text-muted-foreground">
          4 étapes guidées pour un devis conforme (Art. L441-9 C.com).
        </p>
      </header>

      <DocumentStepperForm
        type="quote"
        org={(orgQ.data ?? null) as OrgProfile | null}
        value={doc}
        onChange={setDoc}
        footer={
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
        }
      />
    </div>
  );
}
