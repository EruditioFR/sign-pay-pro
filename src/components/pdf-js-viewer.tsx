import { useEffect, useRef, useState } from "react";
import type * as PdfJs from "pdfjs-dist";
import { Loader2 } from "lucide-react";

let _pdfjs: typeof PdfJs | null = null;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const mod = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  mod.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = mod;
  return mod;
}

/**
 * Mobile-friendly PDF viewer. Renders all pages with PDF.js inside a scrollable
 * container — works on iOS Safari where <iframe src=*.pdf> shows only a download
 * placeholder.
 */
export function PdfJsViewer({
  url,
  className = "h-[70vh] w-full",
}: {
  url: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => {
      const next = Math.floor(container.clientWidth || 360);
      setContainerWidth((prev) => (Math.abs(next - prev) >= 16 ? next : prev));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const renderTasks: Array<{ cancel: () => void }> = [];
    setLoading(true);
    setError(null);
    setPageCount(0);

    const container = containerRef.current;
    if (container) container.innerHTML = "";

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        const containerW = containerWidth || container.clientWidth || 360;

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(containerW / base.width, 2);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "block mx-auto mb-2 shadow-sm rounded bg-white max-w-full h-auto";
          container.appendChild(canvas);
          const ctx = canvas.getContext("2d")!;
          const task = page.render({ canvas, canvasContext: ctx, viewport });
          renderTasks.push(task);
          await task.promise;
          if (cancelled) return;
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || "Impossible de charger le PDF");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTasks.forEach((task) => {
        try {
          task.cancel();
        } catch {
          // Rendering may already be complete.
        }
      });
    };
  }, [url, containerWidth]);

  return (
    <div className={`relative overflow-auto rounded border bg-muted/30 ${className}`}>
      <div ref={containerRef} className="p-2" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Chargement du PDF…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-destructive">
          {error}
        </div>
      )}
      {!loading && !error && pageCount === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground">Aucune page.</div>
      )}
    </div>
  );
}
