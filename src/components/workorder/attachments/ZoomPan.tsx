import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Pinch-to-zoom + pan for a detailed plan on a phone (and wheel / double-
 * click / keyboard on a laptop). No library: two pointers scale around their
 * midpoint, one pointer pans once zoomed, double-tap toggles 2.5×. While
 * not zoomed, a horizontal swipe is reported (swipe between attachments).
 */
export function ZoomPan({
  children,
  resetKey,
  onSwipe,
  maxScale = 6,
  zoomRequest,
}: {
  children: ReactNode;
  /** Zoom buttons outside the stage: a new id applies `factor` (0 = reset). */
  zoomRequest?: { id: number; factor: number };
  /** Changing it resets the view (next attachment / page). */
  resetKey: string;
  onSwipe?: (dir: -1 | 1) => void;
  maxScale?: number;
}) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ t: typeof t; dist: number; mid: { x: number; y: number }; p: { x: number; y: number } } | null>(null);
  const lastTap = useRef(0);
  const swipeStart = useRef<{ x: number; y: number; at: number } | null>(null);

  useEffect(() => setT({ s: 1, x: 0, y: 0 }), [resetKey]);

  const clamp = useCallback((n: typeof t) => ({ ...n, s: Math.min(maxScale, Math.max(1, n.s)), ...(n.s <= 1.001 ? { x: 0, y: 0 } : {}) }), [maxScale]);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) =>
      setT((cur) => {
        const s = Math.min(maxScale, Math.max(1, cur.s * factor));
        const k = s / cur.s;
        return clamp({ s, x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k });
      }),
    [clamp, maxScale],
  );

  useEffect(() => {
    if (!zoomRequest?.id) return;
    if (zoomRequest.factor === 0) setT({ s: 1, x: 0, y: 0 });
    else zoomAt(zoomRequest.factor, 0, 0);
  }, [zoomRequest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      ref.current?.setPointerCapture(e.pointerId);
    } catch {
      // capture unavailable (synthetic pointer) — moves still arrive while over the stage
    }
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      swipeStart.current = { ...pts[0], at: Date.now() };
      const now = Date.now();
      if (now - lastTap.current < 280) {
        const p = pts[0];
        setT((cur) => (cur.s > 1.05 ? { s: 1, x: 0, y: 0 } : clamp({ s: 2.5, x: -p.x * 1.5, y: -p.y * 1.5 })));
        lastTap.current = 0;
      } else lastTap.current = now;
    }
    start.current = {
      t,
      dist: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      mid: pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0],
      p: pts[0],
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !start.current) return;
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    const st = start.current;
    if (pts.length >= 2 && st.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const s = Math.min(maxScale, Math.max(1, st.t.s * (dist / st.dist)));
      const k = s / st.t.s;
      setT(clamp({ s, x: mid.x - (st.mid.x - st.t.x) * k, y: mid.y - (st.mid.y - st.t.y) * k }));
    } else if (pts.length === 1 && st.t.s > 1) {
      setT(clamp({ s: st.t.s, x: st.t.x + pts[0].x - st.p.x, y: st.t.y + pts[0].y - st.p.y }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 && p && swipeStart.current && t.s <= 1.01 && onSwipe) {
      const dx = p.x - swipeStart.current.x;
      const dy = p.y - swipeStart.current.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - swipeStart.current.at < 600) onSwipe(dx < 0 ? 1 : -1);
    }
    // Re-base so a remaining finger keeps panning smoothly.
    const pts = [...pointers.current.values()];
    start.current = pts.length ? { t, dist: 0, mid: pts[0], p: pts[0] } : null;
  };

  return (
    <div
      ref={ref}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={(e) => {
        const p = local(e);
        zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
      }}
      onKeyDown={(e) => {
        if (e.key === "+" || e.key === "=") zoomAt(1.25, 0, 0);
        else if (e.key === "-") zoomAt(1 / 1.25, 0, 0);
        else if (e.key === "0") setT({ s: 1, x: 0, y: 0 });
      }}
      tabIndex={0}
      aria-label="Pinch or scroll to zoom, drag to move. Keys: + and - zoom, 0 resets."
    >
      <div
        className="flex h-full w-full items-center justify-center will-change-transform"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transformOrigin: "center center" }}
      >
        {children}
      </div>
      {t.s > 1.01 && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setT({ s: 1, x: 0, y: 0 })}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white"
        >
          {Math.round(t.s * 100)}% · Reset
        </button>
      )}
    </div>
  );
}
