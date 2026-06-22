import { useState, useRef, useEffect, useCallback } from "react";
import { Rnd } from "react-rnd";
import { Type, CalendarDays, CheckSquare, PenLine, Signature, Trash2, GripVertical, Bold as BoldIcon, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { A4_DIMS } from "./html-to-pdf";
import { FIELD_KIND_META, type FieldKind } from "./FieldPlaceholderNode";

type BlockKind = "paragraph" | FieldKind;

interface Block {
  id: string;
  kind: BlockKind;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  content: string;
  fontSizePt?: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
}

interface Props {
  initialHtml?: string;
  onChange?: (html: string) => void;
  editorRootRef: React.RefObject<HTMLDivElement | null>;
}

const DND_MIME = "application/x-wysiwyg-block";
const RULER_SIZE = 24;

const PALETTE: Array<{ kind: BlockKind; label: string; icon: typeof Type }> = [
  { kind: "paragraph", label: "Texte", icon: Type },
  { kind: "text", label: "Champ texte", icon: Type },
  { kind: "date", label: "Date", icon: CalendarDays },
  { kind: "checkbox", label: "Case", icon: CheckSquare },
  { kind: "signature", label: "Signature", icon: PenLine },
  { kind: "initials", label: "Paraphe", icon: Signature },
];

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function blocksToHtml(blocks: Block[]): string {
  const inner = blocks.map((b) => {
    if (b.kind === "paragraph") {
      return `<div data-block="paragraph" data-x="${b.xMm.toFixed(2)}" data-y="${b.yMm.toFixed(2)}" data-w="${b.wMm.toFixed(2)}" data-h="${b.hMm.toFixed(2)}" data-font="${b.fontSizePt ?? 11}" data-align="${b.align ?? "left"}" data-bold="${b.bold ? 1 : 0}">${escapeHtml(b.content)}</div>`;
    }
    return `<div data-block="field" data-kind="${b.kind}" data-x="${b.xMm.toFixed(2)}" data-y="${b.yMm.toFixed(2)}" data-w="${b.wMm.toFixed(2)}" data-h="${b.hMm.toFixed(2)}" data-field-kind="${b.kind}" data-field-label="${escapeHtml(b.content)}">${escapeHtml(b.content)}</div>`;
  }).join("");
  return `<div data-wysiwyg-canvas="1">${inner}</div>`;
}

function parseHtmlToBlocks(html?: string): Block[] {
  if (!html) return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const els = doc.querySelectorAll<HTMLElement>("[data-block]");
    const out: Block[] = [];
    els.forEach((h) => {
      const xMm = parseFloat(h.dataset.x ?? "0");
      const yMm = parseFloat(h.dataset.y ?? "0");
      const wMm = parseFloat(h.dataset.w ?? "80");
      const hMm = parseFloat(h.dataset.h ?? "12");
      const id = (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2);
      if (h.dataset.block === "field") {
        const kind = (h.dataset.kind || "text") as FieldKind;
        out.push({ id, kind, xMm, yMm, wMm, hMm, content: h.dataset.fieldLabel || h.textContent || "" });
      } else {
        out.push({
          id, kind: "paragraph", xMm, yMm, wMm, hMm,
          content: h.textContent || "",
          fontSizePt: parseFloat(h.dataset.font ?? "11"),
          bold: h.dataset.bold === "1",
          align: ((h.dataset.align as Block["align"]) ?? "left"),
        });
      }
    });
    return out;
  } catch { return []; }
}

export function WysiwygEditor({ initialHtml, onChange, editorRootRef }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(() => parseHtmlToBlocks(initialHtml));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const [pxPerMm, setPxPerMm] = useState(3.78);

  useEffect(() => {
    if (hydrated) return;
    if (initialHtml) {
      const parsed = parseHtmlToBlocks(initialHtml);
      if (parsed.length > 0) setBlocks(parsed);
    }
    setHydrated(true);
  }, [initialHtml, hydrated]);

  useEffect(() => { onChange?.(blocksToHtml(blocks)); }, [blocks, onChange]);

  useEffect(() => {
    const update = () => {
      if (pageRef.current) {
        setPxPerMm(pageRef.current.getBoundingClientRect().width / A4_DIMS.widthMm);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (pageRef.current) ro.observe(pageRef.current);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  const addBlock = useCallback((kind: BlockKind, xMm: number, yMm: number) => {
    const id = (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2);
    let wMm = 60, hMm = 8, content = "Saisir le texte...";
    if (kind !== "paragraph") {
      const m = FIELD_KIND_META[kind as FieldKind];
      wMm = m.width / 3.78;
      hMm = m.height / 3.78;
      content = m.label;
    }
    setBlocks((arr) => [...arr, {
      id, kind,
      xMm: Math.max(0, Math.min(xMm, A4_DIMS.widthMm - wMm)),
      yMm: Math.max(0, Math.min(yMm, A4_DIMS.heightMm - hMm)),
      wMm, hMm, content,
      fontSizePt: kind === "paragraph" ? 11 : undefined,
      align: kind === "paragraph" ? "left" : undefined,
    }]);
    setSelectedId(id);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    const kind = e.dataTransfer.getData(DND_MIME) as BlockKind | "";
    if (!kind || !pageRef.current) return;
    e.preventDefault();
    const rect = pageRef.current.getBoundingClientRect();
    addBlock(kind, (e.clientX - rect.left) / pxPerMm, (e.clientY - rect.top) / pxPerMm);
  };

  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const patchSelected = (patch: Partial<Block>) =>
    setBlocks((arr) => arr.map((x) => (x.id === selectedId ? { ...x, ...patch } : x)));
  const deleteSelected = () => {
    setBlocks((arr) => arr.filter((x) => x.id !== selectedId));
    setSelectedId(null);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
      <aside>
        <div className="rounded-md border border-border bg-card p-2 sticky top-2">
          <p className="text-xs font-medium text-muted-foreground mb-2 px-1">
            Glissez sur la page
          </p>
          <div className="space-y-1">
            {PALETTE.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.kind + p.label}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME, p.kind);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-border bg-background px-2 py-1.5 text-left text-sm hover:bg-accent cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                  <Icon className="h-4 w-4" />
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="overflow-auto">
        <div className="inline-block">
          {/* Top ruler */}
          <div className="flex">
            <div style={{ width: RULER_SIZE, height: RULER_SIZE }} className="bg-muted/60 border-b border-r border-border" />
            <HorizontalRuler widthMm={A4_DIMS.widthMm} pxPerMm={pxPerMm} />
          </div>
          {/* Body */}
          <div className="flex">
            <VerticalRuler heightMm={A4_DIMS.heightMm} pxPerMm={pxPerMm} />
            <div ref={editorRootRef} className="relative">
              <div
                ref={pageRef}
                data-pdf-page
                className="relative bg-white text-black shadow-md"
                style={{
                  width: `${A4_DIMS.widthMm}mm`,
                  height: `${A4_DIMS.heightMm}mm`,
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(DND_MIME)) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDrop={onDrop}
                onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
              >
                {blocks.map((b) => (
                  <BlockView
                    key={b.id}
                    block={b}
                    pxPerMm={pxPerMm}
                    selected={selectedId === b.id}
                    onSelect={() => setSelectedId(b.id)}
                    onChange={(patch) =>
                      setBlocks((arr) => arr.map((x) => (x.id === b.id ? { ...x, ...patch } : x)))
                    }
                  />
                ))}

                {selected && (
                  <Popover open onOpenChange={(v) => { if (!v) setSelectedId(null); }}>
                    <PopoverAnchor
                      style={{
                        position: "absolute",
                        left: `${selected.xMm + selected.wMm}mm`,
                        top: `${selected.yMm}mm`,
                        width: 0, height: 0,
                        pointerEvents: "none",
                      }}
                    />
                    <PopoverContent
                      side="right"
                      align="start"
                      sideOffset={8}
                      className="w-72 space-y-3"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                      onInteractOutside={(e) => e.preventDefault()}
                    >
                      <Inspector
                        block={selected}
                        onChange={patchSelected}
                        onDelete={deleteSelected}
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockView({
  block, pxPerMm, selected, onSelect, onChange,
}: {
  block: Block;
  pxPerMm: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Block>) => void;
}) {
  const isField = block.kind !== "paragraph";
  const inner = isField ? (
    <div
      data-field-kind={block.kind}
      data-field-label={block.content}
      style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", gap: 4, padding: "2px 8px",
        borderRadius: 4,
        background: "rgba(59,130,246,0.12)",
        border: "1px dashed rgb(59,130,246)",
        color: "rgb(37,99,235)",
        fontSize: 12, fontWeight: 500,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {(() => {
        const Icon = FIELD_KIND_META[block.kind as FieldKind].icon;
        return <Icon size={12} />;
      })()}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {block.content}
      </span>
    </div>
  ) : (
    <div
      style={{
        width: "100%", height: "100%",
        fontSize: `${block.fontSizePt ?? 11}pt`,
        fontWeight: block.bold ? 600 : 400,
        textAlign: block.align ?? "left",
        whiteSpace: "pre-wrap",
        padding: "2px 4px",
        boxSizing: "border-box",
        lineHeight: 1.3,
        overflow: "hidden",
      }}
    >
      {block.content}
    </div>
  );

  return (
    <Rnd
      size={{ width: block.wMm * pxPerMm, height: block.hMm * pxPerMm }}
      position={{ x: block.xMm * pxPerMm, y: block.yMm * pxPerMm }}
      bounds="parent"
      onDragStart={onSelect}
      onDragStop={(_, d) => onChange({ xMm: d.x / pxPerMm, yMm: d.y / pxPerMm })}
      onResizeStop={(_, __, ref, ___, pos) =>
        onChange({
          wMm: ref.offsetWidth / pxPerMm,
          hMm: ref.offsetHeight / pxPerMm,
          xMm: pos.x / pxPerMm,
          yMm: pos.y / pxPerMm,
        })
      }
      onMouseDown={onSelect}
      style={{ zIndex: selected ? 20 : 10 }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {inner}
        {selected && (
          <div
            data-export-hide
            style={{
              position: "absolute", inset: -2,
              border: "2px solid rgb(59,130,246)",
              borderRadius: 4,
              pointerEvents: "none",
            }}
          />
        )}
        {!isField && !selected && (
          <div
            data-export-hide
            style={{
              position: "absolute", inset: 0,
              border: "1px dashed rgba(0,0,0,0.15)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    </Rnd>
  );
}

function Inspector({
  block, onChange, onDelete,
}: {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
  onDelete: () => void;
}) {
  const kindLabel = block.kind === "paragraph" ? "Texte" : FIELD_KIND_META[block.kind as FieldKind].label;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {kindLabel}
        </p>
        <Button
          type="button" size="sm" variant="ghost"
          className="h-7 px-2 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {block.kind === "paragraph" ? (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Contenu</Label>
            <Textarea
              value={block.content}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={4}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Taille (pt)</Label>
              <Input
                type="number" min={6} max={72}
                value={block.fontSizePt ?? 11}
                onChange={(e) => onChange({ fontSizePt: parseFloat(e.target.value) || 11 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Style</Label>
              <div className="flex gap-1">
                <Button
                  type="button" size="sm"
                  variant={block.bold ? "secondary" : "outline"}
                  className="h-9 w-9 p-0"
                  onClick={() => onChange({ bold: !block.bold })}
                >
                  <BoldIcon className="h-4 w-4" />
                </Button>
                {(["left", "center", "right"] as const).map((a) => {
                  const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                  return (
                    <Button
                      key={a} type="button" size="sm"
                      variant={(block.align ?? "left") === a ? "secondary" : "outline"}
                      className="h-9 w-9 p-0"
                      onClick={() => onChange({ align: a })}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs">Libellé du champ</Label>
          <Input
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
            autoFocus
          />
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5 text-[10px]">
        <CoordInput label="X" value={block.xMm} onChange={(v) => onChange({ xMm: v })} />
        <CoordInput label="Y" value={block.yMm} onChange={(v) => onChange({ yMm: v })} />
        <CoordInput label="L" value={block.wMm} onChange={(v) => onChange({ wMm: v })} />
        <CoordInput label="H" value={block.hMm} onChange={(v) => onChange({ hMm: v })} />
      </div>
    </div>
  );
}

function CoordInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] text-muted-foreground">{label} (mm)</Label>
      <Input
        type="number" step="0.5"
        value={value.toFixed(1)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-7 text-xs px-1.5"
      />
    </div>
  );
}

function HorizontalRuler({ widthMm, pxPerMm }: { widthMm: number; pxPerMm: number }) {
  const widthPx = widthMm * pxPerMm;
  const ticks: React.ReactNode[] = [];
  for (let mm = 0; mm <= widthMm; mm += 5) {
    const x = mm * pxPerMm;
    const major = mm % 10 === 0;
    ticks.push(
      <line key={`t${mm}`} x1={x} y1={RULER_SIZE - (major ? 10 : 5)} x2={x} y2={RULER_SIZE}
        stroke="currentColor" strokeOpacity={0.5} strokeWidth={1} />
    );
    if (major && mm > 0 && mm < widthMm) {
      ticks.push(
        <text key={`l${mm}`} x={x + 2} y={10} fontSize={9} fill="currentColor" fillOpacity={0.7}>
          {mm}
        </text>
      );
    }
  }
  return (
    <div className="bg-muted/60 border-b border-border text-foreground" style={{ width: widthPx, height: RULER_SIZE }}>
      <svg width={widthPx} height={RULER_SIZE} style={{ display: "block" }}>{ticks}</svg>
    </div>
  );
}

function VerticalRuler({ heightMm, pxPerMm }: { heightMm: number; pxPerMm: number }) {
  const heightPx = heightMm * pxPerMm;
  const ticks: React.ReactNode[] = [];
  for (let mm = 0; mm <= heightMm; mm += 5) {
    const y = mm * pxPerMm;
    const major = mm % 10 === 0;
    ticks.push(
      <line key={`t${mm}`} x1={RULER_SIZE - (major ? 10 : 5)} y1={y} x2={RULER_SIZE} y2={y}
        stroke="currentColor" strokeOpacity={0.5} strokeWidth={1} />
    );
    if (major && mm > 0 && mm < heightMm) {
      ticks.push(
        <text key={`l${mm}`} x={2} y={y + 3} fontSize={9} fill="currentColor" fillOpacity={0.7}>
          {mm}
        </text>
      );
    }
  }
  return (
    <div className="bg-muted/60 border-r border-border text-foreground" style={{ width: RULER_SIZE, height: heightPx }}>
      <svg width={RULER_SIZE} height={heightPx} style={{ display: "block" }}>{ticks}</svg>
    </div>
  );
}
