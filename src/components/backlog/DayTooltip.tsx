import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils";
import { projectStatusMeta } from "@/lib/statusMeta";
import type { BacklogJob } from "@/lib/backlog";

/** Hover a mini-month day cell — lists every job covering that day
 * (project, client, amount, status). No-ops (just renders children) on an
 * empty day, same as not wrapping it at all. */
export function DayTooltip({ jobs, children }: { jobs: BacklogJob[]; children: ReactNode }) {
  if (jobs.length === 0) return <>{children}</>;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] space-y-2">
        {jobs.map((job) => (
          <div key={job.projectId} className="border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
            <p className="font-bold text-foreground">{job.projectName}</p>
            <p className="text-muted-foreground">
              {job.clientName ?? "No client"} · {formatCurrency(job.contractDollars)}
            </p>
            <p className="text-muted-foreground">{projectStatusMeta(job.status).label}</p>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
