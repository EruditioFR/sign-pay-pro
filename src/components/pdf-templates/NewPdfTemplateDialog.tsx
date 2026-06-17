import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createPdfTemplateFromUpload,
  createDocumentFromPdfTemplate,
} from "@/lib/pdf-templates.functions";

interface Props {
  trigger?: ReactNode;
  onCreated?: (templateId: string) => void;
  /**
   * When true (default), the imported PDF is also instantiated as a new
   * document and the user lands directly in the zone editor (fields to fill /
   * sign). Set to false to only register a reusable template.
   */
  openEditorAfterImport?: boolean;
}

export function NewPdfTemplateDialog({ trigger, onCreated, openEditorAfterImport = true }: Props) {
  const { t: tr } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createFn = useServerFn(createPdfTemplateFromUpload);
  const instantiateFn = useServerFn(createDocumentFromPdfTemplate);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [documentType, setDocumentType] = useState("other");
  const [file, setFile] = useState<File | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Sélectionnez un PDF");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("description", description.trim());
      fd.append("document_type", documentType);
      const res = await createFn({ data: fd });
      const templateId = (res as { template?: { id?: string } })?.template?.id ?? null;
      if (openEditorAfterImport && templateId) {
        const inst = await instantiateFn({
          data: {
            templateId,
            title: name.trim() || file.name.replace(/\.pdf$/i, ""),
          },
        });
        const documentId = inst.document.id as string;
        return { templateId, documentId };
      }
      return { templateId, documentId: null as string | null };
    },
    onSuccess: ({ templateId, documentId }) => {
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
      setOpen(false);
      setName("");
      setDescription("");
      setDocumentType("other");
      setFile(null);
      if (documentId) {
        toast.success("PDF importé — placez vos zones à saisir / signer");
        navigate({ to: "/app/documents/$id/editor", params: { id: documentId } });
      } else {
        toast.success("Modèle PDF importé");
      }
      if (templateId && onCreated) onCreated(templateId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <FileUp className="mr-1 h-4 w-4" /> Nouveau modèle
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {openEditorAfterImport ? "Importer un PDF à compléter & signer" : "Importer un modèle PDF"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <section className="rounded-md border border-border p-3">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pdf-template-file">PDF source</Label>
                <Input
                  id="pdf-template-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] ?? null;
                    if (selected && selected.type !== "application/pdf") {
                      toast.error("Sélectionnez un fichier PDF");
                      e.target.value = "";
                      setFile(null);
                      return;
                    }
                    setFile(selected);
                    if (selected && !name.trim()) setName(selected.name.replace(/\.pdf$/i, ""));
                  }}
                  disabled={mut.isPending}
                />
                <p className="text-xs text-muted-foreground">PDF uniquement, 25 Mo maximum.</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pdf-template-name">Nom</Label>
                <Input
                  id="pdf-template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex : CERFA, contrat, mandat…"
                  disabled={mut.isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pdf-template-type">Type de document</Label>
                <Select value={documentType} onValueChange={setDocumentType} disabled={mut.isPending}>
                  <SelectTrigger id="pdf-template-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["purchase_order", "quote", "invoice", "contract", "other"] as const).map((type) => (
                      <SelectItem key={type} value={type}>
                        {tr(`documents.types.${type}`, { defaultValue: type })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pdf-template-description">Description (optionnel)</Label>
                <Textarea
                  id="pdf-template-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Usage interne, version du formulaire, consignes…"
                  disabled={mut.isPending}
                />
              </div>
              {openEditorAfterImport && (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  Après l'import, vous pourrez placer vos zones (texte, signature, image…) puis
                  choisir comment envoyer le document au destinataire (email ou WhatsApp).
                </p>
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mut.isPending}>Annuler</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !file || !name.trim()}>
            {mut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {openEditorAfterImport ? "Importer & placer les zones" : "Importer le PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
