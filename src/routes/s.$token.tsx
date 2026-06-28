import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type SignatureCanvas from "react-signature-canvas";
import { ResponsiveSignatureCanvas } from "@/components/responsive-signature-canvas";
import type * as PdfJs from "pdfjs-dist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText,
  PenLine,
  CheckCircle2,
  Clock,
  Ban,
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
  CreditCard,
} from "lucide-react";
import { PdfJsViewer } from "@/components/pdf-js-viewer";

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

interface RecipientField {
  id: string;
  page_index: number;
  kind: "text" | "date" | "checkbox" | "signature" | "initials";
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
  label: string | null;
  required: boolean;
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
    signature_level?: "ses" | "aes" | "qes";
    auth_method_required?: string;
  };
  conformity?: {
    signature_level: "ses" | "aes" | "qes";
    consent_text: string;
    consent_version: string;
    module_version: string;
  };
  recipient_fields?: RecipientField[];
  can_sign: boolean;
  pay?: {
    share_link_token: string;
    amount_ttc: number | null;
    currency: string;
    is_fully_paid: boolean;
  } | null;
}

function PublicSignRequestPage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<SignData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<"signed" | "declined" | null>(null);

  const refresh = (showLoader = true) => {
    if (showLoader) setLoading(true);
    fetch(`/api/public/sign-request/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("invalid");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("invalid"))
      .finally(() => {
        if (showLoader) setLoading(false);
      });
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
  const isSignedView = status === "signed";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold">{data.organization?.name}</div>
            <div className="text-xs text-muted-foreground">
              {isSignedView ? "Document signé" : "Invitation à signer"} · {data.request.signer_name}
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

        {data.pay && (data.pay.amount_ttc ?? 0) > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {data.pay.is_fully_paid ? "Paiement reçu" : "Paiement demandé"}
                </div>
                <div className="text-sm text-muted-foreground">
                  Montant :{" "}
                  <span className="font-medium text-foreground">
                    {(data.pay.amount_ttc ?? 0).toLocaleString()} {data.pay.currency}
                  </span>
                </div>
              </div>
              {!data.pay.is_fully_paid && (
                <Button asChild>
                  <a href={`/p/${data.pay.share_link_token}?pay=1`} target="_blank" rel="noopener noreferrer">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Payer maintenant
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {status === "pending" && data.can_sign ? (
          <SignWithPlacement
            token={token}
            pdfUrl={data.pdfUrl}
            signerName={data.request.signer_name}
            consentText={data.conformity?.consent_text}
            signatureLevel={data.conformity?.signature_level ?? "ses"}
            recipientFields={data.recipient_fields ?? []}
            onSigned={(pdfUrl) => {
              setDone("signed");
              if (pdfUrl) setData((current) => (current ? { ...current, pdfUrl } : current));
              refresh(false);
            }}
            onDeclined={() => {
              setDone("declined");
              refresh();
            }}
          />
        ) : data.pdfUrl ? (
          <Card>
            <CardContent className="space-y-3 p-3">
              <PdfJsViewer url={data.pdfUrl} className="h-[70vh] w-full" />
              {isSignedView && (
                <div className="flex justify-end">
                  <Button asChild>
                    <a href={data.pdfUrl} download={`${data.document.reference ?? data.document.title}-signe.pdf`}>
                      Télécharger le PDF signé
                    </a>
                  </Button>
                </div>
              )}
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
  consentText,
  signatureLevel,
  recipientFields,
  onSigned,
  onDeclined,
}: {
  token: string;
  pdfUrl: string | null;
  signerName: string;
  consentText?: string;
  signatureLevel: "ses" | "aes" | "qes";
  recipientFields: RecipientField[];
  onSigned: (pdfUrl?: string | null) => void;
  onDeclined: () => void;
}) {
  const [consentAccepted, setConsentAccepted] = useState(false);
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
  const modalSigRef = useRef<SignatureCanvas | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);

  // Field values keyed by field id. For signature/initials, the value is the dataURL.
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  // Currently-open signature modal target.
  const [signatureModalField, setSignatureModalField] = useState<RecipientField | null>(null);

  const hasRecipientFields = recipientFields.length > 0;
  const hasRecipientSignatureField = recipientFields.some(
    (f) => f.kind === "signature" || f.kind === "initials",
  );
  // Free placement only when the sender hasn't pre-placed signature zones.
  const [showFreePlacement, setShowFreePlacement] = useState(!hasRecipientSignatureField);

  // Load PDF
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      const pdfjs = await loadPdfjs();
      const task = pdfjs.getDocument({ url: pdfUrl });
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

  const getFieldLabel = (f: RecipientField) =>
    f.label ||
    (f.kind === "date"
      ? "Date"
      : f.kind === "checkbox"
        ? "Case à cocher"
        : f.kind === "signature"
          ? "Signature"
          : f.kind === "initials"
            ? "Paraphe"
            : "Texte");

  const isFieldFilled = (f: RecipientField) => {
    const val = fieldValues[f.id] ?? "";
    if (f.kind === "signature" || f.kind === "initials") return val.startsWith("data:image/");
    if (f.kind === "checkbox") return true; // checked or not, valid
    return !!val.trim();
  };

  // Pending mandatory fields (anything not filled yet).
  const missingFields = useMemo(
    () => recipientFields.filter((f) => !isFieldFilled(f)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipientFields, fieldValues],
  );

  // Focus a text/date input by id and scroll its zone into view.
  const focusTextField = (f: RecipientField) => {
    if (f.page_index !== pageIndex) setPageIndex(f.page_index);
    setTimeout(() => {
      const el = document.getElementById(`recipient-field-${f.id}`) as HTMLInputElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 60);
  };

  const openSignatureModal = (f: RecipientField) => {
    if (f.page_index !== pageIndex) setPageIndex(f.page_index);
    setSignatureModalField(f);
  };

  const goToField = (f: RecipientField) => {
    if (f.kind === "signature" || f.kind === "initials") openSignatureModal(f);
    else if (f.kind === "checkbox") {
      if (f.page_index !== pageIndex) setPageIndex(f.page_index);
    } else focusTextField(f);
  };

  const placeAtClientPoint = (clientX: number, clientY: number) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPt = (clientX - rect.left) / renderScale;
    const yPt = (clientY - rect.top) / renderScale;
    setPlacement(
      clampPlacement({
        page_index: pageIndex,
        x: xPt - sigWidthPt / 2,
        y: yPt - (sigWidthPt * 0.4) / 2,
        width: sigWidthPt,
      }),
    );
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!showFreePlacement) return;
    if (dragRef.current) return;
    placeAtClientPoint(e.clientX, e.clientY);
  };

  const handleOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!showFreePlacement || dragRef.current || e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("[data-recipient-field]")) return;
    e.preventDefault();
    placeAtClientPoint(e.clientX, e.clientY);
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

  const validateModalSignature = () => {
    if (!signatureModalField) return;
    const pad = modalSigRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Veuillez tracer votre signature.");
      return;
    }
    const dataUrl = pad.getCanvas().toDataURL("image/png");
    setFieldValues((s) => ({ ...s, [signatureModalField.id]: dataUrl }));
    setSignatureModalField(null);
  };

  const sign = async () => {
    if (!consentAccepted) return toast.error("Vous devez accepter les conditions de signature électronique.");
    if (missingFields.length > 0) {
      const first = missingFields[0];
      goToField(first);
      return toast.error(
        `Veuillez remplir la zone « ${getFieldLabel(first)} » (page ${first.page_index + 1}).`,
      );
    }

    // Choose the signature image source: either a recipient signature field, or the global pad.
    let canvasDataUrl: string | null = null;
    const sigField = recipientFields.find(
      (f) => (f.kind === "signature" || f.kind === "initials") && (fieldValues[f.id] ?? "").startsWith("data:image/"),
    );
    if (sigField) {
      canvasDataUrl = fieldValues[sigField.id];
    } else if (sigRef.current && !sigRef.current.isEmpty()) {
      canvasDataUrl = sigRef.current.getCanvas().toDataURL("image/png");
    }
    if (!canvasDataUrl) {
      return toast.error("Veuillez signer dans le cadre.");
    }

    const builtFieldValues: { id: string; value: string }[] = [];
    for (const f of recipientFields) {
      if (f.kind === "signature" || f.kind === "initials") {
        builtFieldValues.push({ id: f.id, value: fieldValues[f.id] ?? canvasDataUrl });
      } else if (f.kind === "checkbox") {
        builtFieldValues.push({ id: f.id, value: fieldValues[f.id] === "true" ? "true" : "false" });
      } else {
        builtFieldValues.push({ id: f.id, value: (fieldValues[f.id] ?? "").trim() });
      }
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        action: "sign",
        signature_image_b64: canvasDataUrl,
        consent: { accepted: true, text: consentText },
      };
      if (showFreePlacement && !hasRecipientSignatureField) {
        const finalPlacement =
          placement ??
          clampPlacement({
            page_index: pageIndex,
            x: pagePoints.w - sigWidthPt - 36,
            y: 36,
            width: sigWidthPt,
          });
        body.placement = finalPlacement;
      }
      if (builtFieldValues.length > 0) {
        body.field_values = builtFieldValues;
      }
      const res = await fetch(`/api/public/sign-request/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? j.error ?? "Échec");
      }
      const result = await res.json().catch(() => ({}));
      onSigned(typeof result.pdfUrl === "string" ? result.pdfUrl : null);
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
              {!hasRecipientSignatureField && (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={showFreePlacement}
                    onChange={(e) => setShowFreePlacement(e.target.checked)}
                  />
                  Placer ma signature librement
                </label>
              )}
            </div>

            <div
              ref={overlayRef}
              onClick={handleClick}
              onPointerUp={handleOverlayPointerUp}
              className={`relative w-full overflow-hidden rounded border bg-muted/20 ${
                showFreePlacement ? "cursor-crosshair" : ""
              }`}
              style={{ touchAction: showFreePlacement ? "none" : "pan-y" }}
            >
              <canvas ref={canvasRef} className="block w-full select-none" />
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
                    touchAction: "none",
                  }}
                >
                  <div className="absolute -top-5 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                    {signerName}
                  </div>
                </div>
              )}
              {recipientFields
                .filter((f) => f.page_index === pageIndex)
                .map((f) => {
                  const cssLeft = f.x * renderScale;
                  const cssTop = (pagePoints.h - f.y - f.height) * renderScale;
                  const cssW = f.width * renderScale;
                  const cssH = f.height * renderScale;
                  const val = fieldValues[f.id] ?? "";
                  const filled = isFieldFilled(f);
                  const baseClass = `absolute z-10 flex items-center justify-center rounded border-2 touch-manipulation transition-colors ${
                    filled
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-dashed border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/20 animate-pulse"
                  }`;
                  const baseStyle = {
                    left: cssLeft,
                    top: cssTop,
                    width: Math.max(cssW, 44),
                    height: Math.max(cssH, f.kind === "checkbox" ? 44 : 38),
                  } as React.CSSProperties;

                  if (f.kind === "text" || f.kind === "date") {
                    return (
                      <div
                        key={f.id}
                        data-recipient-field="true"
                        className={baseClass}
                        style={baseStyle}
                        title={f.label || `Zone ${f.kind}`}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <input
                          id={`recipient-field-${f.id}`}
                          type={f.kind === "date" ? "date" : "text"}
                          value={val}
                          onChange={(e) =>
                            setFieldValues((s) => ({ ...s, [f.id]: e.target.value }))
                          }
                          className="h-full w-full bg-transparent px-1 text-foreground outline-none"
                          style={{ fontSize: Math.max(16, f.font_size * renderScale) }}
                          placeholder={f.label || "À remplir"}
                        />
                      </div>
                    );
                  }
                  if (f.kind === "checkbox") {
                    return (
                      <label
                        key={f.id}
                        data-recipient-field="true"
                        className={`${baseClass} cursor-pointer`}
                        style={baseStyle}
                        title={f.label || "Case"}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={val === "true"}
                          onChange={(e) =>
                            setFieldValues((s) => ({
                              ...s,
                              [f.id]: e.target.checked ? "true" : "false",
                            }))
                          }
                          className="h-5 w-5"
                        />
                      </label>
                    );
                  }
                  // signature / initials
                  return (
                    <button
                      key={f.id}
                      type="button"
                      data-recipient-field="true"
                      className={`${baseClass} cursor-pointer overflow-hidden`}
                      style={baseStyle}
                      title={f.label || (f.kind === "signature" ? "Signature" : "Paraphe")}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        openSignatureModal(f);
                      }}
                    >
                      {val.startsWith("data:image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={val}
                          alt={f.kind === "signature" ? "Signature" : "Paraphe"}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="flex items-center gap-1 px-1 text-center text-[10px] text-amber-700 dark:text-amber-300">
                          <PenLine className="h-3 w-3 shrink-0" />
                          {f.kind === "signature" ? "Signer ici" : "Parapher ici"}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            {hasRecipientFields && missingFields.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <div className="mb-2 font-semibold">
                  {missingFields.length} zone{missingFields.length > 1 ? "s" : ""} à compléter :
                </div>
                <div className="flex flex-wrap gap-2">
                  {missingFields.map((f) => (
                    <Button
                      key={f.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => goToField(f)}
                      className="h-7 text-xs"
                    >
                      Page {f.page_index + 1} · {getFieldLabel(f)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {showFreePlacement && !hasRecipientSignatureField && (
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

        {/* Global signature pad: only shown when there is NO signature zone on the document.
            With pre-placed signature zones, each zone has its own click-to-sign modal. */}
        {!hasRecipientSignatureField && (
          <div>
            <Label>Tracez votre signature</Label>
            <div className="mt-1 rounded-md border bg-background">
              <ResponsiveSignatureCanvas ref={sigRef} height={160} className="block w-full" />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => sigRef.current?.clear()}
            >
              Effacer
            </Button>
          </div>
        )}

        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Niveau de signature
            </span>
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary uppercase">
              {signatureLevel}
            </span>
          </div>
          <label className="flex items-start gap-2 text-xs leading-relaxed">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              {consentText ??
                "Je reconnais avoir lu et compris le document, j'accepte de le signer électroniquement et reconnais à cette signature la même valeur juridique qu'une signature manuscrite (eIDAS art. 25 §1, Code civil art. 1366 et 1367)."}
            </span>
          </label>
        </div>

        <Button
          onClick={sign}
          disabled={submitting || !consentAccepted || missingFields.length > 0}
          className="w-full"
        >
          {submitting
            ? "Envoi…"
            : !consentAccepted
              ? "Acceptez le consentement pour signer"
              : missingFields.length > 0
                ? `Compléter ${missingFields.length} zone${missingFields.length > 1 ? "s" : ""} avant de signer`
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

      {/* Signature modal — opened when the user clicks on a signature/initials zone */}
      <Dialog
        open={!!signatureModalField}
        onOpenChange={(o) => {
          if (!o) setSignatureModalField(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {signatureModalField?.kind === "initials" ? "Tracez votre paraphe" : "Tracez votre signature"}
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-md border bg-background">
            <ResponsiveSignatureCanvas
              ref={modalSigRef}
              height={200}
              className="block w-full"
            />
          </div>
          <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => modalSigRef.current?.clear()}
            >
              Effacer
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSignatureModalField(null)}
              >
                Annuler
              </Button>
              <Button type="button" size="sm" onClick={validateModalSignature}>
                Valider
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
