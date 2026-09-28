import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/utils";
import type { BookingJob } from "@/lib/bookings";
import { JobDetailCard } from "./JobDetailCard";

/**
 * The Year view's one side panel, covering three cases per spec:
 *  - a day with jobs → every job that day, full detail (JobDetailCard)
 *  - an empty day → "Schedule a job here" against the Unscheduled list
 *  - a whole month (clicked from a mini month's header) → every job
 *    booked that month, same full detail
 * Esc closes it — native Radix Sheet behavior, no extra wiring.
 */
export function DaySidePanel({
  open,
  onOpenChange,
  title,
  jobs,
  unscheduledJobs,
  onScheduleJob,
  onDatesChange,
  onUnschedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  jobs: BookingJob[];
  /** Present (even if empty) only in "empty day" mode — its presence is
   * what tells this panel to show the scheduling picker instead of "no
   * jobs" when `jobs` is empty. */
  unscheduledJobs?: BookingJob[];
  onScheduleJob?: (job: BookingJob) => void;
  onDatesChange: (job: BookingJob, patch: { start?: string | null; end?: string | null }) => void;
  onUnschedule: (job: BookingJob) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-3">
          {jobs.length > 0 ? (
            jobs.map((job) => (
              <JobDetailCard key={job.projectId} job={job} onDatesChange={onDatesChange} onUnschedule={onUnschedule} />
            ))
          ) : unscheduledJobs && onScheduleJob ? (
            <>
              <p className="text-sm font-bold text-foreground">Schedule a job here</p>
              {unscheduledJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unscheduled jobs.</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {unscheduledJobs.map((job) => (
                    <li key={job.projectId}>
                      <button
                        type="button"
                        onClick={() => onScheduleJob(job)}
                        className="flex w-full items-center justify-between gap-2 py-2.5 text-left transition-colors hover:bg-muted/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-foreground">{job.projectName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {job.clientName ?? "No client"}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
                          {formatCurrency(job.contractDollars)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No jobs booked.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
