import { cn } from "@/lib/utils";

/**
 * The small visuals inside a stat tile (StatTile `visual`): a sparkline, a
 * thin progress bar, a mini segmented bar. Brand light green only.
 */

/** Line + soft area, no axes. Needs 2+ points; flat when all equal. */
export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const w = 80;
  const h = 28;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, h - 2 - ((p - min) / span) * (h - 4)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-7 w-20 shrink-0 overflow-visible", className)} aria-hidden>
      <path d={`${line} L${w},${h} L0,${h} Z`} className="fill-primary/15" />
      <path d={line} className="fill-none stroke-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Thin bar, 0–1 (clamped). `danger`: red fill (e.g. over budget). */
export function MiniProgress({ value, danger = false, className }: { value: number; danger?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      <span className={cn("block h-full rounded-full", danger ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Proportional segments (zero parts skipped); `className` per part sets its colour. */
export function MiniSegments({ parts, className }: { parts: { value: number; className: string; label: string }[]; className?: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  return (
    <span className={cn("flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => <span key={p.label} title={p.label} className={cn("block h-full", p.className)} style={{ width: `${(p.value / total) * 100}%` }} />)}
    </span>
  );
}
