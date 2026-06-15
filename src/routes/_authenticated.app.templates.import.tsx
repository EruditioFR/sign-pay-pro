import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUp, ArrowLeft } from "lucide-react";
import {
  uploadTemplateSource,
  saveOverlayTemplate,
} from "@/lib/document-overlay.functions";
import {
  OverlayEditor,
  type OverlayEditorSource,
} from "@/components/overlay-editor/OverlayEditor";

export const Route = createFileRoute("/_authenticated/app/templates/import")({
  component: ImportTemplatePage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Introuvable.</div>,
});

function ImportTemplatePage() {
  const router = useRouter();
  const upload = useServerFn(uploadTemplateSource);
  const save = useServerFn(saveOverlayTemplate);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<OverlayEditorSource | null>(null);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return upload({ data: fd });
    },
    onSuccess: (r) => {
      if (!r.signedUrl) {
        toast.error("Impossible d'obtenir une URL d'aperçu");
        return;
      }
      setSource({
        url: r.signedUrl,
        mime: r.mime,
        storagePath: r.storagePath,
        pageCount: r.pageCount,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: (input: { name: string; zones: import("@/lib/template-overlay/schema").OverlayZone[] }) =>
      save({
        data: {
          name: input.name,
          sourceStoragePath: source!.storagePath,
          sourceMime: source!.mime,
          sourcePageCount: source!.pageCount,
          zones: input.zones,
        },
      }),
    onSuccess: () => {
      toast.success("Modèle enregistré");
      router.navigate({ to: "/app/templates" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen">
      <div className="px-4 py-3 border-b flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/app/templates"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Link>
        </Button>
        <h1 className="text-base font-semibold">Importer un document</h1>
      </div>

      {!source ? (
        <div className="p-6 max-w-xl mx-auto">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <FileUp className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">Étape 1 — Charger le document</div>
                <div className="text-sm text-muted-foreground">
                  PDF, PNG ou JPG. Taille maximale&nbsp;: 25&nbsp;Mo.
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="file">Fichier source</Label>
              <Input
                ref={fileInputRef}
                id="file"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMut.mutate(f);
                }}
                disabled={uploadMut.isPending}
              />
            </div>
            {uploadMut.isPending && (
              <div className="text-sm text-muted-foreground">Envoi en cours…</div>
            )}
            <p className="text-xs text-muted-foreground">
              Le document est stocké chiffré dans votre espace. Vous pourrez ensuite
              tracer les zones dynamiques (signatures, champs BDD, saisies…).
            </p>
          </Card>
        </div>
      ) : (
        <OverlayEditor
          source={source}
          saving={saveMut.isPending}
          onSave={(p) => saveMut.mutate(p)}
        />
      )}
    </div>
  );
}
