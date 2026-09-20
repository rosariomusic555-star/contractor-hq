import { cn, formatCurrencyWhole, pluralize } from "@/lib/utils";
import type { BacklogJob } from "@/lib/backlog";
import { TONE_SOLID_CLASS, projectStatusMeta } from "@/lib/statusMeta";
import { jobsOnDate, daysInMonth, sameDay } from "@/lib/backlogSchedule";
import { DayTooltip } from "./DayTooltip";

/**
 * Square glanceable heat-map thumbnail for one month — the Dashboard
 * Seasonal backlog card's mini months. Unlike MiniMonth (the /backlog year
 * page's calendar, which keeps day numbers/weekday header/per-day drag +
 * click), this drops all of that for plain status-colored dots so a busy
 * vs. empty month reads at a glance; the whole square is one click/hover
 * target instead of each day being its own.
 */
export function MonthThumbnail({
  year,
  month,
  monthLabel,
  committedDollars,
  jobCount,
  jobs,
  today,
  onOpen,
}: {
  year: number;
  month: number;
  monthLabel: string;
  committedDollars: number;
  jobCount: number;
  jobs: BacklogJob[];
  /** Omit to suppress the today-ring — the Dashboard card only passes this
   * when the calendar year being viewed is the current one. */
  today?: Date;
  onOpen: () => void;
}) {
  const days = daysInMonth(year, month);

  return (
    <DayTooltip jobs={jobs}>
      <button
        type="button"
        onClick={onOpen}
        className="card-surface flex aspect-square w-full flex-col p-2.5 text-left transition-colors hover:bg-muted/60"
      >
        <span className="text-xs font-bold text-foreground">{monthLabel}</span>

        <div className="mt-1.5 grid flex-1 grid-cols-7 content-start place-items-center gap-1">
          {days.map((date) => {
            const dayJobs = jobsOnDate(jobs, date);
            const statuses = new Set(dayJobs.map((j) => j.status));
            const tone = statuses.size === 1 ? projectStatusMeta(dayJobs[0].status).tone : null;

            return (
              <span
                key={date.getDate()}
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  dayJobs.length === 0 && "bg-muted-subtle/40",
                  dayJobs.length > 0 && tone && TONE_SOLID_CLASS[tone].split(" ")[0],
                  dayJobs.length > 0 && !tone && "bg-foreground/50",
                  today && sameDay(date, today) && "ring-2 ring-primary/70 ring-offset-1 ring-offset-background",
                )}
              />
            );
          })}
        </div>

        <p
          className={cn(
            "mt-1.5 min-w-0 truncate text-[10px] font-semibold text-muted-foreground",
            jobCount === 0 && "invisible",
          )}
        >
          {formatCurrencyWhole(committedDollars)} · {pluralize(jobCount, "job")}
        </p>
      </button>
    </DayTooltip>
  );
}
