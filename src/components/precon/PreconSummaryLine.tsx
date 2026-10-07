import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { openSummary, preconPhase } from "@/lib/precon";
import { usePreconBundle } from "./usePrecon";
import { READINESS_LABEL, READINESS_TONE } from "./preconStyles";

/** One-line readiness (Bookings job card, the project page's tabbed header)
 * — links to the full card (`to`, default the project page). */
export function PreconSummaryLine({ projectId, to, className }: { projectId: string; to?: string; className?: string }) {
  const { data: b } = usePreconBundle(projectId);
  if (!b || preconPhase(b.project) !== "before" || b.readiness.views.length === 0) return null;
  const r = b.readiness;
  return (
    <Link to={to ?? `/projects/${projectId}?tab=schedule`} className={cn("mt-3 flex items-start gap-2 rounded-lg border border-border p-2.5 text-xs hover:bg-muted/40", className)}>
      <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className={cn("mr-1.5 rounded-full px-2 py-0.5 font-bold", READINESS_TONE[r.status])}>{READINESS_LABEL[r.status]}</span>
        <span className="text-muted-foreground">
          {r.done} of {r.total} ready{r.openRequired.length ? ` · ${openSummary(r.openRequired)}` : ""}
        </span>
      </span>
    </Link>
  );
}
