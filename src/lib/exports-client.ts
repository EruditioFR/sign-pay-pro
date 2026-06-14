/**
 * Client-side helpers to turn server-fetched rows into downloadable
 * CSV / PDF blobs. Pure browser code — no server imports.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((c) => csvEscape(String(c))).join(",");
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","));
  // BOM for Excel UTF-8 compatibility
  return "\uFEFF" + [header, ...lines].join("\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: (keyof T)[],
  filename: string,
) {
  const csv = rowsToCsv(rows, columns);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
}

/* ------------------------------- PDF ------------------------------- */

type ActivityDoc = {
  id: string;
  title: string;
  reference: string | null;
  type: string;
  status: string;
  third_party_name: string | null;
  third_party_email: string | null;
  amount_ttc: number | null;
  currency: string | null;
  issue_date: string | null;
  due_date: string | null;
  created_at: string;
  organization_name: string | null;
};
type ActivityEvent = {
  created_at: string;
  action: string;
  user_email: string | null;
  user_full_name: string | null;
  metadata: unknown;
};

function fmt(d: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("fr-FR"); } catch { return d; }
}

/** Sanitize text for WinAnsi fonts (StandardFonts.Helvetica) — strip codepoints > 0xFF. */
function safe(s: string): string {
  // Replace common smart quotes/dashes, then drop anything still outside latin-1.
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u00A0]/g, " ")
    .replace(/[^\x00-\xFF]/g, "?");
}

export async function buildDocumentActivityPdf(
  doc: ActivityDoc,
  events: ActivityEvent[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawText = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const color = opts.color ?? [0.1, 0.1, 0.1];
    const x = margin + (opts.indent ?? 0);
    // simple word-wrap
    const words = safe(text).split(/\s+/);
    let line = "";
    const maxW = contentWidth - (opts.indent ?? 0);
    const lines: string[] = [];
    for (const w of words) {
      const cand = line ? line + " " + w : w;
      if (f.widthOfTextAtSize(cand, size) > maxW) {
        if (line) lines.push(line);
        line = w;
      } else {
        line = cand;
      }
    }
    if (line) lines.push(line);
    for (const ln of lines) {
      if (y < margin + 40) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(ln, { x, y, size, font: f, color: rgb(color[0], color[1], color[2]) });
      y -= size + 4;
    }
  };

  const hr = () => {
    if (y < margin + 40) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 10;
  };

  // Header
  drawText("Historique d'activité du document", { size: 16, bold: true });
  y -= 4;
  drawText(`${doc.title}${doc.reference ? ` · ${doc.reference}` : ""}`, { size: 11, bold: true });
  drawText(`Type: ${doc.type} · Statut: ${doc.status}`, { size: 9, color: [0.35, 0.35, 0.35] });
  if (doc.organization_name) drawText(`Organisation: ${doc.organization_name}`, { size: 9, color: [0.35, 0.35, 0.35] });
  y -= 4;
  hr();

  // Doc summary
  drawText("Récapitulatif", { size: 12, bold: true });
  drawText(`Tiers: ${doc.third_party_name ?? "—"}${doc.third_party_email ? ` <${doc.third_party_email}>` : ""}`);
  drawText(`Montant TTC: ${doc.amount_ttc != null ? `${doc.amount_ttc} ${doc.currency ?? ""}` : "—"}`);
  drawText(`Date d'émission: ${doc.issue_date ?? "—"} · Échéance: ${doc.due_date ?? "—"}`);
  drawText(`Créé le: ${fmt(doc.created_at)}`);
  y -= 4;
  hr();

  // Events
  drawText(`Événements (${events.length})`, { size: 12, bold: true });
  y -= 2;
  if (events.length === 0) {
    drawText("Aucun événement enregistré.", { color: [0.5, 0.5, 0.5] });
  } else {
    for (const ev of events) {
      drawText(`• ${fmt(ev.created_at)}  —  ${ev.action}`, { size: 10, bold: true });
      const who = ev.user_full_name || ev.user_email || "Système";
      drawText(`Par: ${who}`, { size: 9, indent: 12, color: [0.35, 0.35, 0.35] });
      if (ev.metadata && typeof ev.metadata === "object" && Object.keys(ev.metadata as object).length > 0) {
        drawText(JSON.stringify(ev.metadata), { size: 8, indent: 12, color: [0.45, 0.45, 0.45] });
      }
      y -= 2;
    }
  }

  // Footer on last page
  drawText(`Document généré le ${new Date().toLocaleString("fr-FR")} · ${events.length} événement(s)`, {
    size: 8,
    color: [0.55, 0.55, 0.55],
  });

  return await pdf.save();
}

export async function downloadDocumentActivityPdf(
  doc: ActivityDoc,
  events: ActivityEvent[],
  filename: string,
) {
  const bytes = await buildDocumentActivityPdf(doc, events);
  // Wrap in a fresh ArrayBuffer to satisfy Blob's typing on all TS targets.
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  downloadBlob(new Blob([ab], { type: "application/pdf" }), filename);
}
