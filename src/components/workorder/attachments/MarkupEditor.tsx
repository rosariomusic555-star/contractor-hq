import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2, Pencil, Trash2, Type, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Pt = [number, number];
type Shape =
  | { kind: "pen"; color: string; w: number; pts: Pt[] }
  | { kind: "arrow"; color: string; w: number; a: Pt; b: Pt }
  | { kind: "text"; color: string; size: number; at: Pt; text: string };

const COLORS = [
  { v: "#e11d48", label: "Red" },
  { v: "#facc15", label: "Yellow" },
  { v: "#2563eb", label: "Blue" },
  { v: "#16a34a", label: "Green" },
  { v: "#ffffff", label: "White" },
  { v: "#111827", label: "Black" },
];
const MAX_EDGE = 3200;

function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], k: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of shapes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    if (s.kind === "pen") {
      ctx.lineWidth = s.w * k;
      ctx.beginPath();
      s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
      if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] * k + 0.1, s.pts[0][1] * k);
      ctx.stroke();
    } else if (s.kind === "arrow") {
      const [ax, ay] = [s.a[0] * k, s.a[1] * k];
      const [bx, by] = [s.b[0] * k, s.b[1] * k];
      const w = s.w * k;
      const ang = Math.atan2(by - ay, bx - ax);
      const head = Math.max(w * 4, 14 * k);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx - Math.cos(ang) * head * 0.6, by - Math.sin(ang) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - head * Math.cos(ang - 0.45), by - head * Math.sin(ang - 0.45));
      ctx.lineTo(bx - head * Math.cos(ang + 0.45), by - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    } else {
      const size = s.size * k;
      ctx.font = `bold ${size}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "middle";
      // Outline in the opposite tone so a label reads on any background.
      ctx.lineWidth = Math.max(2, size / 6);
      ctx.strokeStyle = s.color === "#ffffff" || s.color === "#facc15" ? "#111827" : "#ffffff";
      ctx.strokeText(s.text, s.at[0] * k, s.at[1] * k);
      ctx.fillText(s.text, s.at[0] * k, s.at[1] * k);
    }
  }
}

/**
 * Annotate an image (or a rendered PDF page): draw, arrows, text labels, a
 * few colors, undo. Saves a NEW image at full resolution — the original
 * file is never changed.
 */
export function MarkupEditor({
  open,
  imageUrl,
  title,
  onClose,
  onSave,
}: {
  open: boolean;
  imageUrl: string | null;
  title: string;
  onClose: () => void;
  onSave: (out: { blob: Blob; width: number; height: number }) => Promise<void>;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<"pen" | "arrow" | "text">("pen");
  const [color, setColor] = useState(COLORS[0].v);
  const [textAt, setTextAt] = useState<{ at: Pt; screen: Pt } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [saving, setSaving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    setShapes([]);
    setDraft(null);
    setTextAt(null);
    setImg(null);
    setLoadError(false);
    if (!open || !imageUrl) return;
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.onerror = () => setLoadError(true);
    i.src = imageUrl;
  }, [open, imageUrl]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, img]);

  // Display scale: the image fit into the stage.
  const fit = img && box.w && box.h ? Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight) : 0;
  // Stroke sizes are in image pixels, so they look the same at any zoom.
  const unit = img ? Math.max(img.naturalWidth, img.naturalHeight) / 400 : 1;

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c || !img || !fit) return;
    const dpr = window.devicePixelRatio || 1;
    const w = img.naturalWidth * fit;
    const h = img.naturalHeight * fit;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(img, 0, 0, w, h);
    drawShapes(ctx, draft ? [...shapes, draft] : shapes, fit);
  }, [img, fit, shapes, draft]);
  useEffect(redraw, [redraw]);

  const toImage = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / fit, (e.clientY - r.top) / fit];
  };

  const commitText = () => {
    if (textAt && textValue.trim()) setShapes((s) => [...s, { kind: "text", color, size: unit * 9, at: textAt.at, text: textValue.trim() }]);
    setTextAt(null);
    setTextValue("");
  };

  const save = async () => {
    if (!img) return;
    // A label still being typed counts too (state won't have it yet).
    const pending = textAt && textValue.trim() ? [{ kind: "text" as const, color, size: unit * 9, at: textAt.at, text: textValue.trim() }] : [];
    const all = [...shapes, ...pending];
    commitText();
    setSaving(true);
    try {
      const k = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const out = document.createElement("canvas");
      out.width = Math.round(img.naturalWidth * k);
      out.height = Math.round(img.naturalHeight * k);
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(img, 0, 0, out.width, out.height);
      drawShapes(ctx, all, k);
      const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("Couldn't save the marked-up image.");
      await onSave({ blob, width: out.width, height: out.height });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-neutral-900 p-0 text-white sm:rounded-none [&>button]:hidden">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-bold text-white">Mark up · {title}</DialogTitle>
            <DialogDescription className="text-xs text-white/60">Saved as a new image — the original stays as it is.</DialogDescription>
          </div>
          <Button variant="ghost" className="h-9 text-white hover:bg-white/10 hover:text-white" onClick={onClose} disabled={saving}>
            <X className="mr-1 h-4 w-4" /> Cancel
          </Button>
          <Button className="h-9 font-bold" onClick={() => void save()} disabled={saving || !img || (shapes.length === 0 && !textValue.trim())}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save copy
          </Button>
        </div>

        <div ref={wrap} className="relative flex min-h-0 flex-1 items-center justify-center p-2">
          {loadError ? (
            <p className="text-sm text-white/70">Couldn't load this image to mark up.</p>
          ) : !img ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
          ) : (
            <canvas
              ref={canvas}
              className="touch-none"
              style={{ cursor: tool === "text" ? "text" : "crosshair" }}
              onPointerDown={(e) => {
                const p = toImage(e);
                if (tool === "text") {
                  commitText();
                  const r = wrap.current!.getBoundingClientRect();
                  setTextAt({ at: p, screen: [e.clientX - r.left, e.clientY - r.top] });
                  return;
                }
                try {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                } catch {
                  // no capture available — drawing still works while the pointer stays on the canvas
                }
                setDraft(tool === "pen" ? { kind: "pen", color, w: unit * 1.6, pts: [p] } : { kind: "arrow", color, w: unit * 1.6, a: p, b: p });
              }}
              onPointerMove={(e) => {
                if (!draft) return;
                const p = toImage(e);
                setDraft(draft.kind === "pen" ? { ...draft, pts: [...draft.pts, p] } : draft.kind === "arrow" ? { ...draft, b: p } : draft);
              }}
              onPointerUp={() => {
                if (draft && !(draft.kind === "arrow" && Math.hypot(draft.b[0] - draft.a[0], draft.b[1] - draft.a[1]) < unit * 3)) setShapes((s) => [...s, draft]);
                setDraft(null);
              }}
            />
          )}
          {textAt && (
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                if (e.key === "Escape") setTextAt(null);
              }}
              onBlur={commitText}
              placeholder="Type a label…"
              className="absolute z-10 w-56 rounded-md border-2 bg-white/95 px-2 py-1 text-sm font-bold text-neutral-900 shadow-lg outline-none"
              style={{ left: Math.min(textAt.screen[0], box.w - 230), top: Math.max(4, textAt.screen[1] - 18), borderColor: color }}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-2">
          {([
            { v: "pen", icon: Pencil, label: "Draw" },
            { v: "arrow", icon: ArrowUpRight, label: "Arrow" },
            { v: "text", icon: Type, label: "Text" },
          ] as const).map((t) => (
            <button
              key={t.v}
              type="button"
              aria-pressed={tool === t.v}
              onClick={() => setTool(t.v)}
              className={cn("flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold", tool === t.v ? "bg-white text-neutral-900" : "text-white/80 hover:bg-white/10")}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-white/20" />
          {COLORS.map((c) => (
            <button
              key={c.v}
              type="button"
              aria-label={c.label}
              aria-pressed={color === c.v}
              onClick={() => setColor(c.v)}
              className={cn("h-8 w-8 rounded-full border-2", color === c.v ? "border-white ring-2 ring-white/60 ring-offset-2 ring-offset-neutral-900" : "border-white/30")}
              style={{ background: c.v }}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-white/20" />
          <button type="button" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length} className="flex h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40">
            <Undo2 className="h-4 w-4" /> Undo
          </button>
          <button type="button" onClick={() => setShapes([])} disabled={!shapes.length} className="flex h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40">
            <Trash2 className="h-4 w-4" /> Clear
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
