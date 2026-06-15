import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listWysiwygDrafts, deleteWysiwygDraft,
} from "@/lib/wysiwyg-documents.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/confirm-action";
import { FilePlus2, FileText, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/drafts/")({
  component: DraftsListPage,
});

function DraftsListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listWysiwygDrafts);
  const delFn = useServerFn(deleteWysiwygDraft);

  const { data, isLoading } = useQuery({
    queryKey: ["wysiwyg-drafts"],
    queryFn: () => listFn(),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Brouillon supprimé");
      qc.invalidateQueries({ queryKey: ["wysiwyg-drafts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">Brouillons</h1>
          <p className="text-sm text-muted-foreground">
            Documents créés depuis l'éditeur WYSIWYG, non encore publiés.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/app/documents/wysiwyg">
            <FilePlus2 className="mr-1 h-4 w-4" /> Nouveau brouillon
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> Chargement…</p>
      ) : (data?.drafts ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun brouillon"
          description="Démarrez un nouveau document depuis l'éditeur WYSIWYG pour le retrouver ici."
          action={
            <Button asChild>
              <Link to="/app/documents/wysiwyg">
                <FilePlus2 className="mr-1 h-4 w-4" /> Nouveau brouillon
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2">
          {data!.drafts.map((d) => (
            <Card key={d.id} className="hover:bg-accent/40">
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <button
                  type="button"
                  className="flex flex-1 min-w-0 items-center gap-2 text-left"
                  onClick={() => navigate({ to: "/app/documents/wysiwyg", search: { draftId: d.id } })}
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Modifié {new Date(d.updated_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </button>
                <ConfirmAction
                  title="Supprimer ce brouillon ?"
                  description={`« ${d.title} » sera définitivement supprimé. Cette action est irréversible.`}
                  confirmLabel="Supprimer"
                  onConfirm={() => del.mutateAsync(d.id)}
                  disabled={del.isPending}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Supprimer le brouillon"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </ConfirmAction>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
