import { useEffect, useRef, useState } from "react";

/**
 * Render PDF pages or an image as a stack of canvases.
 * Reports each page's rendered pixel size so overlays can be scaled correctly.
 */
export interface RenderedPage {
  index: number; // 1-based
  width: number; // CSS px
  height: number; // CSS px
}

interface Props {
  url: string;
  mime: string;
  /** Maximum width in CSS px for each page */
  maxWidth?: number;
  onPagesRendered: (pages: RenderedPage[]) => void;
  /** Renders an overlay layer on top of each page (zones, draft rectangle, …) */
  renderOverlay: (page: RenderedPage) => React.ReactNode;
}

export function SourceCanvas({
  url,
  mime,
  maxWidth = 900,
  onPagesRendered,
  renderOverlay,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!hostRef.current) return;
      hostRef.current.innerHTML = "";

      if (mime.startsWith("image/")) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("Image illisible"));
        });
        if (cancelled) return;
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.style.display = "block";
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        hostRef.current.appendChild(canvas);
        const list = [{ index: 1, width: w, height: h }];
        setPages(list);
        onPagesRendered(list);
        return;
      }

      // PDF
      const pdfjs = await import("pdfjs-dist");
      // worker
      const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
      (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
        workerSrc;

      const doc = await pdfjs.getDocument({ url }).promise;
      const out: RenderedPage[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const v1 = page.getViewport({ scale: 1 });
        const scale = Math.min(2, maxWidth / v1.width);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.display = "block";
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        hostRef.current.appendChild(canvas);
        out.push({ index: i, width: viewport.width, height: viewport.height });
      }
      setPages(out);
      onPagesRendered(out);
    }
    run().catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, mime, maxWidth]);

  return (
    <div className="relative inline-block">
      <div ref={hostRef} />
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        {pages.map((p) => (
          <div
            key={p.index}
            className="relative pointer-events-auto"
            style={{ width: p.width, height: p.height }}
          >
            {renderOverlay(p)}
          </div>
        ))}
      </div>
    </div>
  );
}
