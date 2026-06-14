import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { generateInvoiceCii } from "@/lib/einvoice-xml.functions";

/**
 * Exporte la facture en CII XML (profil BASIC, embarquable dans Factur-X).
 * Visible uniquement pour les documents de type `invoice`.
 *
 * Limites V1 :
 *  - livre un .xml, pas un PDF/A-3 Factur-X (embarquement à venir)
 *  - aucune dépôt PDP automatique
 */
export function ExportFacturXButton({ documentId, documentType }: {
  documentId: string;
  documentType: string;
}) {
  const [loading, setLoading] = useState(false);
  const generate = useServerFn(generateInvoiceCii);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => generate({ data: { document_id: documentId, mark_ready: true } }),
    onSuccess: (res) => {
      const blob = new Blob([res.xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({ queryKey: ["document", documentId] });
      if (res.issues.length > 0) {
        toast.warning(
          `Facture e-invoice générée — ${res.issues.length} champ(s) à compléter pour conformité PDP`,
          { description: res.issues.slice(0, 3).map((i) => `• ${i.message}`).join("\n") },
        );
      } else {
        toast.success("Facture e-invoice (Factur-X / CII) générée");
      }
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Échec de la génération");
    },
    onSettled: () => setLoading(false),
  });

  if (documentType !== "invoice") return null;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading || mutation.isPending}
      onClick={() => {
        setLoading(true);
        mutation.mutate();
      }}
      title="Export Factur-X (CII XML, profil BASIC)"
    >
      <FileCode2 className="mr-1 h-4 w-4" />
      {mutation.isPending ? "Export…" : "Factur-X"}
    </Button>
  );
}
