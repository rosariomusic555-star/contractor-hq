import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MiniProgress, MiniSegments, Sparkline } from "./MiniVisuals";

/** One small visual per tile: last-months sparkline, a progress bar (0–1)
 *  or a segmented bar. */
export type TileVisual =
  | { kind: "spark"; points: number[] }
  | { kind: "progress"; value: number; danger?: boolean }
  | { kind: "segments"; parts: { value: number; className: string; label: string }[] };

type SubTone = "muted" | "positive" | "negative";

const subToneClass: Record<SubTone, string> = {
  muted: "text-muted-foreground",
  positive: "text-success",
  negative: "text-destructive",
};

/**
 * The white stat tile from the Dashboard banner — label + small icon chip,
 * big value, muted sub-line — shared by the Dashboard headline tiles, list
 * pages' KPI rows (KpiCard) and anywhere else a headline number sits. Fixed
 * height (120 / 128px) so a row of them can straddle a banner's bottom edge
 * by exactly half a tile. A link with `to`, a button with `onClick`, a plain
 * card otherwise (`clickable` adds the chevron when a parent handles the
 * click).
 */
export function StatTile({
  label,
  value,
  sub,
  subTone = "muted",
  icon: Icon,
  alert = false,
  loading = false,
  clickable = false,
  visual,
  active = false,
  to,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: SubTone;
  icon?: ComponentType<{ className?: string }>;
  /** Value in red (e.g. overdue money above $0). */
  alert?: boolean;
  loading?: boolean;
  clickable?: boolean;
  visual?: TileVisual;
  /** Its filter is applied to the list below (ring). */
  active?: boolean;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = !!to || !!onClick || clickable;
  const cls = cn(
    "group flex h-[120px] flex-col rounded-card border border-border bg-card px-4 py-3.5 text-left text-foreground shadow-card md:h-32 md:px-5 md:py-4",
    interactive && "transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    active && "ring-2 ring-primary",
    className,
  );
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 min-w-0 pt-0.5 text-xs font-semibold leading-4 text-muted-foreground">{label}</span>
        {Icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-success" aria-hidden>
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : (
          interactive && <ChevronRight className="h-3.5 w-3.5 shrink-0 translate-y-px text-muted-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
        )}
      </span>
      {loading ? (
        <span className="mt-auto block h-7 w-20 animate-pulse rounded bg-muted" />
      ) : (
        <span className={cn("mt-auto block min-w-0 truncate text-[26px] font-extrabold leading-tight tabular-nums md:text-[28px]", alert && "text-destructive")}>{value}</span>
      )}
      {!loading && visual?.kind === "progress" && <MiniProgress value={visual.value} danger={visual.danger} className="mt-1.5" />}
      {!loading && visual?.kind === "segments" && <MiniSegments parts={visual.parts} className="mt-1.5" />}
      {/* The sparkline sits beside the sub-line, never squeezing the value. */}
      <span className="mt-0.5 flex items-end justify-between gap-2">
        <span className={cn("block min-w-0 truncate text-xs", sub != null && sub !== "" ? subToneClass[subTone] : "text-muted-foreground")}>{sub || " "}</span>
        {!loading && visual?.kind === "spark" && <Sparkline points={visual.points} className="h-5 w-16" />}
      </span>
    </>
  );
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}
