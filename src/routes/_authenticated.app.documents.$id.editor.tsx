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
  CheckSquare, PenLine, Signature, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getCurrentDocumentPdfUrl } from "@/lib/sharing.functions";
import {
  listPdfFields, savePdfFields, flattenPdfWithFields,
  type PdfFieldKind,
} from "@/lib/pdf-editor.functions";
import { saveDocumentAsPdfTemplate } from "@/lib/pdf-templates.functions";
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

  const urlQ = useQuery({
    queryKey: ["editor-pdf-url", id],
    queryFn: () => fetchUrl({ data: { document_id: id } }),
  });
  const fieldsQ = useQuery({
    queryKey: ["pdf-fields", id],
    queryFn: () => fetchFields({ data: { documentId: id } }),
  });

  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [renderScale, setRenderScale] = useState(1);
  const [pageDims, setPageDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sigOpenFor, setSigOpenFor] = useState<string | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");

  const pdfDocRef = useRef<PdfJs.PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || pageCount === 0) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      const baseViewport = page.getViewport({ scale: 1 });
      const containerW = canvas.parentElement?.clientWidth ?? 800;
      const scale = Math.min(containerW / baseViewport.width, 2);
      const viewport = page.getViewport({ scale });
      if (cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      if (cancelled) return;
      setPageDims({ w: baseViewport.width, h: baseViewport.height });
      setRenderScale(scale);
    })();
    return () => { cancelled = true; };
  }, [pageIndex, pageCount, urlQ.data?.url]);

  const addField = (kind: PdfFieldKind) => {
    const meta = KIND_META[kind];
    const newField: Field = {
      tempId: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      page_index: pageIndex,
      kind,
      x: Math.max(0, pageDims.w / 2 - meta.w / 2),
      y: Math.max(0, pageDims.h / 2 - meta.h / 2),
      width: meta.w,
      height: meta.h,
      value: kind === "checkbox" ? "false" : null,
      font_size: 11,
      required: false,
      label: null,
      position: fields.length,
    };
    setFields((prev) => [...prev, newField]);
    setSelectedId(newField.tempId);
  };

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
            label: f.label,
            position: i,
          })),
        },
      });
      return flattenFn({ data: { documentId: id } });
    },
    onSuccess: () => {
      toast.success("PDF final généré");
      qc.invalidateQueries({ queryKey: ["document", id] });
      navigate({ to: "/app/documents/$id", params: { id } });
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
            required: f.required, label: f.label, position: i,
          })),
        },
      });
      return saveTplFn({
        data: {
          documentId: id,
          name: tplName.trim(),
          description: tplDesc.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Modèle enregistré");
      setTplOpen(false);
      setTplName("");
      setTplDesc("");
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
          <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Enregistrer
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

      <div className="grid gap-3 lg:grid-cols-[200px_1fr_260px]">
        {/* Palette */}
        <Card>
          <CardContent className="space-y-2 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Ajouter un champ</p>
            {(Object.keys(KIND_META) as PdfFieldKind[]).map((k) => {
              const m = KIND_META[k];
              const Icon = m.icon;
              return (
                <Button key={k} variant="outline" size="sm" className="w-full justify-start" onClick={() => addField(k)}>
                  <Icon className="mr-2 h-4 w-4" /> {m.label}
                </Button>
              );
            })}
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
        <div className="relative overflow-auto rounded-md border border-border bg-muted">
          <div className="relative inline-block">
            <canvas ref={canvasRef} className="block" />
            {pageCount > 0 && pageDims.h > 0 && (
              <div
                className="absolute inset-0"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setSelectedId(null);
                }}
              >
                {pageFields.map((f) => {
                  // PDF (bottom-left) → CSS (top-left)
                  const cssLeft = f.x * renderScale;
                  const cssTop = (pageDims.h - f.y - f.height) * renderScale;
                  const cssW = f.width * renderScale;
                  const cssH = f.height * renderScale;
                  const isSelected = selectedId === f.tempId;
                  return (
                    <Rnd
                      key={f.tempId}
                      size={{ width: cssW, height: cssH }}
                      position={{ x: cssLeft, y: cssTop }}
                      bounds="parent"
                      onDragStop={(_, d) => {
                        const newX = d.x / renderScale;
                        const newTop = d.y / renderScale;
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
                      className={`flex items-center justify-center text-[10px] font-medium ${
                        isSelected ? "border-2 border-primary bg-primary/15" : "border border-primary/60 bg-primary/10"
                      }`}
                    >
                      <FieldPreview field={f} onSignClick={() => setSigOpenFor(f.tempId)} />
                    </Rnd>
                  );
                })}
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
                        type={selected.kind === "date" ? "date" : "text"}
                        value={selected.value ?? ""}
                        onChange={(e) => updateField(selected.tempId, { value: e.target.value })}
                      />
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
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setSigOpenFor(selected.tempId)}>
                    <PenLine className="mr-1 h-4 w-4" />
                    {selected.value ? "Modifier" : "Dessiner"}
                  </Button>
                )}

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
              <Label htmlFor="tpl-name">Nom du modèle</Label>
              <Input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Ex : Devis prestation standard" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-desc">Description (optionnel)</Label>
              <Textarea id="tpl-desc" value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} rows={3} />
            </div>
            <p className="text-xs text-muted-foreground">
              Le PDF et ses {fields.length} zone(s) seront enregistrés et réutilisables depuis « Modèles PDF ».
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplOpen(false)}>Annuler</Button>
            <Button onClick={() => saveTplMut.mutate()} disabled={!tplName.trim() || saveTplMut.isPending}>
              {saveTplMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldPreview({ field, onSignClick }: { field: Field; onSignClick: () => void }) {
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
    return <span>{field.value === "true" ? "✓" : ""}</span>;
  }
  return <span className="truncate px-1">{field.value || `« ${KIND_META[field.kind].label} »`}</span>;
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
