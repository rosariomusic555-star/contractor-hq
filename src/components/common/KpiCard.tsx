import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type SubTone = "muted" | "positive" | "negative";

const subToneClass: Record<SubTone, string> = {
  muted: "text-muted-foreground",
  positive: "text-success",
  negative: "text-destructive",
};

/**
 * Small "UPPERCASE LABEL · big number · sub-line" card used on the money screens.
 * Pass `clickable` when the card is wrapped in a link/button — adds a corner
 * chevron that nudges right on hover (same affordance as the project hub's
 * clickable tiles), so it reads as tappable rather than a plain stat.
 */
export function KpiCard({
  label,
  value,
  sub,
  subTone = "muted",
  clickable = false,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: SubTone;
  clickable?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("kpi-card", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="kpi-card-label">{label}</div>
        {clickable && (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 translate-y-px text-muted-subtle transition-transform group-hover:translate-x-0.5" />
        )}
      </div>
      <div className="mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
        {value}
      </div>
      {sub != null && (
        <div className={cn("mt-1 text-xs font-semibold", subToneClass[subTone])}>{sub}</div>
      )}
    </div>
  );
}
