import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils";
import { projectStatusMeta } from "@/lib/statusMeta";
import type { BacklogJob } from "@/lib/backlog";

function dateLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Hover tooltip for a job bar — project, client, scope, amount, status,
 * date range. Shared by Month/Quarter/Timeline. */
export function JobTooltip({ job, children }: { job: BacklogJob; children: ReactNode }) {
  const meta = projectStatusMeta(job.status);
  const range = job.endDate && job.endDate !== job.startDate
    ? `${dateLabel(job.startDate)} – ${dateLabel(job.endDate)}`
    : dateLabel(job.startDate);

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px]">
        <p className="font-bold text-foreground">{job.projectName}</p>
        <p className="text-muted-foreground">{job.clientName ?? "No client"}</p>
        {job.scopeLabel && <p className="text-muted-foreground">{job.scopeLabel}</p>}
        <p className="mt-1 font-semibold text-foreground">{formatCurrency(job.contractDollars)}</p>
        <p className="text-muted-foreground">
          {meta.label}
          {range ? ` · ${range}` : ""}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
