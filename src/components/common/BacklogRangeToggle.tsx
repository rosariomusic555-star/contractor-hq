import { cn } from "@/lib/utils";
import type { BacklogRangeMonths } from "@/lib/api";

const RANGE_OPTIONS: BacklogRangeMonths[] = [6, 12];

/** Segmented 6/12-month toggle — shared by the Dashboard Seasonal Backlog
 * card and the full /backlog page (see useBacklogRange()). */
export function BacklogRangeToggle({
  range,
  onChange,
  className,
}: {
  range: BacklogRangeMonths;
  onChange: (months: BacklogRangeMonths) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}>
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={range === opt}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
            range === opt ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt} months
        </button>
      ))}
    </div>
  );
}
