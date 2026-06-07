import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, useEffect } from "react";
import { z } from "zod";
import { WysiwygEditor } from "@/components/wysiwyg/WysiwygEditor";
import { exportEditorToPdf } from "@/components/wysiwyg/html-to-pdf";
import {
  saveWysiwygDraft, getWysiwygDraft, finalizeWysiwygDocument,
} from "@/lib/wysiwyg-documents.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Save, FileDown, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ draftId: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/app/documents/new/wysiwyg")({
  validateSearch: searchSchema,
  component: WysiwygNewDocPage,
});

function WysiwygNewDocPage() {
  const navigate = useNavigate();
  const { draftId } = Route.useSearch();
  const editorRootRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("Nouveau document");
  const [docType, setDocType] = useState<
    "purchase_order" | "quote" | "invoice" | "contract" | "other"
  >("other");
  const [html, setHtml] = useState<string>("");
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(draftId);

  const getDraftFn = useServerFn(getWysiwygDraft);
  const saveFn = useServerFn(saveWysiwygDraft);
  const finalizeFn = useServerFn(finalizeWysiwygDocument);

  const draftQ = useQuery({
    queryKey: ["wysiwyg-draft", draftId],
    queryFn: () => getDraftFn({ data: { id: draftId! } }),
    enabled: !!draftId,
  });

  useEffect(() => {
    if (draftQ.data?.draft) {
      setTitle(draftQ.data.draft.title);
      setHtml(draftQ.data.draft.html);
      setCurrentDraftId(draftQ.data.draft.id);
    }
  }, [draftQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: { id: currentDraftId, title: title.trim() || "Sans titre", html },
      }),
    onSuccess: (res) => {
      setCurrentDraftId(res.draft.id);
      toast.success("Brouillon enregistré");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finalizeMut = useMutation({
    mutationFn: async () => {
      // ensure draft saved
      const saved = await saveFn({
        data: { id: currentDraftId, title: title.trim() || "Sans titre", html },
      });
      setCurrentDraftId(saved.draft.id);
      if (!editorRootRef.current) throw new Error("Éditeur introuvable");
      const out = await exportEditorToPdf(editorRootRef.current);
      return finalizeFn({
        data: {
          draftId: saved.draft.id,
          title: title.trim() || "Sans titre",
          document_type: docType,
          pdfBase64: out.pdfBase64,
          fields: out.fields,
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Document généré");
      navigate({
        to: "/app/documents/$id/editor",
        params: { id: res.documentId },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/drafts"><ArrowLeft className="mr-1 h-4 w-4" /> Brouillons</Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Enregistrer brouillon
          </Button>
          <Button size="sm" onClick={() => finalizeMut.mutate()} disabled={finalizeMut.isPending}>
            {finalizeMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}
            Générer PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_240px]">
          <div className="grid gap-1.5">
            <Label htmlFor="doc-title">Titre du document</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as typeof docType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="quote">Devis</SelectItem>
                <SelectItem value="invoice">Facture</SelectItem>
                <SelectItem value="purchase_order">Bon de commande</SelectItem>
                <SelectItem value="contract">Contrat</SelectItem>
                <SelectItem value="other">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <WysiwygEditor
        initialHtml={html}
        onChange={setHtml}
        editorRootRef={editorRootRef}
      />

      <p className="text-xs text-muted-foreground text-center">
        Astuce : cliquez sur un champ inséré pour modifier son libellé. Les positions des champs seront converties en zones interactives dans le PDF généré.
      </p>
    </div>
  );
}
