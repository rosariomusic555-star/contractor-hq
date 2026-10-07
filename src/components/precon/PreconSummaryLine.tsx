import { Link } from "react-router-dom";
import { Check, ChevronRight, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { preconPhase } from "@/lib/precon";
import { usePreconBundle } from "./usePrecon";

/**
 * One calm line of pre-construction progress — "Pre-construction · 2 of 7
 * ready ›", or "Ready ✓" in muted green once everything required is done.
 * Setup tasks, not problems: no warning colors or icons (the Dashboard /
 * Needs you reminders before a start date are where it nags). Links to the
 * checklist (`to`, default the project's Schedule tab at the checklist).
 * Project page header and the Bookings job card.
 */
export function PreconSummaryLine({ projectId, to, className }: { projectId: string; to?: string; className?: string }) {
  const { data: b } = usePreconBundle(projectId);
  if (!b || preconPhase(b.project) !== "before" || b.readiness.views.length === 0) return null;
  const r = b.readiness;
  const ready = r.status === "ready";
  return (
    <Link
      to={to ?? `/projects/${projectId}?tab=schedule#precon`}
      className={cn("mt-3 flex min-h-9 items-center gap-2 rounded-lg px-1 text-xs text-muted-foreground hover:text-foreground", className)}
    >
      <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        Pre-construction ·{" "}
        {ready ? (
          <span className="inline-flex items-center gap-0.5 font-semibold text-success/80">
            Ready <Check className="h-3 w-3" />
          </span>
        ) : (
          <span>
            {r.done} of {r.total} ready
          </span>
        )}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
}
