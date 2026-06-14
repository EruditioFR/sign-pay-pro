import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getDocumentActivity } from "@/lib/exports.functions";
import { downloadDocumentActivityPdf } from "@/lib/exports-client";

export function DocumentActivityPdfButton({ documentId }: { documentId: string }) {
  const [busy, setBusy] = useState(false);
  const fetchActivity = useServerFn(getDocumentActivity);

  const handle = async () => {
    setBusy(true);
    try {
      const { document: doc, events } = await fetchActivity({ data: { documentId } });
      const fname = `historique-${doc.reference || doc.title || doc.id}-${new Date().toISOString().slice(0, 10)}.pdf`
        .replace(/[^a-zA-Z0-9._-]+/g, "_");
      await downloadDocumentActivityPdf(doc, events, fname);
      toast.success("Historique PDF généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la génération");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
      Historique PDF
    </Button>
  );
}
