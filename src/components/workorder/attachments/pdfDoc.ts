import { useEffect, useState } from "react";
import { loadPdfJs } from "@/lib/workOrderAttachmentsApi";

export type PdfDoc = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfJs>>["getDocument"]>["promise"]>;

const docs = new Map<string, Promise<PdfDoc>>();

/** One loaded PDF per URL (pdf.js is loaded on first use). */
export function usePdf(url: string | null) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setDoc(null);
    setError(false);
    if (!docs.has(url)) docs.set(url, loadPdfJs().then((p) => p.getDocument({ url }).promise));
    docs
      .get(url)!
      .then((d) => alive && setDoc(d))
      .catch(() => {
        docs.delete(url);
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return { doc, error };
}

const tasks = new WeakMap<HTMLCanvasElement, { cancel: () => void; promise: Promise<unknown> }>();

/** Render one page into a canvas, `cssWidth` wide (sharp on retina, capped). */
export async function renderPdfPage(doc: PdfDoc, pageNumber: number, canvas: HTMLCanvasElement, maxCssWidth: number, supersample = 1, maxCssHeight = Infinity, maxPixels = 4096) {
  // pdf.js can't draw two renders into one canvas — cancel the previous one.
  const prev = tasks.get(canvas);
  if (prev) {
    prev.cancel();
    await prev.promise.catch(() => undefined);
  }
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  // Fit inside the box: width, and height when one is given.
  const cssWidth = Math.min(maxCssWidth, (maxCssHeight * base.width) / base.height);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  // Supersampled so pinch-zooming a plan stays sharp.
  const scale = Math.min((cssWidth * dpr * supersample) / base.width, maxPixels / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * vp.height) / vp.width}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvas, canvasContext: ctx, viewport: vp });
  tasks.set(canvas, task);
  try {
    await task.promise;
  } finally {
    if (tasks.get(canvas) === task) tasks.delete(canvas);
  }
}

