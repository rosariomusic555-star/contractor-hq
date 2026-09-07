import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SubTone = "muted" | "positive" | "negative";

const subToneClass: Record<SubTone, string> = {
  muted: "text-muted-foreground",
  positive: "text-success",
  negative: "text-destructive",
};

/** Small "UPPERCASE LABEL · big number · sub-line" card used on the money screens. */
export function KpiCard({
  label,
  value,
  sub,
  subTone = "muted",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  subTone?: SubTone;
  className?: string;
}) {
  return (
    <div className={cn("kpi-card", className)}>
      <div className="kpi-card-label">{label}</div>
      <div className="mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums text-foreground">
        {value}
      </div>
      {sub != null && (
        <div className={cn("mt-1 text-xs font-semibold", subToneClass[subTone])}>{sub}</div>
      )}
    </div>
  );
}
