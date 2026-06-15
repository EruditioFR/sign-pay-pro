import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Save, FileUp } from "lucide-react";
import {
  newZoneId,
  ZONE_COLORS,
  type OverlayZone,
} from "@/lib/template-overlay/schema";
import { SourceCanvas, type RenderedPage } from "./SourceCanvas";
import { ZoneEditorDialog } from "./ZoneEditorDialog";

export interface OverlayEditorSource {
  url: string;
  mime: string;
  storagePath: string;
  pageCount: number;
}

interface Props {
  initialName?: string;
  initialZones?: OverlayZone[];
  source: OverlayEditorSource;
  saving?: boolean;
  onSave: (input: { name: string; zones: OverlayZone[] }) => void;
}

export function OverlayEditor({
  initialName = "",
  initialZones = [],
  source,
  saving,
  onSave,
}: Props) {
  const [name, setName] = useState(initialName);
  const [zones, setZones] = useState<OverlayZone[]>(initialZones);
  const [editing, setEditing] = useState<OverlayZone | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [draft, setDraft] = useState<
    | { page: number; sx: number; sy: number; cx: number; cy: number; pw: number; ph: number }
    | null
  >(null);

  const onPagesRendered = useCallback((p: RenderedPage[]) => setPages(p), []);

  const handleMouseDown = (page: RenderedPage) => (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDraft({
      page: page.index,
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top,
      cx: e.clientX - rect.left,
      cy: e.clientY - rect.top,
      pw: page.width,
      ph: page.height,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draft) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDraft({ ...draft, cx: e.clientX - rect.left, cy: e.clientY - rect.top });
  };

  const handleMouseUp = () => {
    if (!draft) return;
    const x1 = Math.min(draft.sx, draft.cx);
    const y1 = Math.min(draft.sy, draft.cy);
    const x2 = Math.max(draft.sx, draft.cx);
    const y2 = Math.max(draft.sy, draft.cy);
    const w = x2 - x1;
    const h = y2 - y1;
    setDraft(null);
    if (w < 12 || h < 12) return; // ignore tiny clicks
    const zone: OverlayZone = {
      id: newZoneId(),
      page: draft.page,
      x: x1 / draft.pw,
      y: y1 / draft.ph,
      width: w / draft.pw,
      height: h / draft.ph,
      name: "",
      type: "user_input",
      filledBy: "admin",
      required: false,
      fontSize: 11,
    };
    setEditing(zone);
  };

  const onSaveZone = (z: OverlayZone) => {
    if (!z.name.trim()) {
      z.name = `Champ ${zones.length + 1}`;
    }
    setZones((prev) => {
      const ix = prev.findIndex((p) => p.id === z.id);
      if (ix >= 0) {
        const next = [...prev];
        next[ix] = z;
        return next;
      }
      return [...prev, z];
    });
    setEditing(null);
  };

  const onDeleteZone = (id: string) => {
    setZones((prev) => prev.filter((z) => z.id !== id));
    setEditing(null);
  };

  const zonesByPage = useMemo(() => {
    const map = new Map<number, OverlayZone[]>();
    for (const z of zones) {
      const arr = map.get(z.page) ?? [];
      arr.push(z);
      map.set(z.page, arr);
    }
    return map;
  }, [zones]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4">
      {/* Canvas */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground truncate">
            Document source : <span className="font-medium">{source.mime}</span> · {source.pageCount} page(s)
          </span>
        </div>

        <Card className="overflow-auto bg-muted/40 p-4">
          <div
            className="select-none cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setDraft(null)}
          >
            <SourceCanvas
              url={source.url}
              mime={source.mime}
              maxWidth={820}
              onPagesRendered={onPagesRendered}
              renderOverlay={(p) => (
                <div
                  className="absolute inset-0"
                  onMouseDown={handleMouseDown(p)}
                >
                  {/* existing zones */}
                  {(zonesByPage.get(p.index) ?? []).map((z) => {
                    const c = ZONE_COLORS[z.type];
                    return (
                      <div
                        key={z.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(z);
                        }}
                        className="absolute group cursor-pointer"
                        style={{
                          left: z.x * p.width,
                          top: z.y * p.height,
                          width: z.width * p.width,
                          height: z.height * p.height,
                          border: `2px solid ${c.stroke}`,
                          background: c.fill,
                        }}
                      >
                        <span
                          className="absolute -top-5 left-0 text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ background: c.stroke, color: "white" }}
                        >
                          {c.label} · {z.name || "—"}
                        </span>
                      </div>
                    );
                  })}
                  {/* drafting rect */}
                  {draft && draft.page === p.index && (
                    <div
                      className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
                      style={{
                        left: Math.min(draft.sx, draft.cx),
                        top: Math.min(draft.sy, draft.cy),
                        width: Math.abs(draft.cx - draft.sx),
                        height: Math.abs(draft.cy - draft.sy),
                      }}
                    />
                  )}
                </div>
              )}
            />
          </div>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <Card className="p-3 space-y-3">
          <div>
            <Label>Nom du modèle</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Contrat de bail meublé"
            />
          </div>
          <Button
            className="w-full"
            disabled={!name.trim() || saving}
            onClick={() => onSave({ name: name.trim(), zones })}
          >
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? "Enregistrement…" : "Enregistrer le modèle"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Cliquez-glissez sur le document pour créer une zone, puis configurez-la.
          </p>
        </Card>

        <Card className="p-3">
          <div className="text-sm font-medium mb-2">
            Zones ({zones.length})
          </div>
          <div className="space-y-1.5 max-h-[400px] overflow-auto">
            {zones.length === 0 && (
              <div className="text-xs text-muted-foreground">Aucune zone définie.</div>
            )}
            {zones.map((z) => {
              const c = ZONE_COLORS[z.type];
              return (
                <div
                  key={z.id}
                  className="flex items-center justify-between gap-2 text-xs border rounded p-1.5"
                >
                  <button
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    onClick={() => setEditing(z)}
                  >
                    <Badge style={{ background: c.stroke, color: "white" }}>{c.label}</Badge>
                    <span className="truncate">{z.name || "—"}</span>
                    <span className="text-muted-foreground">p.{z.page}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => onDeleteZone(z.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <ZoneEditorDialog
        open={!!editing}
        zone={editing}
        onClose={() => setEditing(null)}
        onSave={onSaveZone}
        onDelete={zones.some((z) => z.id === editing?.id) ? onDeleteZone : undefined}
      />

      {pages.length === 0 && (
        <div className="col-span-full text-sm text-muted-foreground p-4">
          Chargement du document…
        </div>
      )}
    </div>
  );
}
