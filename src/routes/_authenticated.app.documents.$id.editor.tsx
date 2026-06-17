import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Rnd } from "react-rnd";
import SignatureCanvas from "react-signature-canvas";
import type * as PdfJs from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Trash2, Save, FileDown, Type, CalendarDays,
  CheckSquare, PenLine, Signature, Loader2, MousePointer2, Variable,
  RefreshCw, CheckCircle2, Upload, Image as ImageIcon,
} from "lucide-react";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { toast } from "sonner";
import { getCurrentDocumentPdfUrl, listDocumentSignatures } from "@/lib/sharing.functions";
import {
  listPdfFields, savePdfFields, flattenPdfWithFields,
  type PdfFieldKind,
} from "@/lib/pdf-editor.functions";
import { saveDocumentAsPdfTemplate, listPdfTemplates } from "@/lib/pdf-templates.functions";
import { Textarea } from "@/components/ui/textarea";
import { BookmarkPlus } from "lucide-react";

let _pdfjs: typeof PdfJs | null = null;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const mod = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  mod.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = mod;
  return mod;
}

const Initials = Signature;

type Field = {
  id?: string;
  tempId: string;
  page_index: number;
  kind: PdfFieldKind;
  x: number; // PDF points, bottom-left origin
  y: number;
  width: number;
  height: number;
  value: string | null;
  font_size: number;
  required: boolean;
  recipient_fillable: boolean;
  label: string | null;
  position: number;
};

const KIND_META: Record<PdfFieldKind, { label: string; w: number; h: number; icon: typeof Type }> = {
  text: { label: "Texte", w: 160, h: 24, icon: Type },
  date: { label: "Date", w: 100, h: 24, icon: CalendarDays },
  checkbox: { label: "Case", w: 18, h: 18, icon: CheckSquare },
  signature: { label: "Signature", w: 160, h: 60, icon: PenLine },
  initials: { label: "Paraphe", w: 60, h: 40, icon: Initials },
};

const DYNAMIC_VARIABLES: { key: string; label: string }[] = [
  { key: "third_party_name", label: "Nom destinataire" },
  { key: "third_party_email", label: "Email destinataire" },
  { key: "title", label: "Titre document" },
  { key: "reference", label: "Référence" },
  { key: "document_number", label: "N° document" },
  { key: "invoice_number", label: "N° facture" },
  { key: "amount_ht", label: "Montant HT" },
  { key: "amount_ttc", label: "Montant TTC" },
  { key: "currency", label: "Devise" },
  { key: "issue_date", label: "Date d'émission" },
  { key: "due_date", label: "Date d'échéance" },
  { key: "today", label: "Date du jour" },
  { key: "now", label: "Date/heure actuelle" },
];

type Tool = PdfFieldKind | "select";

export const Route = createFileRoute("/_authenticated/app/documents/$id/editor")({
  component: PdfEditorPage,
});

function PdfEditorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchUrl = useServerFn(getCurrentDocumentPdfUrl);
  const fetchFields = useServerFn(listPdfFields);
  const saveFn = useServerFn(savePdfFields);
  const flattenFn = useServerFn(flattenPdfWithFields);
  const listSignaturesFn = useServerFn(listDocumentSignatures);

  const urlQ = useQuery({
    queryKey: ["editor-pdf-url", id],
    queryFn: () => fetchUrl({ data: { document_id: id } }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const fieldsQ = useQuery({
    queryKey: ["pdf-fields", id],
    queryFn: () => fetchFields({ data: { documentId: id } }),
  });
  const sigsQ = useQuery({
    queryKey: ["document-signatures", id],
    queryFn: () => listSignaturesFn({ data: { document_id: id } }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
  const signatures = sigsQ.data?.signatures ?? [];

  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [renderScale, setRenderScale] = useState(1);
  const [pageDims, setPageDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sigOpenFor, setSigOpenFor] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const draftStartRef = useRef<{ x: number; y: number } | null>(null);
  const valueInputRef = useRef<HTMLInputElement | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplMode, setTplMode] = useState<"new" | "version">("new");
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplNotes, setTplNotes] = useState("");
  const [tplTargetId, setTplTargetId] = useState<string>("");
  const [sendOpen, setSendOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageTargetRef = useRef<string | null>(null);

  const listTplFn = useServerFn(listPdfTemplates);
  const tplListQ = useQuery({
    queryKey: ["pdf-templates"],
    queryFn: () => listTplFn(),
    enabled: tplOpen,
  });

  const pdfDocRef = useRef<PdfJs.PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    if (!fieldsQ.data) return;
    setFields(
      fieldsQ.data.fields.map((f) => ({
        id: f.id,
        tempId: f.id,
        page_index: f.page_index,
        kind: f.kind as PdfFieldKind,
        x: Number(f.x),
        y: Number(f.y),
        width: Number(f.width),
        height: Number(f.height),
        value: f.value,
        font_size: f.font_size,
        required: f.required,
        recipient_fillable: (f as { recipient_fillable?: boolean }).recipient_fillable ?? false,
        label: f.label,
        position: f.position,
      })),
    );
  }, [fieldsQ.data]);

  useEffect(() => {
    if (!urlQ.data?.url) return;
    let cancelled = false;
    (async () => {
      const pdfjs = await loadPdfjs();
      const task = pdfjs.getDocument({ url: urlQ.data!.url! });
      const doc = await task.promise;
      if (cancelled) return;
      pdfDocRef.current = doc;
      setPageCount(doc.numPages);
    })();
    return () => { cancelled = true; };
  }, [urlQ.data?.url]);

  const renderPage = useRef<() => void>(() => {});

  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    const container = scrollContainerRef.current;
    if (!doc || !canvas || !container || pageCount === 0) return;
    let cancelled = false;

    const doRender = async () => {
      const page = await doc.getPage(pageIndex + 1);
      const baseViewport = page.getViewport({ scale: 1 });
      const containerW = container.clientWidth;
      const scale = Math.min(containerW / baseViewport.width, 2.5);
      const viewport = page.getViewport({ scale });
      if (cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
      }
      const task = page.render({ canvas, canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      if (cancelled) return;
      setPageDims({ w: baseViewport.width, h: baseViewport.height });
      setRenderScale(scale);
    };

    renderPage.current = doRender;
    doRender();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
      }
    };
  }, [pageIndex, pageCount, urlQ.data?.url]);

  useEffect(() => {
    const handleResize = () => {
      renderPage.current();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const createField = (kind: PdfFieldKind, rect?: { x: number; y: number; w: number; h: number }) => {
    const meta = KIND_META[kind];
    const w = rect?.w ?? meta.w;
    const h = rect?.h ?? meta.h;
    const cssX = rect?.x ?? (pageDims.w * renderScale) / 2 - (w * renderScale) / 2;
    const cssY = rect?.y ?? (pageDims.h * renderScale) / 2 - (h * renderScale) / 2;
    const xPdf = Math.max(0, cssX / renderScale);
    const yPdfTop = cssY / renderScale;
    const newField: Field = {
      tempId: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      page_index: pageIndex,
      kind,
      x: xPdf,
      y: Math.max(0, pageDims.h - yPdfTop - h),
      width: w,
      height: h,
      value: kind === "checkbox" ? "false" : null,
      font_size: 11,
      required: false,
      recipient_fillable: false,
      label: null,
      position: fields.length,
    };
    setFields((prev) => [...prev, newField]);
    setSelectedId(newField.tempId);
  };
  const addField = (kind: PdfFieldKind) => createField(kind);

  const updateField = (tempId: string, patch: Partial<Field>) => {
    setFields((prev) => prev.map((f) => (f.tempId === tempId ? { ...f, ...patch } : f)));
  };
  const removeField = (tempId: string) => {
    setFields((prev) => prev.filter((f) => f.tempId !== tempId));
    if (selectedId === tempId) setSelectedId(null);
  };

  const saveMut = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          documentId: id,
          fields: fields.map((f, i) => ({
            page_index: f.page_index,
            kind: f.kind,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            value: f.value,
            font_size: f.font_size,
            required: f.required,
            recipient_fillable: f.recipient_fillable,
            label: f.label,
            position: i,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Zones enregistrées");
      qc.invalidateQueries({ queryKey: ["pdf-fields", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flattenMut = useMutation({
    mutationFn: async () => {
      await saveFn({
        data: {
          documentId: id,
          fields: fields.map((f, i) => ({
            page_index: f.page_index,
            kind: f.kind,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            value: f.value,
            font_size: f.font_size,
            required: f.required,
            recipient_fillable: f.recipient_fillable,
            label: f.label,
            position: i,
          })),
        },
      });
      return flattenFn({ data: { documentId: id } });
    },
    onSuccess: () => {
      toast.success("PDF final généré — choisissez comment l'envoyer");
      qc.invalidateQueries({ queryKey: ["document", id] });
      qc.invalidateQueries({ queryKey: ["editor-pdf-url", id] });
      setSendOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTplFn = useServerFn(saveDocumentAsPdfTemplate);
  const saveTplMut = useMutation({
    mutationFn: async () => {
      // persist current fields first so they are part of the template
      await saveFn({
        data: {
          documentId: id,
          fields: fields.map((f, i) => ({
            page_index: f.page_index, kind: f.kind,
            x: f.x, y: f.y, width: f.width, height: f.height,
            value: f.value, font_size: f.font_size,
            required: f.required, recipient_fillable: f.recipient_fillable,
            label: f.label, position: i,
          })),
        },
      });
      return saveTplFn({
        data: {
          documentId: id,
          templateId: tplMode === "version" && tplTargetId ? tplTargetId : undefined,
          name: tplMode === "new" ? tplName.trim() : undefined,
          description: tplMode === "new" ? (tplDesc.trim() || null) : undefined,
          notes: tplNotes.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success(tplMode === "new" ? "Modèle enregistré" : "Nouvelle version enregistrée");
      setTplOpen(false);
      setTplName("");
      setTplDesc("");
      setTplNotes("");
      setTplTargetId("");
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pageFields = useMemo(
    () => fields.filter((f) => f.page_index === pageIndex),
    [fields, pageIndex],
  );
  const selected = fields.find((f) => f.tempId === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/documents/$id" params={{ id }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour au document
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["editor-pdf-url", id] });
              qc.invalidateQueries({ queryKey: ["document-signatures", id] });
            }}
            disabled={urlQ.isFetching}
            title="Recharger le PDF (utile après une signature)"
          >
            {urlQ.isFetching ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Rafraîchir
          </Button>
          <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Enregistrer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (fields.length === 0) return;
              if (!confirm("Supprimer toutes les zones de l'éditeur ? (utile si elles sont déjà incrustées dans le PDF)")) return;
              setFields([]);
              setSelectedId(null);
              saveMut.mutate();
            }}
            disabled={fields.length === 0 || saveMut.isPending}
            title="Vider toutes les zones (à utiliser après un PDF final pour éviter les doublons)"
          >
            <Trash2 className="mr-1 h-4 w-4" /> Vider les zones
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTplOpen(true)} disabled={fields.length === 0}>
            <BookmarkPlus className="mr-1 h-4 w-4" /> Enregistrer comme modèle
          </Button>
          <Button size="sm" onClick={() => flattenMut.mutate()} disabled={flattenMut.isPending || fields.length === 0}>
            {flattenMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />}
            Générer PDF final
          </Button>
        </div>
      </div>

      {signatures.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              {signatures.length} signature{signatures.length > 1 ? "s" : ""} collectée{signatures.length > 1 ? "s" : ""}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {signatures.map((s) => (
                <li key={s.id}>
                  • {s.signer_name}
                  {s.signer_email ? ` (${s.signer_email})` : ""} —{" "}
                  {new Date(s.signed_at).toLocaleString("fr-FR")}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs opacity-80">
              Le PDF affiché ci-dessous est la dernière version signée. Si la signature n'apparaît pas, cliquez sur « Rafraîchir ».
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[200px_1fr_260px]">
        {/* Palette */}
        <Card>
          <CardContent className="space-y-2 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Outil</p>
            <Button
              variant={activeTool === "select" ? "default" : "outline"}
              size="sm"
              className="w-full justify-start"
              onClick={() => setActiveTool("select")}
            >
              <MousePointer2 className="mr-2 h-4 w-4" /> Sélection
            </Button>

            <p className="pt-2 text-xs font-semibold text-muted-foreground">Tracer une zone</p>
            {(Object.keys(KIND_META) as PdfFieldKind[]).map((k) => {
              const m = KIND_META[k];
              const Icon = m.icon;
              const isActive = activeTool === k;
              return (
                <div key={k} className="flex gap-1">
                  <Button
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className="flex-1 justify-start"
                    onClick={() => setActiveTool(isActive ? "select" : k)}
                    title="Cliquer-glisser sur le PDF pour tracer la zone"
                  >
                    <Icon className="mr-2 h-4 w-4" /> {m.label}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => addField(k)}
                    title="Insérer une zone par défaut au centre de la page"
                  >
                    +
                  </Button>
                </div>
              );
            })}

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  imageTargetRef.current = null;
                  imageInputRef.current?.click();
                }}
                title="Téléverser un logo, tampon ou image à incruster"
              >
                <ImageIcon className="mr-2 h-4 w-4" /> Image (logo, tampon…)
              </Button>
            </div>

            {activeTool !== "select" && (
              <p className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-2 text-[11px] text-primary">
                Cliquez-glissez sur le PDF pour tracer la zone «&nbsp;{KIND_META[activeTool as PdfFieldKind].label}&nbsp;».
              </p>
            )}


            <div className="pt-3">
              <Label className="text-xs">Page</Label>
              {pageCount > 0 && (
                <Select value={String(pageIndex)} onValueChange={(v) => { setPageIndex(Number(v)); setSelectedId(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: pageCount }).map((_, i) => (
                      <SelectItem key={i} value={String(i)}>Page {i + 1} / {pageCount}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Canvas + overlay */}
        <div ref={scrollContainerRef} className="relative overflow-auto rounded-md border border-border bg-muted">
          <div className="relative inline-block">
            <canvas ref={canvasRef} className="block" />
            {pageCount > 0 && pageDims.h > 0 && (
              <div
                className="absolute inset-0"
                style={{ cursor: activeTool !== "select" ? "crosshair" : "default" }}
                onMouseDown={(e) => {
                  if (activeTool === "select") {
                    if (e.target === e.currentTarget) setSelectedId(null);
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  draftStartRef.current = { x, y };
                  setDraft({ x, y, w: 0, h: 0 });
                }}
                onMouseMove={(e) => {
                  if (!draftStartRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const cx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                  const cy = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                  const sx = draftStartRef.current.x;
                  const sy = draftStartRef.current.y;
                  setDraft({
                    x: Math.min(sx, cx),
                    y: Math.min(sy, cy),
                    w: Math.abs(cx - sx),
                    h: Math.abs(cy - sy),
                  });
                }}
                onMouseUp={() => {
                  const d = draft;
                  draftStartRef.current = null;
                  setDraft(null);
                  if (!d || activeTool === "select") return;
                  const kind = activeTool as PdfFieldKind;
                  if (d.w < 8 || d.h < 8) {
                    // tracé trop petit → insertion par défaut autour du clic
                    const meta = KIND_META[kind];
                    createField(kind, {
                      x: d.x,
                      y: d.y,
                      w: meta.w,
                      h: meta.h,
                    });
                  } else {
                    createField(kind, d);
                  }
                  setActiveTool("select");
                }}
                onMouseLeave={() => {
                  draftStartRef.current = null;
                  setDraft(null);
                }}
              >
                {pageFields.map((f) => {
                  // PDF (bottom-left) → CSS (top-left)
                  const cssLeft = f.x * renderScale;
                  const cssTop = (pageDims.h - f.y - f.height) * renderScale;
                  const cssW = f.width * renderScale;
                  const cssH = f.height * renderScale;
                  const isSelected = selectedId === f.tempId;
                  const drawingMode = activeTool !== "select";
                  const handleDot: React.CSSProperties = {
                    width: 10, height: 10, background: "hsl(var(--primary))",
                    border: "2px solid white", borderRadius: 2, boxShadow: "0 0 0 1px hsl(var(--primary))",
                  };
                  return (
                    <Rnd
                      key={f.tempId}
                      size={{ width: cssW, height: cssH }}
                      position={{ x: cssLeft, y: cssTop }}
                      bounds="parent"
                      minWidth={12}
                      minHeight={12}
                      disableDragging={drawingMode}
                      enableResizing={!drawingMode}
                      resizeHandleStyles={isSelected ? {
                        topLeft: handleDot, topRight: handleDot,
                        bottomLeft: handleDot, bottomRight: handleDot,
                      } : undefined}
                      style={{ pointerEvents: drawingMode ? "none" : "auto" }}
                      onDragStop={(_, dd) => {
                        const newX = dd.x / renderScale;
                        const newTop = dd.y / renderScale;
                        updateField(f.tempId, { x: newX, y: pageDims.h - newTop - f.height });
                      }}
                      onResizeStop={(_, __, ref, ___, pos) => {
                        const newW = ref.offsetWidth / renderScale;
                        const newH = ref.offsetHeight / renderScale;
                        const newX = pos.x / renderScale;
                        const newTop = pos.y / renderScale;
                        updateField(f.tempId, {
                          width: newW, height: newH, x: newX,
                          y: pageDims.h - newTop - newH,
                        });
                      }}
                      onMouseDown={() => setSelectedId(f.tempId)}
                      className={`flex items-center justify-center font-medium ${
                        f.recipient_fillable
                          ? isSelected
                            ? "border-2 border-amber-500 bg-amber-500/20"
                            : "border-2 border-dashed border-amber-500/70 bg-amber-500/10"
                          : isSelected
                            ? "border-2 border-primary bg-primary/15"
                            : "border border-primary/60 bg-primary/10"
                      }`}
                    >
                      <FieldPreview field={f} scale={renderScale} onSignClick={() => setSigOpenFor(f.tempId)} />
                    </Rnd>
                  );
                })}

                {draft && (
                  <div
                    className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                    style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }}
                  />
                )}
              </div>
            )}
          </div>
        </div>



        {/* Inspector */}
        <Card>
          <CardContent className="space-y-3 p-3">
            {!selected ? (
              <p className="text-xs text-muted-foreground">
                Sélectionnez une zone pour la modifier, ou ajoutez un champ.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{KIND_META[selected.kind].label}</p>
                  <Button variant="ghost" size="icon" onClick={() => removeField(selected.tempId)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Libellé interne</Label>
                  <Input
                    value={selected.label ?? ""}
                    onChange={(e) => updateField(selected.tempId, { label: e.target.value })}
                  />
                </div>

                {(selected.kind === "text" || selected.kind === "date") && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Valeur</Label>
                      <Input
                        ref={valueInputRef}
                        type={selected.kind === "date" && !(selected.value ?? "").includes("{{") ? "date" : "text"}
                        value={selected.value ?? ""}
                        onChange={(e) => updateField(selected.tempId, { value: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Variable className="h-3 w-3" /> Insérer un champ dynamique
                      </Label>
                      <Select
                        value=""
                        onValueChange={(key) => {
                          if (!key) return;
                          const token = `{{${key}}}`;
                          const input = valueInputRef.current;
                          const current = selected.value ?? "";
                          if (input && document.activeElement === input) {
                            const start = input.selectionStart ?? current.length;
                            const end = input.selectionEnd ?? current.length;
                            const next = current.slice(0, start) + token + current.slice(end);
                            updateField(selected.tempId, { value: next });
                            requestAnimationFrame(() => {
                              input.focus();
                              const pos = start + token.length;
                              input.setSelectionRange(pos, pos);
                            });
                          } else {
                            updateField(selected.tempId, { value: (current ? current + " " : "") + token });
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Choisir une variable…" />
                        </SelectTrigger>
                        <SelectContent>
                          {DYNAMIC_VARIABLES.map((v) => (
                            <SelectItem key={v.key} value={v.key}>
                              <span className="font-medium">{v.label}</span>
                              <span className="ml-2 text-[10px] text-muted-foreground">{`{{${v.key}}}`}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">
                        Les variables sont remplacées par les valeurs du document lors de la génération.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Taille de police ({selected.font_size}pt)</Label>
                      <Input
                        type="number" min={6} max={48}
                        value={selected.font_size}
                        onChange={(e) => updateField(selected.tempId, { font_size: Number(e.target.value) })}
                      />
                    </div>
                  </>
                )}

                {selected.kind === "checkbox" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.value === "true"}
                      onChange={(e) => updateField(selected.tempId, { value: e.target.checked ? "true" : "false" })}
                    />
                    Cochée
                  </label>
                )}

                {(selected.kind === "signature" || selected.kind === "initials") && (
                  <div className="grid gap-1.5">
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setSigOpenFor(selected.tempId)}>
                      <PenLine className="mr-1 h-4 w-4" />
                      {selected.value ? "Modifier le dessin" : "Dessiner"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        imageTargetRef.current = selected.tempId;
                        imageInputRef.current?.click();
                      }}
                    >
                      <Upload className="mr-1 h-4 w-4" />
                      Téléverser une image
                    </Button>
                  </div>
                )}

                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selected.recipient_fillable}
                      onChange={(e) =>
                        updateField(selected.tempId, { recipient_fillable: e.target.checked })
                      }
                    />
                    <span>
                      <span className="font-medium">À remplir par le destinataire</span>
                      <span className="block text-[10px] text-muted-foreground">
                        Cette zone ne sera pas figée dans le PDF final ; le destinataire devra la
                        remplir lors de la signature (obligatoire).
                      </span>
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>x: {Math.round(selected.x)}pt</span>
                  <span>y: {Math.round(selected.y)}pt</span>
                  <span>w: {Math.round(selected.width)}pt</span>
                  <span>h: {Math.round(selected.height)}pt</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {sigOpenFor && (
        <SignatureDrawDialog
          open={!!sigOpenFor}
          onClose={() => setSigOpenFor(null)}
          onSave={(dataUrl) => {
            updateField(sigOpenFor, { value: dataUrl });
            setSigOpenFor(null);
          }}
        />
      )}

      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enregistrer comme modèle</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Mode</Label>
              <Select value={tplMode} onValueChange={(v) => setTplMode(v as "new" | "version")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Nouveau modèle</SelectItem>
                  <SelectItem value="version">Nouvelle version d'un modèle existant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tplMode === "new" ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="tpl-name">Nom du modèle</Label>
                  <Input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Ex : Devis prestation standard" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tpl-desc">Description (optionnel)</Label>
                  <Textarea id="tpl-desc" value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} rows={2} />
                </div>
              </>
            ) : (
              <div className="grid gap-1.5">
                <Label>Modèle cible</Label>
                <Select value={tplTargetId} onValueChange={setTplTargetId}>
                  <SelectTrigger><SelectValue placeholder="Choisir un modèle…" /></SelectTrigger>
                  <SelectContent>
                    {(tplListQ.data?.templates ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} (v{t.version_count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="tpl-notes">Notes de version (optionnel)</Label>
              <Input id="tpl-notes" value={tplNotes} onChange={(e) => setTplNotes(e.target.value)} placeholder="Ex : ajout du champ TVA" />
            </div>

            <p className="text-xs text-muted-foreground">
              Le PDF et ses {fields.length} zone(s) seront enregistrés comme {tplMode === "new" ? "version 1 d'un nouveau modèle" : "une nouvelle version"}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplOpen(false)}>Annuler</Button>
            <Button
              onClick={() => saveTplMut.mutate()}
              disabled={
                saveTplMut.isPending ||
                (tplMode === "new" && !tplName.trim()) ||
                (tplMode === "version" && !tplTargetId)
              }
            >
              {saveTplMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldPreview({ field, scale, onSignClick }: { field: Field; scale: number; onSignClick: () => void }) {
  if (field.kind === "signature" || field.kind === "initials") {
    if (field.value?.startsWith("data:image/")) {
      return <img src={field.value} alt="" className="h-full w-full object-contain pointer-events-none" />;
    }
    return (
      <button type="button" onClick={onSignClick} className="text-[10px] text-primary underline">
        {field.kind === "signature" ? "Signer" : "Parapher"}
      </button>
    );
  }
  if (field.kind === "checkbox") {
    return <span style={{ fontSize: Math.max(8, field.height * scale * 0.8) }}>{field.value === "true" ? "✓" : ""}</span>;
  }
  const value = field.value || "";
  const fontStyle: React.CSSProperties = { fontSize: field.font_size * scale, lineHeight: 1.1 };
  if (!value) {
    return <span className="truncate px-1 italic text-muted-foreground" style={fontStyle}>{`« ${KIND_META[field.kind].label} »`}</span>;
  }
  const parts = value.split(/(\{\{\s*[a-zA-Z0-9_]+\s*\}\})/g);
  return (
    <span className="truncate px-1" style={fontStyle}>
      {parts.map((p, i) =>
        /^\{\{\s*[a-zA-Z0-9_]+\s*\}\}$/.test(p) ? (
          <span key={i} className="rounded bg-primary/20 px-1 text-primary">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

function SignatureDrawDialog({
  open, onClose, onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Dessiner</DialogTitle></DialogHeader>
        <div className="rounded-md border border-border bg-background">
          <SignatureCanvas ref={sigRef} canvasProps={{ className: "w-full h-40 touch-none" }} penColor="black" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => sigRef.current?.clear()}>Effacer</Button>
          <Button onClick={() => {
            if (!sigRef.current || sigRef.current.isEmpty()) { toast.error("Dessin vide"); return; }
            onSave(sigRef.current.getCanvas().toDataURL("image/png"));
          }}>Valider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
