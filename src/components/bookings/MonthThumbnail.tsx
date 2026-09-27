import { cn, formatCurrencyWhole, pluralize } from "@/lib/utils";
import type { BookingJob } from "@/lib/bookings";
import { bookingDisplayStatus, projectStatusSolidClass } from "@/lib/statusMeta";
import { jobsOnDate, daysInMonth, sameDay } from "@/lib/bookingsSchedule";
import { DayTooltip } from "./DayTooltip";
import { AlertTriangle } from "lucide-react";
import type { RiskLevel } from "@/lib/weatherRisk";
import { RISK_TEXT } from "@/components/weather/riskStyles";

/** Below md, 31 tiny per-day dots don't read at 4-tiles-per-row size — each
 * tile collapses to one fill swatch instead, in the month's display status
 * color (same legend color + priority as the day dots), at one of 3
 * strengths by the fraction of the month's days that have a job on them
 * (same underlying "booked days" signal the desktop dot grid shows, just
 * not per-day). Strength is opacity so the color itself always comes from
 * projectStatusSolidClass — never a second color map. */
const HEAT_LEVEL_OPACITY = [0.3, 0.6, 1];

function monthHeat(jobs: BookingJob[], bookedDayFraction: number): { className: string; opacity?: number } {
  const status = bookingDisplayStatus(jobs);
  if (bookedDayFraction === 0 || !status) return { className: "bg-muted-subtle/40" };
  const level = bookedDayFraction <= 0.25 ? 0 : bookedDayFraction <= 0.6 ? 1 : 2;
  return { className: projectStatusSolidClass(status).split(" ")[0], opacity: HEAT_LEVEL_OPACITY[level] };
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
  weatherRisk,
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
  /** Forecast on the schedule (0119) — worst risk on this month's job days
   * inside the forecast range; the day-by-day detail is in the panel. */
  weatherRisk?: RiskLevel;
}) {
  const days = daysInMonth(year, month);
  const bookedDayFraction = days.length > 0 ? days.filter((d) => jobsOnDate(jobs, d).length > 0).length / days.length : 0;
  const shortMonthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "short" });
  const heat = monthHeat(jobs, bookedDayFraction);

  return (
    <DayTooltip jobs={jobs}>
      <button
        type="button"
        onClick={onOpen}
        className="card-surface relative flex aspect-square min-h-[44px] w-full flex-col p-1.5 text-left transition-colors hover:bg-muted/60 md:p-2.5"
      >
        {weatherRisk && weatherRisk !== "none" && (
          <AlertTriangle className={cn("absolute right-1 top-1 h-3 w-3", RISK_TEXT[weatherRisk])} aria-label="Weather risk" />
        )}
        <span className="text-[11px] font-bold text-foreground md:hidden">{shortMonthLabel}</span>
        <span className="hidden text-xs font-bold text-foreground md:inline">{monthLabel}</span>

        {/* Mobile — single heat swatch, no per-day dots. */}
        <div className="mt-1 flex flex-1 items-center justify-center md:hidden">
          <span
            className={cn("h-full max-h-6 w-full max-w-6 rounded-md", heat.className)}
            style={heat.opacity != null ? { opacity: heat.opacity } : undefined}
          />
        </div>

        {/* Desktop — unchanged per-day dot grid. */}
        <div className="mt-1.5 hidden flex-1 grid-cols-7 content-start place-items-center gap-1 md:grid">
          {days.map((date) => {
            const dayStatus = bookingDisplayStatus(jobsOnDate(jobs, date));

            return (
              <span
                key={date.getDate()}
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  dayStatus ? projectStatusSolidClass(dayStatus).split(" ")[0] : "bg-muted-subtle/40",
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
