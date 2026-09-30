import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { renderPdfPage, usePdf } from "./pdfDoc";
import { cn } from "@/lib/utils";

/** A page of a PDF, fit to `width` CSS pixels. */
export function PdfPage({
  url,
  page,
  width,
  maxHeight,
  supersample = 1,
  className,
  onRendered,
}: {
  url: string;
  page: number;
  width: number;
  /** Also fit this tall (the viewer's "Fit" shows the whole page). */
  maxHeight?: number;
  supersample?: number;
  className?: string;
  onRendered?: (c: HTMLCanvasElement) => void;
}) {
  const { doc, error } = usePdf(url);
  const ref = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    if (!doc || !ref.current || width <= 0) return;
    let alive = true;
    setBusy(true);
    renderPdfPage(doc, Math.min(Math.max(1, page), doc.numPages), ref.current, width, supersample, maxHeight ?? Infinity)
      .then(() => {
        if (alive && ref.current) onRendered?.(ref.current);
      })
      .catch(() => undefined)
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [doc, page, width, maxHeight, supersample, onRendered]);
  if (error)
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground", className)} style={{ width, height: width * 1.29 }}>
        <FileText className="h-8 w-8" /> Couldn't open this PDF here — use Open.
      </div>
    );
  return (
    <div className={cn("relative bg-white", className)}>
      <canvas ref={ref} className="block" />
      {busy && (
        <div className="absolute inset-0 flex min-h-24 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-subtle" />
        </div>
      )}
    </div>
  );
}

/** First-page thumbnail for a PDF tile. */
export function PdfThumb({ url, width, className }: { url: string; width: number; className?: string }) {
  return <PdfPage url={url} page={1} width={width} className={className} />;
}
