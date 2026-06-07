import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listWysiwygDrafts, deleteWysiwygDraft,
} from "@/lib/wysiwyg-documents.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brouillons</h1>
          <p className="text-sm text-muted-foreground">
            Documents créés depuis l'éditeur WYSIWYG, non encore publiés.
          </p>
        </div>
        <Button asChild>
          <Link to="/app/documents/wysiwyg">
            <FilePlus2 className="mr-1 h-4 w-4" /> Nouveau brouillon
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> Chargement…</p>
      ) : (data?.drafts ?? []).length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Aucun brouillon. Cliquez sur « Nouveau brouillon » pour commencer.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {data!.drafts.map((d) => (
            <Card key={d.id} className="hover:bg-accent/40 cursor-pointer">
              <CardContent className="flex items-center justify-between gap-3 p-3"
                onClick={() => navigate({ to: "/app/documents/wysiwyg", search: { draftId: d.id } })}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Modifié {new Date(d.updated_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); del.mutate(d.id); }}
                  disabled={del.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
