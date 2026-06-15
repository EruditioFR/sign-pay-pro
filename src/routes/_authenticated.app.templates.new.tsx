import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { TemplateEditor } from "@/components/template-editor/TemplateEditor";
import { saveTemplateCanvas } from "@/lib/templates.functions";
import type { Canvas } from "@/lib/template-canvas/schema";
import { renderCanvasToHtml } from "@/lib/template-canvas/render";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/templates/new")({
  component: NewTemplatePage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Introuvable.</div>,
});

function NewTemplatePage() {
  const router = useRouter();
  const save = useServerFn(saveTemplateCanvas);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const saveMut = useMutation({
    mutationFn: (input: { name: string; canvas: Canvas }) =>
      save({
        data: {
          name: input.name,
          page_format: input.canvas.page.format,
          page_orientation: input.canvas.page.orientation,
          canvas: input.canvas,
        },
      }),
    onSuccess: (r) => {
      toast.success("Modèle enregistré");
      router.navigate({ to: "/app/templates/$id/edit", params: { id: r.template.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <TemplateEditor
        onSave={async (p) => {
          await saveMut.mutateAsync(p);
        }}
        onPreview={(c) => setPreviewHtml(renderCanvasToHtml(c))}
        saving={saveMut.isPending}
      />
      <Dialog open={!!previewHtml} onOpenChange={(v) => !v && setPreviewHtml(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Aperçu</DialogTitle></DialogHeader>
          <div dangerouslySetInnerHTML={{ __html: previewHtml ?? "" }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
