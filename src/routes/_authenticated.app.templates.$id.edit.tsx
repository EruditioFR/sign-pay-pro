import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { TemplateEditor } from "@/components/template-editor/TemplateEditor";
import { getDocumentTemplate, saveTemplateCanvas } from "@/lib/templates.functions";
import { CanvasSchema, emptyCanvas, type Canvas } from "@/lib/template-canvas/schema";
import { renderCanvasToHtml } from "@/lib/template-canvas/render";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/templates/$id/edit")({
  component: EditTemplatePage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Modèle introuvable.</div>,
});

function EditTemplatePage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const get = useServerFn(getDocumentTemplate);
  const save = useServerFn(saveTemplateCanvas);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["app", "template", id],
    queryFn: () => get({ data: { id } }),
  });

  const saveMut = useMutation({
    mutationFn: (input: { name: string; canvas: Canvas }) =>
      save({
        data: {
          id,
          name: input.name,
          page_format: input.canvas.page.format,
          page_orientation: input.canvas.page.orientation,
          canvas: input.canvas,
        },
      }),
    onSuccess: () => {
      toast.success("Modèle enregistré");
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (q.error) return <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>;

  const tpl = q.data!.template;
  const parsed = CanvasSchema.safeParse(tpl.canvas_schema);
  const canvas: Canvas = parsed.success
    ? parsed.data
    : emptyCanvas(
        (tpl.page_format as "A4" | "A5" | "LETTER" | null) ?? "A4",
        (tpl.page_orientation as "portrait" | "landscape" | null) ?? "portrait",
      );

  return (
    <>
      <TemplateEditor
        initialName={tpl.name}
        initialCanvas={canvas}
        saving={saveMut.isPending}
        onSave={async (p) => {
          await saveMut.mutateAsync(p);
        }}
        onPreview={(c) => setPreviewHtml(renderCanvasToHtml(c))}
      />
      <Dialog open={!!previewHtml} onOpenChange={(v) => !v && setPreviewHtml(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Aperçu — {tpl.name}</DialogTitle></DialogHeader>
          <div dangerouslySetInnerHTML={{ __html: previewHtml ?? "" }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
