import { useRef, useCallback } from "react";
import type { Block, Canvas as CanvasModel } from "@/lib/template-canvas/schema";
import { pageSize } from "@/lib/template-canvas/schema";
import { BlockView } from "./BlockView";

const MM_TO_PX = 3.78; // ~96dpi: 1mm ≈ 3.7795275591px

export interface CanvasProps {
  canvas: CanvasModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  readOnly?: boolean;
}

export function CanvasView({ canvas, selectedId, onSelect, onUpdate, readOnly }: CanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { width: mmW, height: mmH } = pageSize(canvas.page.format, canvas.page.orientation);
  const w = mmW * MM_TO_PX;
  const h = mmH * MM_TO_PX;

  const handleBgClick = useCallback(() => onSelect(null), [onSelect]);

  return (
    <div className="flex justify-center p-8 bg-muted/40 min-h-full">
      <div
        ref={ref}
        onClick={handleBgClick}
        className="relative bg-white shadow-xl ring-1 ring-border"
        style={{ width: w, height: h }}
      >
        {/* margin guide */}
        <div
          className="absolute border border-dashed border-muted-foreground/20 pointer-events-none"
          style={{
            left: canvas.page.margin * MM_TO_PX,
            top: canvas.page.margin * MM_TO_PX,
            right: canvas.page.margin * MM_TO_PX,
            bottom: canvas.page.margin * MM_TO_PX,
          }}
        />

        {canvas.blocks.map((b) => (
          <BlockView
            key={b.id}
            block={b}
            scale={MM_TO_PX}
            selected={selectedId === b.id}
            onSelect={(id, e) => {
              e.stopPropagation();
              onSelect(id);
            }}
            onUpdate={onUpdate}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

export { MM_TO_PX };
