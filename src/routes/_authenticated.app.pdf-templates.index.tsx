import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listPdfTemplates,
  deletePdfTemplate,
  createDocumentFromPdfTemplate,
} from "@/lib/pdf-templates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, Trash2, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/pdf-templates/")({
  component: PdfTemplatesPage,
});

function PdfTemplatesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPdfTemplates);
  const delFn = useServerFn(deletePdfTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["pdf-templates"],
    queryFn: () => listFn(),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Modèle supprimé");
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Modèles PDF</h1>
          <p className="text-sm text-muted-foreground">
            Réutilisez un document avec ses zones en un clic.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (data?.templates ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Aucun modèle pour l'instant. Ouvrez un document, ajoutez vos zones, puis
            cliquez sur « Enregistrer comme modèle » dans l'éditeur PDF.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data!.templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  <span className="truncate">{t.name}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {t.description && (
                  <p className="line-clamp-2 text-muted-foreground">{t.description}</p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-2 py-0.5">{t.document_type}</span>
                  <span className="rounded bg-muted px-2 py-0.5">{t.page_count} page(s)</span>
                  <span className="rounded bg-muted px-2 py-0.5">{t.field_count} zone(s)</span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <UseTemplateDialog templateId={t.id} templateName={t.name} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("Supprimer ce modèle ?")) del.mutate(t.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UseTemplateDialog({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [thirdPartyName, setThirdPartyName] = useState("");
  const [thirdPartyEmail, setThirdPartyEmail] = useState("");
  const navigate = useNavigate();
  const createFn = useServerFn(createDocumentFromPdfTemplate);

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          templateId,
          title: title || templateName,
          reference: reference || null,
          third_party_name: thirdPartyName || null,
          third_party_email: thirdPartyEmail || null,
        },
      }),
    onSuccess: ({ document }) => {
      toast.success("Document créé depuis le modèle");
      setOpen(false);
      navigate({ to: "/app/documents/$id", params: { id: document.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Wand2 className="mr-1 h-4 w-4" /> Utiliser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau document depuis « {templateName} »</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="t-title">Titre</Label>
            <Input
              id="t-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={templateName}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-ref">Référence</Label>
            <Input id="t-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-tpn">Destinataire</Label>
            <Input
              id="t-tpn"
              value={thirdPartyName}
              onChange={(e) => setThirdPartyName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-tpe">Email destinataire</Label>
            <Input
              id="t-tpe"
              type="email"
              value={thirdPartyEmail}
              onChange={(e) => setThirdPartyEmail(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Créer le document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function _ensureLinkImport() {
  return Link;
}
