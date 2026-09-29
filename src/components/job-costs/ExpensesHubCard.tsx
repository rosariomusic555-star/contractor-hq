import { ChevronRight } from "lucide-react";
import { useJobCosts } from "@/hooks/use-job-costs";
import { COST_TYPE_LABEL } from "@/lib/costPlanMath";
import { JOB_COST_STATUS_META } from "@/lib/jobCosts";
import { cn, formatCurrency, pluralize } from "@/lib/utils";

/** The project page's Expenses card — actual vs planned at a glance (same
 * numbers as the job costs view it opens). */
export function ExpensesHubCard({ projectId, onOpen }: { projectId: string; onOpen: () => void }) {
  const data = useJobCosts(projectId);
  const r = data?.report;
  const pctSpent = r?.spentPct ?? null;
  const meta = r ? JOB_COST_STATUS_META[r.status] : null;
  const nothing = !r || (r.actual === 0 && r.planned === 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-surface group flex items-center justify-between gap-3 p-4 text-left transition-shadow hover:shadow-card-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">Expenses</span>
          {meta && !nothing && <span className={cn(meta.className, "text-[10px]")}>{meta.label}</span>}
        </span>
        {nothing ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">None yet</span>
        ) : (
          <>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{formatCurrency(r!.actual)}</span>
              {r!.planned > 0 ? ` of ${formatCurrency(r!.planned)} planned · ${Math.round(pctSpent ?? 0)}%` : " spent"}
            </span>
            {r!.planned > 0 && (
              <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <span
                  className={cn("block h-full rounded-full", (pctSpent ?? 0) > 100 ? "bg-destructive" : r!.status === "ahead" ? "bg-warning" : "bg-primary")}
                  style={{ width: `${Math.min(100, pctSpent ?? 0)}%` }}
                />
              </span>
            )}
            {r!.topTypes.length > 0 && (
              <span className="mt-1 block truncate text-[11px] text-muted-subtle">
                {r!.topTypes.slice(0, 2).map((t) => `${COST_TYPE_LABEL[t.type]} ${formatCurrency(t.amount)}`).join(" · ")}
              </span>
            )}
            {r!.unassignedCount > 0 && (
              <span className="mt-0.5 block truncate text-[11px] font-semibold text-warning-strong">
                {pluralize(r!.unassignedCount, "expense")} not assigned to a feature
              </span>
            )}
          </>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
