import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getDocumentTemplate, instantiateTemplate } from "@/lib/templates.functions";
import { CanvasSchema, emptyCanvas, type Canvas } from "@/lib/template-canvas/schema";
import { renderCanvasToHtml } from "@/lib/template-canvas/render";
import { Button } from "@/components/ui/button";
import { Pencil, Wand2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/templates/$id/preview")({
  component: PreviewTemplatePage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Modèle introuvable.</div>,
});

function PreviewTemplatePage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const get = useServerFn(getDocumentTemplate);
  const inst = useServerFn(instantiateTemplate);

  const q = useQuery({
    queryKey: ["app", "template", id],
    queryFn: () => get({ data: { id } }),
  });

  const instMut = useMutation({
    mutationFn: () => inst({ data: { id } }),
    onSuccess: (r) => {
      toast.success("Document créé");
      router.navigate({ to: "/app/documents/$id", params: { id: r.documentId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (q.error) return <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>;

  const tpl = q.data!.template;
  const parsed = CanvasSchema.safeParse(tpl.canvas_schema);
  const canvas: Canvas = parsed.success ? parsed.data : emptyCanvas();
  const html = renderCanvasToHtml(canvas);

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/app/templates"><ArrowLeft className="h-4 w-4 mr-1.5" />Retour</Link>
        </Button>
        <h1 className="text-lg font-semibold flex-1 min-w-0 truncate">{tpl.name}</h1>
        <Button size="sm" variant="outline" asChild>
          <Link to="/app/templates/$id/edit" params={{ id }}>
            <Pencil className="h-4 w-4 mr-1.5" />Éditer
          </Link>
        </Button>
        <Button size="sm" onClick={() => instMut.mutate()} disabled={instMut.isPending}>
          <Wand2 className="h-4 w-4 mr-1.5" />Utiliser ce modèle
        </Button>
      </div>
      <div className="bg-muted/40 p-6 overflow-auto" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
