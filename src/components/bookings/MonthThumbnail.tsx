import { cn, formatCurrencyWhole, pluralize } from "@/lib/utils";
import type { BookingJob } from "@/lib/bookings";
import { TONE_SOLID_CLASS, type Tone, projectStatusMeta } from "@/lib/statusMeta";
import { jobsOnDate, daysInMonth, sameDay } from "@/lib/bookingsSchedule";
import { DayTooltip } from "./DayTooltip";

/** Below md, 31 tiny per-day dots don't read at 4-tiles-per-row size — each
 * tile collapses to one fill swatch instead, at one of 4 levels by the
 * fraction of the month's days that have a job on them (same underlying
 * "booked days" signal the desktop dot grid shows, just not per-day). */
const HEAT_LEVEL_CLASS: Record<Tone | "mixed", [string, string, string]> = {
  green: ["bg-success/30", "bg-success/60", "bg-success"],
  greenSolid: ["bg-primary/30", "bg-primary/60", "bg-primary"],
  amber: ["bg-warning-strong/30", "bg-warning-strong/60", "bg-warning-strong"],
  red: ["bg-destructive/30", "bg-destructive/60", "bg-destructive"],
  blue: ["bg-info/30", "bg-info/60", "bg-info"],
  grey: ["bg-muted-foreground/30", "bg-muted-foreground/60", "bg-muted-foreground"],
  mixed: ["bg-foreground/25", "bg-foreground/45", "bg-foreground/70"],
};

function monthHeatClass(jobs: BookingJob[], bookedDayFraction: number): string {
  if (bookedDayFraction === 0) return "bg-muted-subtle/40";
  const level = bookedDayFraction <= 0.25 ? 0 : bookedDayFraction <= 0.6 ? 1 : 2;
  const statuses = new Set(jobs.map((j) => j.status));
  const key: Tone | "mixed" = statuses.size === 1 ? projectStatusMeta(jobs[0].status).tone : "mixed";
  return HEAT_LEVEL_CLASS[key][level];
}

/**
 * Square glanceable heat-map thumbnail for one month — the Dashboard
 * Bookings card's mini months. Unlike MiniMonth (the /bookings year
 * page's calendar, which keeps day numbers/weekday header/per-day drag +
 * click), this drops all of that for plain status-colored dots so a busy
 * vs. empty month reads at a glance; the whole square is one click/hover
 * target instead of each day being its own.
 *
 * Below md, this shrinks further to a tight 4-tiles-per-row mobile layout
 * (see BookingsCard's grid) — 3-letter month label, no dollar/job-count
 * line (no room), and the day-dot grid swaps for a single heat swatch
 * (monthHeatClass) since 31 dots aren't legible at that size.
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
  jobs: BookingJob[];
  /** Omit to suppress the today-ring — the Dashboard card only passes this
   * when the calendar year being viewed is the current one. */
  today?: Date;
  onOpen: () => void;
}) {
  const days = daysInMonth(year, month);
  const bookedDayFraction = days.length > 0 ? days.filter((d) => jobsOnDate(jobs, d).length > 0).length / days.length : 0;
  const shortMonthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "short" });

  return (
    <DayTooltip jobs={jobs}>
      <button
        type="button"
        onClick={onOpen}
        className="card-surface flex aspect-square min-h-[44px] w-full flex-col p-1.5 text-left transition-colors hover:bg-muted/60 md:p-2.5"
      >
        <span className="text-[11px] font-bold text-foreground md:hidden">{shortMonthLabel}</span>
        <span className="hidden text-xs font-bold text-foreground md:inline">{monthLabel}</span>

        {/* Mobile — single heat swatch, no per-day dots. */}
        <div className="mt-1 flex flex-1 items-center justify-center md:hidden">
          <span className={cn("h-full max-h-6 w-full max-w-6 rounded-md", monthHeatClass(jobs, bookedDayFraction))} />
        </div>

        {/* Desktop — unchanged per-day dot grid. */}
        <div className="mt-1.5 hidden flex-1 grid-cols-7 content-start place-items-center gap-1 md:grid">
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
            "mt-1.5 hidden min-w-0 truncate text-[10px] font-semibold text-muted-foreground md:block",
            jobCount === 0 && "invisible",
          )}
        >
          {formatCurrencyWhole(committedDollars)} · {pluralize(jobCount, "job")}
        </p>
      </button>
    </DayTooltip>
  );
}
