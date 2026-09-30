import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Minus, PenLine, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CrewAttachment } from "@/lib/crewSafe";
import { categoryLabel, isPdf } from "@/lib/workOrderAttachments";
import { ZoomPan } from "./ZoomPan";
import { PdfPage } from "./pdf";
import { usePdf } from "./pdfDoc";

/**
 * Full-screen attachment viewer: pinch / scroll to zoom and pan (detailed
 * plans), swipe or arrow keys between attachments, PDFs page by page with
 * zoom, and Open / Download. `onMarkup` (contractor only) opens the
 * annotate tool on the image, or on the PDF page being shown.
 */
export function AttachmentViewer({
  items,
  index,
  urls,
  onIndexChange,
  onClose,
  onMarkup,
}: {
  items: CrewAttachment[];
  index: number | null;
  urls: Record<string, string>;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onMarkup?: (a: CrewAttachment, source: { imageUrl: string; page?: number }) => void;
}) {
  const a = index != null ? items[index] : null;
  const url = a ? urls[a.id] : null;
  const [page, setPage] = useState(1);
  const [zoomReq, setZoomReq] = useState({ id: 0, factor: 1 });
  const zoom = (factor: number) => setZoomReq((z) => ({ id: z.id + 1, factor }));
  const [stageW, setStageW] = useState(0);
  const [stageH, setStageH] = useState(0);
  const pdfCanvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setPage(1);
  }, [a?.id]);

  // Measured through a callback ref: the dialog's content mounts after this
  // component, so a plain ref would still be empty in an effect.
  const ro = useRef<ResizeObserver | null>(null);
  const stage = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    const measure = () => {
      setStageW(el.clientWidth);
      setStageH(el.clientHeight);
    };
    ro.current = new ResizeObserver(measure);
    ro.current.observe(el);
    measure();
  }, []);

  const go = useCallback((d: -1 | 1) => index != null && items.length > 1 && onIndexChange((index + d + items.length) % items.length), [index, items.length, onIndexChange]);

  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  const pdf = isPdf(a?.mime_type);
  const { doc } = usePdf(pdf && url ? url : null);
  const pages = doc?.numPages ?? a?.page_count ?? 1;
  const onRendered = useCallback((c: HTMLCanvasElement) => (pdfCanvas.current = c), []);

  return (
    <Dialog open={index != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-neutral-950 p-0 text-white sm:rounded-none [&>button]:hidden">
        {a && (
          <>
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-base font-bold text-white">{a.title}</DialogTitle>
                <DialogDescription className="truncate text-xs text-white/60">
                  {categoryLabel(a.category)}
                  {items.length > 1 ? ` · ${index! + 1} of ${items.length}` : ""}
                  {a.note ? ` · ${a.note}` : ""}
                </DialogDescription>
              </div>
              {onMarkup && url && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9"
                  onClick={() =>
                    pdf
                      ? pdfCanvas.current && onMarkup(a, { imageUrl: pdfCanvas.current.toDataURL("image/png"), page })
                      : onMarkup(a, { imageUrl: url })
                  }
                >
                  <PenLine className="mr-1 h-4 w-4" /> Mark up{pdf ? " page" : ""}
                </Button>
              )}
              {url && (
                <>
                  <Button asChild size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/10 hover:text-white" aria-label="Open in a new tab">
                    <a href={url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-5 w-5" />
                    </a>
                  </Button>
                  <Button asChild size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/10 hover:text-white" aria-label="Download">
                    <a href={url} download={`${a.title}.${pdf ? "pdf" : a.mime_type === "image/png" ? "png" : "jpg"}`}>
                      <Download className="h-5 w-5" />
                    </a>
                  </Button>
                </>
              )}
              <Button size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Close">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div ref={stage} className="relative min-h-0 flex-1">
              {!url ? (
                <p className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">Not available offline — open it once with signal to keep a copy.</p>
              ) : pdf ? (
                <ZoomPan resetKey={`${a.id}-${page}`} onSwipe={pages > 1 ? undefined : go} zoomRequest={zoomReq}>
                  {stageW > 0 && <PdfPage url={url} page={page} width={Math.max(200, Math.min(stageW - 16, 1100))} maxHeight={Math.max(200, stageH - 16)} supersample={2.5} onRendered={onRendered} className="shadow-lg" />}
                </ZoomPan>
              ) : (
                <ZoomPan resetKey={a.id} onSwipe={go} zoomRequest={zoomReq}>
                  <img src={url} alt={a.title} draggable={false} className="max-h-full max-w-full object-contain" />
                </ZoomPan>
              )}
              {items.length > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70" aria-label="Previous attachment">
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70" aria-label="Next attachment">
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {url && (
              <div className="flex items-center justify-center gap-2 border-t border-white/10 px-3 py-2 text-sm">
                {pdf && (
                  <>
                    <Button size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10 hover:text-white" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <span className="min-w-[88px] text-center tabular-nums">
                      Page {page} of {pages}
                    </span>
                    <Button size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10 hover:text-white" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                    <span className="mx-2 h-5 w-px bg-white/20" />
                  </>
                )}
                <Button size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10 hover:text-white" onClick={() => zoom(1 / 1.5)} aria-label="Zoom out">
                  <Minus className="h-5 w-5" />
                </Button>
                <button type="button" className="rounded px-2 text-xs text-white/70 hover:text-white" onClick={() => zoom(0)}>
                  Fit
                </button>
                <Button size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/10 hover:text-white" onClick={() => zoom(1.5)} aria-label="Zoom in">
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
