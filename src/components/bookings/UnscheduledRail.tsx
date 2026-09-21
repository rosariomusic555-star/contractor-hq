import { formatCurrency, pluralize, cn } from "@/lib/utils";
import { JOB_DRAG_MIME } from "@/lib/bookingsSchedule";
import type { BookingJob } from "@/lib/bookings";
import { JobTooltip } from "./JobTooltip";

/** Left rail — committed jobs with no scheduled_start_date, draggable
 * straight onto a calendar day (same JOB_DRAG_MIME payload the day cells'
 * onDrop handlers read) as an alternative to the day popover's picker.
 * Header and footer hint stay put; the job list scrolls on its own once it
 * outgrows the rail's height (matched to the calendar via the parent's
 * items-stretch — see BookingsView). */
export function UnscheduledRail({
  jobs,
  onOpen,
  className,
}: {
  jobs: BookingJob[];
  onOpen: (job: BookingJob) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex shrink-0 items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-subtle">Unscheduled</h3>
        <span className="text-xs font-semibold text-muted-subtle">{jobs.length}</span>
      </div>
      {jobs.length === 0 ? (
        <p className="mt-2 px-1 text-xs text-muted-foreground">Nothing waiting on a date.</p>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {jobs.map((job) => (
            <li key={job.projectId}>
              <JobTooltip job={job}>
                <div
                  role="button"
                  tabIndex={0}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(JOB_DRAG_MIME, job.projectId);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onOpen(job)}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(job)}
                  className="cursor-grab rounded-lg border border-border bg-card p-2.5 text-left transition-shadow hover:shadow-card-hover active:cursor-grabbing"
                >
                  <p className="truncate text-[13px] font-bold text-foreground">{job.projectName}</p>
                  <p className="truncate text-xs text-muted-foreground">{job.clientName ?? "No client"}</p>
                  <p className="mt-0.5 text-xs font-semibold text-foreground">{formatCurrency(job.contractDollars)}</p>
                </div>
              </JobTooltip>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 shrink-0 px-1 text-[11px] text-muted-subtle">
        {pluralize(jobs.length, "job")} — drag onto a date, or use a day's "Schedule a job here."
      </p>
    </div>
  );
}
