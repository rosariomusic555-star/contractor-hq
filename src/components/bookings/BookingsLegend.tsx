import { cn } from "@/lib/utils";
import { PROJECT_STATUS_META, TONE_SOLID_CLASS } from "@/lib/statusMeta";
import type { ProjectStatus } from "@/lib/api";

// Only the statuses that can actually land on the calendar — Estimating/Lost
// jobs never reach seasonalBookings()'s COMMITTED_STATUSES filter.
const CALENDAR_STATUSES: ProjectStatus[] = ["scheduled", "in_progress", "complete"];

/** Status color key for the job bars — same tone tokens as everywhere else
 * in the app (StatusPill etc.), just as solid swatches. */
export function BookingsLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {CALENDAR_STATUSES.map((status) => {
        const meta = PROJECT_STATUS_META[status];
        return (
          <div key={status} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", TONE_SOLID_CLASS[meta.tone].split(" ")[0])} />
            <span className="text-xs font-semibold text-muted-foreground">{meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}
