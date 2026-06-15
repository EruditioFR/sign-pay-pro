import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listDocumentTemplates,
  deleteDocumentTemplate,
  instantiateTemplate,
} from "@/lib/templates.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/confirm-action";
import { Plus, Pencil, Eye, Wand2, Trash2, LayoutTemplate, FileUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/templates/")({
  component: TemplatesIndexPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Introuvable.</div>,
});

function TemplatesIndexPage() {
  const router = useRouter();
  const list = useServerFn(listDocumentTemplates);
  const del = useServerFn(deleteDocumentTemplate);
  const inst = useServerFn(instantiateTemplate);

  const q = useQuery({ queryKey: ["app", "templates"], queryFn: () => list() });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Modèle supprimé");
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const instMut = useMutation({
    mutationFn: (id: string) => inst({ data: { id } }),
    onSuccess: (r) => {
      toast.success("Document créé depuis le modèle");
      router.navigate({ to: "/app/documents/$id", params: { id: r.documentId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = q.data?.templates ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Modèles de documents</h1>
          <p className="text-sm text-muted-foreground">Créez des modèles visuels réutilisables.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/app/templates/import"><FileUp className="h-4 w-4 mr-1.5" />Importer un document</Link>
          </Button>
          <Button asChild>
            <Link to="/app/templates/new"><Plus className="h-4 w-4 mr-1.5" />Nouveau modèle</Link>
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Chargement…</div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="Aucun modèle"
          description="Créez votre premier modèle visuel pour générer des documents en un clic."
          action={
            <Button asChild>
              <Link to="/app/templates/new"><Plus className="h-4 w-4 mr-1.5" />Créer un modèle</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="truncate">{t.name}</span>
                  {t.is_default && <Badge variant="secondary">Par défaut</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  {t.page_format ?? "A4"} · {t.page_orientation ?? "portrait"}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/app/templates/$id/edit" params={{ id: t.id }}>
                      <Pencil className="h-4 w-4 mr-1.5" />Éditer
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/app/templates/$id/preview" params={{ id: t.id }}>
                      <Eye className="h-4 w-4 mr-1.5" />Aperçu
                    </Link>
                  </Button>
                  <Button size="sm" onClick={() => instMut.mutate(t.id)} disabled={instMut.isPending}>
                    <Wand2 className="h-4 w-4 mr-1.5" />Utiliser
                  </Button>
                  <ConfirmAction
                    title="Supprimer ce modèle ?"
                    description="Cette action est irréversible."
                    onConfirm={() => delMut.mutate(t.id)}
                  >
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </ConfirmAction>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
