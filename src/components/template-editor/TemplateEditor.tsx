import { useCallback, useMemo, useState } from "react";
import type { Block, Canvas } from "@/lib/template-canvas/schema";
import { emptyCanvas, newId } from "@/lib/template-canvas/schema";
import { Toolbar } from "./Toolbar";
import { CanvasView } from "./Canvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TemplateEditorProps {
  initialName?: string;
  initialCanvas?: Canvas;
  onSave: (payload: { name: string; canvas: Canvas }) => Promise<void> | void;
  onPreview?: (canvas: Canvas) => void;
  saving?: boolean;
}

export function TemplateEditor({
  initialName = "",
  initialCanvas,
  onSave,
  onPreview,
  saving,
}: TemplateEditorProps) {
  const [name, setName] = useState(initialName);
  const [canvas, setCanvas] = useState<Canvas>(initialCanvas ?? emptyCanvas());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedBlock = useMemo(
    () => canvas.blocks.find((b) => b.id === selectedId) ?? null,
    [canvas.blocks, selectedId],
  );

  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setCanvas((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
    }));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    setCanvas((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
    setSelectedId(null);
  }, []);

  const addBlock = useCallback((kind: Block["type"]) => {
    const base = { id: newId(), x: 20, y: 20, width: 80, height: 20 };
    let block: Block;
    switch (kind) {
      case "text":
        block = { ...base, type: "text", text: "Nouveau texte", fontSize: 12 };
        break;
      case "image":
        block = { ...base, width: 50, height: 50, type: "image", src: "" };
        break;
      case "table":
        block = { ...base, width: 160, height: 60, type: "table", columns: 3, rows: 3, headers: [], data: [], fontSize: 10 };
        break;
      case "dynamic":
        block = { ...base, type: "dynamic", variableKey: "client.full_name", fontSize: 12 };
        break;
      case "user_zone":
        block = { ...base, width: 70, height: 25, type: "user_zone", zoneKind: "signature", label: "" };
        break;
    }
    setCanvas((c) => ({ ...c, blocks: [...c.blocks, block] }));
    setSelectedId(block.id);
  }, []);

  const updatePage = useCallback((patch: Partial<Canvas["page"]>) => {
    setCanvas((c) => ({ ...c, page: { ...c.page, ...patch } }));
  }, []);

  const handleSave = useCallback(() => {
    void onSave({ name: name.trim() || "Modèle sans titre", canvas });
  }, [name, canvas, onSave]);

  const handlePreview = useCallback(() => {
    onPreview?.(canvas);
  }, [onPreview, canvas]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-card">
        <Label htmlFor="tpl-name" className="text-xs whitespace-nowrap">Nom du modèle</Label>
        <Input
          id="tpl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Devis standard"
          className="max-w-sm h-8"
        />
      </div>
      <Toolbar onAdd={addBlock} onSave={handleSave} onPreview={handlePreview} saving={saving} />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-auto">
          <CanvasView
            canvas={canvas}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdate={updateBlock}
          />
        </div>
        <PropertiesPanel
          canvas={canvas}
          block={selectedBlock}
          onUpdate={updateBlock}
          onDelete={deleteBlock}
          onPageChange={updatePage}
        />
      </div>
    </div>
  );
}
