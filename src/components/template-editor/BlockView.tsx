import { useRef, useState, type MouseEvent } from "react";
import type { Block } from "@/lib/template-canvas/schema";
import { findVariable } from "@/lib/template-canvas/variables";
import { computeTotals, formatMoney, lineTotalHt } from "@/lib/template-canvas/pricing";
import { cn } from "@/lib/utils";

export interface BlockViewProps {
  block: Block;
  scale: number; // px per mm
  selected: boolean;
  onSelect: (id: string, e: MouseEvent) => void;
  onUpdate: (id: string, patch: Partial<Block>) => void;
  readOnly?: boolean;
}

export function BlockView({ block, scale, selected, onSelect, onUpdate, readOnly }: BlockViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function startDrag(e: MouseEvent) {
    if (readOnly || block.locked) return;
    e.stopPropagation();
    onSelect(block.id, e);
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = block.x;
    const oy = block.y;
    setDragging(true);
    const move = (ev: globalThis.MouseEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      onUpdate(block.id, { x: Math.max(0, ox + dx), y: Math.max(0, oy + dy) } as Partial<Block>);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function startResize(e: MouseEvent) {
    if (readOnly || block.locked) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const ow = block.width;
    const oh = block.height;
    const move = (ev: globalThis.MouseEvent) => {
      const dw = (ev.clientX - startX) / scale;
      const dh = (ev.clientY - startY) / scale;
      onUpdate(block.id, {
        width: Math.max(8, ow + dw),
        height: Math.max(6, oh + dh),
      } as Partial<Block>);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <div
      ref={ref}
      onMouseDown={startDrag}
      className={cn(
        "absolute select-none",
        !readOnly && "cursor-move",
        selected && "outline outline-2 outline-primary",
        dragging && "opacity-90",
      )}
      style={{
        left: block.x * scale,
        top: block.y * scale,
        width: block.width * scale,
        height: block.height * scale,
      }}
    >
      <BlockContent block={block} scale={scale} />
      {selected && !readOnly && (
        <div
          onMouseDown={startResize}
          className="absolute -right-1.5 -bottom-1.5 h-3 w-3 bg-primary rounded-sm cursor-se-resize"
        />
      )}
    </div>
  );
}

function BlockContent({ block, scale }: { block: Block; scale: number }) {
  switch (block.type) {
    case "text":
      return (
        <div
          className="w-full h-full overflow-hidden whitespace-pre-wrap break-words p-1"
          style={{
            fontSize: block.fontSize * (scale / 3.78) * 0.75,
            fontWeight: block.bold ? 700 : 400,
            fontStyle: block.italic ? "italic" : "normal",
            textDecoration: block.underline ? "underline" : "none",
            textAlign: block.align ?? "left",
            color: block.color ?? "#111827",
          }}
        >
          {block.text || <span className="text-muted-foreground italic">Texte</span>}
        </div>
      );
    case "image":
      return block.src ? (
        <img
          src={block.src}
          alt={block.alt ?? ""}
          className="w-full h-full"
          style={{ objectFit: block.fit ?? "contain" }}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs border border-dashed">
          Image
        </div>
      );
    case "table": {
      const headers = block.headers.length
        ? block.headers
        : Array.from({ length: block.columns }, (_, i) => `Col ${i + 1}`);
      const rows = block.data.length
        ? block.data
        : Array.from({ length: block.rows }, () => Array.from({ length: block.columns }, () => ""));
      return (
        <table
          className="w-full h-full border-collapse"
          style={{ fontSize: block.fontSize * (scale / 3.78) * 0.75 }}
        >
          <thead>
            <tr>
              {headers.slice(0, block.columns).map((h, i) => (
                <th
                  key={i}
                  className="border text-left px-1 font-medium"
                  style={{ borderColor: block.borderColor, background: block.headerBg }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, block.rows).map((row, ri) => (
              <tr key={ri}>
                {Array.from({ length: block.columns }, (_, ci) => (
                  <td
                    key={ci}
                    className="border px-1 align-top"
                    style={{ borderColor: block.borderColor }}
                  >
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case "pricing_table": {
      const totals = computeTotals(block.items, block.vatRate);
      const fs = block.fontSize * (scale / 3.78) * 0.75;
      const border = block.borderColor ?? "#9ca3af";
      const headBg = block.headerBg ?? "#f3f4f6";
      const cellStyle = { border: `1px solid ${border}`, padding: "2px 4px" };
      return (
        <table className="w-full border-collapse" style={{ fontSize: fs }}>
          <thead>
            <tr>
              <th style={{ ...cellStyle, background: headBg, textAlign: "left" }}>{block.labels.label}</th>
              <th style={{ ...cellStyle, background: headBg, textAlign: "right", width: "10%" }}>{block.labels.qty}</th>
              <th style={{ ...cellStyle, background: headBg, textAlign: "right", width: "18%" }}>{block.labels.unit}</th>
              <th style={{ ...cellStyle, background: headBg, textAlign: "right", width: "18%" }}>{block.labels.total}</th>
            </tr>
          </thead>
          <tbody>
            {(block.items.length ? block.items : [{ label: "—", qty: 0, unitPriceHt: 0 }]).map((it, i) => (
              <tr key={i}>
                <td style={cellStyle}>{it.label || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{it.qty}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(it.unitPriceHt, block.currency)}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(lineTotalHt(it), block.currency)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>{block.labels.subtotal}</td>
              <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(totals.subtotalHt, block.currency)}</td>
            </tr>
            <tr>
              <td colSpan={3} style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>
                {block.labels.vat} ({block.vatRate}%)
              </td>
              <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(totals.vatAmount, block.currency)}</td>
            </tr>
            <tr>
              <td colSpan={3} style={{ ...cellStyle, textAlign: "right", fontWeight: 700, background: headBg }}>{block.labels.grandTotal}</td>
              <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700, background: headBg }}>
                {formatMoney(totals.totalTtc, block.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      );
    }
    case "dynamic": {
      const def = findVariable(block.variableKey);
      return (
        <div
          className="w-full h-full flex items-center px-1 bg-primary/5 border border-primary/30 rounded-sm"
          style={{ fontSize: block.fontSize * (scale / 3.78) * 0.75, fontWeight: block.bold ? 700 : 400 }}
        >
          <span className="text-primary truncate">
            {`{{ ${def?.label ?? block.variableKey} }}`}
          </span>
        </div>
      );
    }
    case "user_zone":
      return (
        <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-amber-400 bg-amber-50/60 text-amber-900 text-xs rounded-sm px-1 text-center">
          {block.label || labelForZone(block.zoneKind)}
        </div>
      );
  }
}

function labelForZone(k: string) {
  switch (k) {
    case "signature":
      return "Zone signature";
    case "signature_date":
      return "Date de signature";
    case "initials":
      return "Paraphe";
    case "checkbox":
      return "Case à cocher";
    default:
      return "Saisie libre";
  }
}
