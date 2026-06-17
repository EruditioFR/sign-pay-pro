import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

/**
 * Wrapper around react-signature-canvas that keeps the drawing intact when the
 * viewport resizes (notably when the mobile keyboard opens / closes, which
 * would otherwise wipe the canvas).
 */
export const ResponsiveSignatureCanvas = forwardRef<SignatureCanvas, { height?: number; className?: string }>(
  function ResponsiveSignatureCanvas({ height = 160, className }, ref) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const padRef = useRef<SignatureCanvas | null>(null);
    const [width, setWidth] = useState<number>(0);

    useImperativeHandle(ref, () => padRef.current as SignatureCanvas, []);

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;
      const update = () => {
        const w = el.clientWidth;
        if (!w) return;
        setWidth((prev) => {
          if (prev === w) return prev;
          // Preserve current drawing across resize.
          const pad = padRef.current;
          const data = pad && !pad.isEmpty() ? pad.toData() : null;
          // We can't restore synchronously here (canvas remounts via key).
          // Schedule restore after React paints the new width.
          if (data) {
            requestAnimationFrame(() => {
              try {
                padRef.current?.fromData(data);
              } catch {
                /* ignore */
              }
            });
          }
          return w;
        });
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      window.addEventListener("orientationchange", update);
      return () => {
        ro.disconnect();
        window.removeEventListener("orientationchange", update);
      };
    }, []);

    return (
      <div ref={wrapperRef} className={className} style={{ height, touchAction: "none" }}>
        {width > 0 && (
          <SignatureCanvas
            key={width}
            ref={padRef}
            canvasProps={{
              width,
              height,
              style: { width: `${width}px`, height: `${height}px`, touchAction: "none" },
            }}
          />
        )}
      </div>
    );
  },
);
