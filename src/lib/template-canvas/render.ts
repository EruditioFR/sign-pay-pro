import type { Canvas } from "./schema";
import { pageSize } from "./schema";
import { findVariable, interpolate } from "./variables";

const MM = 3.78;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a canvas to standalone HTML (absolute-positioned page) for preview or
 * for storing inside a wysiwyg draft at instantiation time.
 */
export function renderCanvasToHtml(
  canvas: Canvas,
  values: Record<string, string | number | null | undefined> = {},
): string {
  const { width: mmW, height: mmH } = pageSize(canvas.page.format, canvas.page.orientation);
  const w = mmW * MM;
  const h = mmH * MM;

  const parts: string[] = [];
  parts.push(
    `<div style="position:relative;width:${w}px;height:${h}px;background:#fff;margin:0 auto;box-shadow:0 0 10px rgba(0,0,0,.08);font-family:Inter,Arial,sans-serif;color:#111827;">`,
  );

  for (const b of canvas.blocks) {
    const style = `position:absolute;left:${b.x * MM}px;top:${b.y * MM}px;width:${b.width * MM}px;height:${b.height * MM}px;overflow:hidden;`;
    switch (b.type) {
      case "text": {
        const css = `font-size:${b.fontSize}pt;font-weight:${b.bold ? 700 : 400};font-style:${b.italic ? "italic" : "normal"};text-decoration:${b.underline ? "underline" : "none"};text-align:${b.align ?? "left"};color:${b.color ?? "#111827"};white-space:pre-wrap;`;
        parts.push(`<div style="${style}${css}">${escapeHtml(interpolate(b.text, values))}</div>`);
        break;
      }
      case "image": {
        const fit = b.fit ?? "contain";
        parts.push(
          `<div style="${style}"><img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt ?? "")}" style="width:100%;height:100%;object-fit:${fit};"/></div>`,
        );
        break;
      }
      case "table": {
        const headers = b.headers.length
          ? b.headers
          : Array.from({ length: b.columns }, (_, i) => `Col ${i + 1}`);
        const rows = b.data.length
          ? b.data
          : Array.from({ length: b.rows }, () => Array.from({ length: b.columns }, () => ""));
        const border = b.borderColor ?? "#9ca3af";
        const headBg = b.headerBg ?? "#f3f4f6";
        const thead = headers
          .slice(0, b.columns)
          .map(
            (h) =>
              `<th style="border:1px solid ${border};background:${headBg};padding:2px 4px;text-align:left;font-weight:600;">${escapeHtml(h)}</th>`,
          )
          .join("");
        const tbody = rows
          .slice(0, b.rows)
          .map(
            (row) =>
              `<tr>${Array.from({ length: b.columns }, (_, ci) => `<td style="border:1px solid ${border};padding:2px 4px;vertical-align:top;">${escapeHtml(row[ci] ?? "")}</td>`).join("")}</tr>`,
          )
          .join("");
        parts.push(
          `<div style="${style}"><table style="width:100%;border-collapse:collapse;font-size:${b.fontSize}pt;"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`,
        );
        break;
      }
      case "dynamic": {
        const def = findVariable(b.variableKey);
        const raw = values[b.variableKey];
        const display = raw !== undefined && raw !== null && raw !== ""
          ? String(raw)
          : b.fallback || `{{ ${def?.label ?? b.variableKey} }}`;
        const css = `font-size:${b.fontSize}pt;font-weight:${b.bold ? 700 : 400};display:flex;align-items:center;`;
        parts.push(`<div style="${style}${css}">${escapeHtml(display)}</div>`);
        break;
      }
      case "user_zone": {
        const label = b.label || zoneLabel(b.zoneKind);
        parts.push(
          `<div data-user-zone="${b.zoneKind}" data-required="${b.required ? "1" : "0"}" data-role="${escapeHtml(b.assignedRole ?? "")}" style="${style}border:2px dashed #f59e0b;background:#fffbeb;color:#78350f;display:flex;align-items:center;justify-content:center;font-size:10pt;text-align:center;padding:4px;">${escapeHtml(label)}</div>`,
        );
        break;
      }
    }
  }

  parts.push("</div>");
  return parts.join("");
}

function zoneLabel(k: string): string {
  switch (k) {
    case "signature":
      return "Signature";
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
