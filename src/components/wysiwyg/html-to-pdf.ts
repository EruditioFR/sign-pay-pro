import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import type { FieldKind } from "./FieldPlaceholderNode";

const MM_PER_PT = 0.352778;
const PT_PER_MM = 1 / MM_PER_PT;
const A4_W_MM = 210;
const A4_H_MM = 297;
const PAGE_PADDING_MM = 15;

export type ExtractedField = {
  page_index: number;
  kind: FieldKind;
  x: number; // PDF points, bottom-left origin
  y: number;
  width: number;
  height: number;
  label: string | null;
};

export type PdfExportResult = {
  pdfBase64: string;
  fields: ExtractedField[];
  pageCount: number;
};

/**
 * Render a multi-page A4 container to a PDF and extract field placeholder positions.
 * The container must contain one or more children, each representing an A4 page.
 */
export async function exportEditorToPdf(
  pagesRoot: HTMLElement,
): Promise<PdfExportResult> {
  const pageEls = Array.from(
    pagesRoot.querySelectorAll<HTMLElement>("[data-pdf-page]"),
  );
  if (pageEls.length === 0) throw new Error("Aucune page à exporter");

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const fields: ExtractedField[] = [];

  for (let i = 0; i < pageEls.length; i++) {
    const pageEl = pageEls[i];
    const pageRect = pageEl.getBoundingClientRect();
    const pxPerMm = pageRect.width / A4_W_MM;

    // Extract placeholders before rasterizing
    const placeholders = Array.from(
      pageEl.querySelectorAll<HTMLElement>("[data-field-kind]"),
    );
    for (const ph of placeholders) {
      const r = ph.getBoundingClientRect();
      const kind = (ph.dataset.fieldKind || "text") as FieldKind;
      const label = ph.dataset.fieldLabel ?? null;
      const xMm = (r.left - pageRect.left) / pxPerMm;
      const yMm = (r.top - pageRect.top) / pxPerMm;
      const wMm = r.width / pxPerMm;
      const hMm = r.height / pxPerMm;
      // Convert to PDF points, bottom-left origin
      const xPt = xMm * PT_PER_MM;
      const wPt = wMm * PT_PER_MM;
      const hPt = hMm * PT_PER_MM;
      const yPt = (A4_H_MM - yMm - hMm) * PT_PER_MM;
      fields.push({
        page_index: i,
        kind,
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
        label,
      });
    }

    // Hide placeholders visually for the rasterization (keep layout)
    const restored: { el: HTMLElement; bg: string; color: string; border: string }[] = [];
    for (const ph of placeholders) {
      restored.push({
        el: ph,
        bg: ph.style.background,
        color: ph.style.color,
        border: ph.style.border,
      });
      ph.style.background = "transparent";
      ph.style.color = "transparent";
      ph.style.border = "1px solid transparent";
    }

    // Hide decorative overlays (selection rings, dashed outlines, resize handles)
    const hidden = Array.from(
      pageEl.querySelectorAll<HTMLElement>("[data-export-hide], .react-resizable-handle"),
    );
    const hiddenRestore: { el: HTMLElement; display: string }[] = [];
    for (const el of hidden) {
      hiddenRestore.push({ el, display: el.style.display });
      el.style.display = "none";
    }

    const canvas = await html2canvas(pageEl, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });

    // Restore
    for (const r of restored) {
      r.el.style.background = r.bg;
      r.el.style.color = r.color;
      r.el.style.border = r.border;
    }

    const img = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0) pdf.addPage();
    pdf.addImage(img, "JPEG", 0, 0, A4_W_MM, A4_H_MM);
  }

  const out = pdf.output("datauristring");
  const b64 = out.split(",")[1];

  return { pdfBase64: b64, fields, pageCount: pageEls.length };
}

export const A4_DIMS = {
  widthMm: A4_W_MM,
  heightMm: A4_H_MM,
  paddingMm: PAGE_PADDING_MM,
};
