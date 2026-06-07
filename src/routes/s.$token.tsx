import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import type * as PdfJs from "pdfjs-dist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { FileText, PenLine, CheckCircle2, Clock, Ban, ChevronLeft, ChevronRight, MousePointerClick } from "lucide-react";

let _pdfjs: typeof PdfJs | null = null;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const mod = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  mod.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = mod;
  return mod;
}

export const Route = createFileRoute("/s/$token")({
  component: PublicSignRequestPage,
});

interface Placement {
  page_index: number;
  x: number;
  y: number;
  width: number;
}

interface SignData {
  document: {
    id: string;
    title: string;
    reference: string | null;
    amount_ttc: number | null;
    currency: string;
    issue_date: string | null;
  };
  organization: { name: string; country: string } | null;
  pdfUrl: string | null;
  request: {
    id: string;
    signer_name: string;
    signer_email: string;
    order_index: number;
    sequential: boolean;
    status: "pending" | "signed" | "declined" | "cancelled";
    expires_at: string | null;
    signed_at: string | null;
  };
  can_sign: boolean;
}

function PublicSignRequestPage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<SignData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<"signed" | "declined" | null>(null);

  const refresh = () => {
    setLoading(true);
    fetch(`/api/public/sign-request/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("invalid"))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [token]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Chargement…</div>;
  }
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold">Lien invalide ou expiré</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cette invitation de signature n'est plus accessible.
          </p>
        </div>
      </div>
    );
  }

  const status = done ?? data.request.status;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold">{data.organization?.name}</div>
            <div className="text-xs text-muted-foreground">
              Invitation à signer · {data.request.signer_name}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{data.document.title}</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {data.document.reference && <span>N° {data.document.reference}</span>}
              {data.document.issue_date && <span>· {data.document.issue_date}</span>}
              {data.document.amount_ttc != null && (
                <span className="font-semibold text-foreground">
                  · {data.document.amount_ttc.toLocaleString()} {data.document.currency}
                </span>
              )}
            </div>
          </CardHeader>
        </Card>

        {status === "signed" && (
          <StatusBox tone="ok" icon={<CheckCircle2 className="h-5 w-5" />}>
            Signature enregistrée. Merci !
          </StatusBox>
        )}
        {status === "declined" && (
          <StatusBox tone="warn" icon={<Ban className="h-5 w-5" />}>
            Vous avez refusé de signer ce document.
          </StatusBox>
        )}
        {status === "cancelled" && (
          <StatusBox tone="warn" icon={<Ban className="h-5 w-5" />}>
            Cette invitation a été annulée par l'émetteur.
          </StatusBox>
        )}
        {status === "pending" && !data.can_sign && (
          <StatusBox tone="info" icon={<Clock className="h-5 w-5" />}>
            En attente de la signature des signataires précédents avant que vous puissiez signer.
          </StatusBox>
        )}

        {status === "pending" && data.can_sign ? (
          <SignWithPlacement
            token={token}
            pdfUrl={data.pdfUrl}
            signerName={data.request.signer_name}
            onSigned={() => {
              setDone("signed");
              refresh();
            }}
            onDeclined={() => {
              setDone("declined");
              refresh();
            }}
          />
        ) : data.pdfUrl ? (
          <Card>
            <CardContent className="p-3">
              <iframe src={data.pdfUrl} className="h-[60vh] w-full rounded border" title="PDF" />
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}

function StatusBox({
  tone,
  icon,
  children,
}: {
  tone: "ok" | "warn" | "info";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return (
    <div className={`flex items-center gap-3 rounded-md p-4 ${toneClass}`}>
      {icon}
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

function SignWithPlacement({
  token,
  pdfUrl,
  signerName,
  onSigned,
  onDeclined,
}: {
  token: string;
  pdfUrl: string | null;
  signerName: string;
  onSigned: () => void;
  onDeclined: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<PdfJs.PDFDocumentProxy | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pagePoints, setPagePoints] = useState({ w: 595, h: 842 });
  const [renderScale, setRenderScale] = useState(1);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [sigWidthPt, setSigWidthPt] = useState(140);

  const sigRef = useRef<SignatureCanvas | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [showFreePlacement, setShowFreePlacement] = useState(true);

  // Load PDF
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      const task = pdfjsLib.getDocument({ url: pdfUrl });
      const doc = await task.promise;
      if (cancelled) return;
      pdfDocRef.current = doc;
      setPageCount(doc.numPages);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // Render current page
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
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
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
    if (!showFreePlacement) return;
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
    if (dragRef.current) {
      (e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId);
      setTimeout(() => (dragRef.current = null), 0);
    }
  };

  const sign = async () => {
    if (sigRef.current?.isEmpty()) return toast.error("Veuillez signer dans le cadre.");
    setSubmitting(true);
    try {
      const dataUrl = sigRef.current!.getCanvas().toDataURL("image/png");
      const body: Record<string, unknown> = { action: "sign", signature_image_b64: dataUrl };
      if (showFreePlacement && placement) {
        body.placement = placement;
      }
      const res = await fetch(`/api/public/sign-request/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Échec");
      }
      onSigned();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const decline = async () => {
    setDeclining(true);
    try {
      const res = await fetch(`/api/public/sign-request/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decline", reason: reason || null }),
      });
      if (!res.ok) throw new Error("Échec");
      onDeclined();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeclining(false);
    }
  };

  const sigHeightPt = sigWidthPt * 0.4;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PenLine className="h-4 w-4" /> Signer ce document
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pdfUrl ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  disabled={pageIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm tabular-nums">
                  Page {pageIndex + 1} / {pageCount || "…"}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
                  disabled={pageIndex >= pageCount - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={showFreePlacement}
                  onChange={(e) => setShowFreePlacement(e.target.checked)}
                />
                Placer ma signature librement
              </label>
            </div>

            <div
              ref={overlayRef}
              onClick={handleClick}
              className={`relative w-full overflow-hidden rounded border bg-muted/20 ${
                showFreePlacement ? "cursor-crosshair" : ""
              }`}
            >
              <canvas ref={canvasRef} className="block w-full" />
              {showFreePlacement && !placement && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full bg-foreground/80 px-3 py-1 text-xs text-background flex items-center gap-1">
                    <MousePointerClick className="h-3 w-3" />
                    Cliquez où placer votre signature
                  </div>
                </div>
              )}
              {showFreePlacement && placement && placement.page_index === pageIndex && (
                <div
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="absolute cursor-move rounded border-2 border-primary bg-primary/10"
                  style={{
                    left: placement.x * renderScale,
                    top: placement.y * renderScale,
                    width: placement.width * renderScale,
                    height: sigHeightPt * renderScale,
                  }}
                >
                  <div className="absolute -top-5 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    {signerName}
                  </div>
                </div>
              )}
            </div>

            {showFreePlacement && (
              <div>
                <Label className="text-xs">Taille de la signature</Label>
                <Slider
                  value={[sigWidthPt]}
                  min={80}
                  max={260}
                  step={10}
                  onValueChange={(v) => {
                    setSigWidthPt(v[0]);
                    if (placement) setPlacement(clampPlacement({ ...placement, width: v[0] }));
                  }}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun PDF disponible.</p>
        )}

        <div>
          <Label>Tracez votre signature</Label>
          <div className="mt-1 rounded-md border bg-background">
            <SignatureCanvas ref={sigRef} canvasProps={{ className: "w-full h-40" }} />
          </div>
          <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => sigRef.current?.clear()}>
            Effacer
          </Button>
        </div>

        <Button
          onClick={sign}
          disabled={submitting || (showFreePlacement && !placement)}
          className="w-full"
        >
          {submitting
            ? "Envoi…"
            : showFreePlacement && !placement
              ? "Placez votre signature sur le document"
              : "Signer maintenant"}
        </Button>

        {!showDecline ? (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowDecline(true)}>
            Refuser de signer
          </Button>
        ) : (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>Motif (optionnel)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Expliquez brièvement pourquoi vous refusez."
            />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={decline} disabled={declining}>
                Confirmer le refus
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowDecline(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
