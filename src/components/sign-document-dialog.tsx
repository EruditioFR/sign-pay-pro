import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import SignatureCanvas from "react-signature-canvas";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { PenLine, Eraser, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import {
  signDocumentInternal,
  getCurrentDocumentPdfUrl,
} from "@/lib/sharing.functions";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type Placement = {
  page_index: number;
  // Top-left origin, in PDF points.
  x: number;
  y: number;
  width: number;
};

export function SignDocumentDialog({
  documentId,
  defaultName,
  defaultEmail,
}: {
  documentId: string;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const sigRef = useRef<SignatureCanvas | null>(null);
  const qc = useQueryClient();
  const fn = useServerFn(signDocumentInternal);
  const fetchUrl = useServerFn(getCurrentDocumentPdfUrl);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pagePoints, setPagePoints] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [renderScale, setRenderScale] = useState(1);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [locked, setLocked] = useState(false);
  const [sigWidthPt, setSigWidthPt] = useState(140);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const urlQ = useQuery({
    queryKey: ["sign-pdf-url", documentId, open],
    queryFn: () => fetchUrl({ data: { document_id: documentId } }),
    enabled: open,
  });

  // Load PDF document when URL is available
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  useEffect(() => {
    if (!open || !urlQ.data?.url) return;
    let cancelled = false;
    (async () => {
      const task = pdfjsLib.getDocument({ url: urlQ.data!.url! });
      const doc = await task.promise;
      if (cancelled) return;
      pdfDocRef.current = doc;
      setPageCount(doc.numPages);
      setPageIndex(0);
      setPlacement(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, urlQ.data?.url]);

  // Render the selected page
  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || pageCount === 0) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      const baseViewport = page.getViewport({ scale: 1 });
      const containerW = canvas.parentElement?.clientWidth ?? 480;
      const scale = Math.min(containerW / baseViewport.width, 1.6);
      const viewport = page.getViewport({ scale });
      if (cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (cancelled) return;
      setPagePoints({ w: baseViewport.width, h: baseViewport.height });
      setRenderScale(scale);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageIndex, pageCount]);

  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  const clampPlacement = (p: Placement): Placement => {
    const h = p.width * 0.4;
    return {
      ...p,
      x: Math.min(Math.max(0, p.x), Math.max(0, pagePoints.w - p.width)),
      y: Math.min(Math.max(0, p.y), Math.max(0, pagePoints.h - h)),
    };
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks that originated from a drag on the existing box.
    if (dragRef.current) return;
    const rect = (overlayRef.current ?? e.currentTarget).getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const xPt = xPx / renderScale;
    const yPt = yPx / renderScale;
    setPlacement(
      clampPlacement({
        page_index: pageIndex,
        x: xPt - sigWidthPt / 2,
        y: yPt - (sigWidthPt * 0.4) / 2,
        width: sigWidthPt,
      }),
    );
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placement) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = overlayRef.current!.getBoundingClientRect();
    const pointerXPt = (e.clientX - rect.left) / renderScale;
    const pointerYPt = (e.clientY - rect.top) / renderScale;
    dragRef.current = {
      offsetX: pointerXPt - placement.x,
      offsetY: pointerYPt - placement.y,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !placement) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const pointerXPt = (e.clientX - rect.left) / renderScale;
    const pointerYPt = (e.clientY - rect.top) / renderScale;
    setPlacement(
      clampPlacement({
        ...placement,
        x: pointerXPt - dragRef.current.offsetX,
        y: pointerYPt - dragRef.current.offsetY,
      }),
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    }
    // Defer clearing so the synthesized click event sees the drag flag.
    setTimeout(() => {
      dragRef.current = null;
    }, 0);
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t("public.need_name"));
      if (!sigRef.current || sigRef.current.isEmpty()) throw new Error(t("public.need_signature"));
      if (placement && !locked) {
        throw new Error("Veuillez confirmer le placement de la signature.");
      }
      const dataUrl = sigRef.current.getCanvas().toDataURL("image/png");
      return fn({
        data: {
          document_id: documentId,
          signer_name: name.trim(),
          signer_email: email.trim() || null,
          signature_image_b64: dataUrl,
          placement,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`${t("public.signed_ok")} (SHA-256: ${res.hash.slice(0, 12)}…)`);
      qc.invalidateQueries({ queryKey: ["doc_signatures", documentId] });
      qc.invalidateQueries({ queryKey: ["document", documentId] });
      setOpen(false);
      sigRef.current?.clear();
      setPlacement(null);
      setLocked(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sigBoxStyle = placement
    ? {
        left: placement.x * renderScale,
        top: placement.y * renderScale,
        width: placement.width * renderScale,
        height: placement.width * 0.4 * renderScale,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PenLine className="mr-1 h-4 w-4" />
          {t("public.sign")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("public.sign")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("public.signer_name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
            </div>
            <div className="space-y-1">
              <Label>{t("public.signer_email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("public.draw_signature")}</Label>
              <div className="rounded-md border border-border bg-background">
                <SignatureCanvas
                  ref={sigRef}
                  canvasProps={{ className: "w-full h-32 touch-none" }}
                  penColor="black"
                />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => sigRef.current?.clear()}>
                <Eraser className="mr-1 h-4 w-4" />
                {t("public.clear")}
              </Button>
            </div>

            <div className="space-y-1">
              <Label>Largeur de la signature ({Math.round(sigWidthPt)} pt)</Label>
              <Slider
                min={60}
                max={300}
                step={5}
                value={[sigWidthPt]}
                disabled={locked}
                onValueChange={(v) => {
                  setSigWidthPt(v[0]);
                  if (placement) setPlacement({ ...placement, width: v[0] });
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Page</Label>
              {pageCount > 0 ? (
                <Select
                  value={String(pageIndex)}
                  onValueChange={(v) => {
                    setPageIndex(Number(v));
                    setPlacement(null);
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: pageCount }).map((_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        Page {i + 1} / {pageCount}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {urlQ.isLoading ? "Chargement…" : urlQ.data?.url ? "…" : "Aucun PDF"}
                </span>
              )}
            </div>

            <div className="relative w-full overflow-hidden rounded-md border border-border bg-muted">
              <canvas ref={canvasRef} className="block w-full" />
              {pageCount > 0 && (
                <div
                  ref={overlayRef}
                  onClick={handleClick}
                  className="absolute inset-0 cursor-crosshair"
                  title="Cliquez pour placer la signature"
                >
                  {sigBoxStyle && (
                    <div
                      className="absolute rounded border-2 border-dashed border-primary bg-primary/10 cursor-move touch-none select-none"
                      style={sigBoxStyle}
                      onPointerDown={startDrag}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    />
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {placement
                ? `Position : page ${placement.page_index + 1}, x=${Math.round(placement.x)}pt, y=${Math.round(placement.y)}pt`
                : pageCount > 0
                  ? "Cliquez sur la page à l’endroit où placer la signature."
                  : "Aucun PDF actuel — la signature sera ajoutée sur une page dédiée."}
            </p>
            {pagePoints.h > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Page {pageIndex + 1} : {Math.round(pagePoints.w)}×{Math.round(pagePoints.h)} pt
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? t("common.loading") : t("public.sign_now")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
