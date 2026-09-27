import { useState } from "react";
import { cn, formatCurrencyWhole, pluralize } from "@/lib/utils";
import type { BookingJob } from "@/lib/bookings";
import { TONE_TINT_CLASS, bookingDisplayStatus, projectStatusMeta, projectStatusSolidClass } from "@/lib/statusMeta";
import { monthGridDays, jobsOnDate, dateKey, JOB_DRAG_MIME, MAX_VISIBLE_DOTS } from "@/lib/bookingsSchedule";
import { DayTooltip } from "./DayTooltip";
import { AlertTriangle } from "lucide-react";
import type { CalendarDayWeather } from "@/lib/forecast";
import { WeatherIcon } from "@/components/weather/WeatherIcon";
import { RISK_TEXT } from "@/components/weather/riskStyles";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * One compact month in the year-at-a-glance grid — no bars (cells are too
 * small), just a tinted background + up to MAX_VISIBLE_DOTS status dots
 * per day. A job's date range tints every day it covers so a multi-day run
 * still reads as one continuous block even without a bar drawn across it.
 */
export function MiniMonth({
  year,
  month,
  monthLabel,
  committedDollars,
  jobCount,
  jobs,
  today,
  onOpenMonth,
  onOpenDay,
  onMoveJob,
  enableDragDrop = true,
  weather,
  readiness,
}: {
  year: number;
  month: number;
  monthLabel: string;
  committedDollars: number;
  jobCount: number;
  jobs: BookingJob[];
  today: Date;
  onOpenMonth: () => void;
  onOpenDay: (date: Date) => void;
  onMoveJob?: (projectId: string, date: Date) => void;
  /** Off for the read-only Dashboard card — scheduling only happens on the
   * full Bookings page. */
  enableDragDrop?: boolean;
  /** Forecast on the schedule (0119) — job days inside the forecast range:
   * a tiny weather icon, or an amber/red flag on a risky day. */
  weather?: Map<string, CalendarDayWeather>;
  /** Pre-construction (0124) — on a job's start day: green ready / amber
   * items open / red blocked. */
  readiness?: Map<string, { status: "ready" | "open" | "blocked"; lines: string[] }>;
}) {
  const days = monthGridDays(year, month, today);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  return (
    <section className="card-surface p-3">
      <button type="button" onClick={onOpenMonth} className="w-full rounded-lg text-left hover:bg-muted/50">
        <span className="text-sm font-bold text-foreground">{monthLabel}</span>
        {/* Always rendered (invisible when empty) so every mini month's
            header is the same height — no jump between a 1-line and a
            2-line card in the grid. */}
        <p className={cn("text-[11px] font-semibold text-muted-foreground", jobCount === 0 && "invisible")}>
          {formatCurrencyWhole(committedDollars)} · {pluralize(jobCount, "job")}
        </p>
      </button>

      <div className="mt-2 grid grid-cols-7 text-center text-[9px] font-bold uppercase tracking-wide text-muted-subtle">
        {WEEKDAY_INITIALS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="mt-0.5 grid grid-cols-7 gap-[2px]">
        {days.map((day) => {
          // Out-of-month leading/trailing days never show that neighbor
          // month's jobs — otherwise the same job would render twice
          // (once in its own month, once bleeding into the adjacent one).
          const dayJobs = day.inMonth ? jobsOnDate(jobs, day.date) : [];
          const singleJob = dayJobs.length === 1 ? dayJobs[0] : null;
          // One status per day (In progress > Scheduled > Complete) for the
          // day circle + cell tint; the tooltip lists every job.
          const dayStatus = bookingDisplayStatus(dayJobs);
          const tintTone = dayStatus ? projectStatusMeta(dayStatus).tone : null;
          const wx = dayJobs.length > 0 ? weather?.get(dateKey(day.date)) : undefined;
          const ready = day.inMonth ? readiness?.get(dateKey(day.date)) : undefined;

          return (
            <DayTooltip key={day.key} jobs={dayJobs} weatherLines={wx?.lines} readinessLines={ready?.lines}>
              <button
                type="button"
                draggable={enableDragDrop && !!singleJob}
                onDragStart={
                  enableDragDrop && singleJob
                    ? (e) => {
                        e.dataTransfer.setData(JOB_DRAG_MIME, singleJob.projectId);
                        e.dataTransfer.effectAllowed = "move";
                      }
                    : undefined
                }
                onDragOver={enableDragDrop ? (e) => e.preventDefault() : undefined}
                onDragEnter={enableDragDrop ? () => setDragOverKey(day.key) : undefined}
                onDragLeave={enableDragDrop ? () => setDragOverKey((k) => (k === day.key ? null : k)) : undefined}
                onDrop={
                  enableDragDrop
                    ? (e) => {
                        e.preventDefault();
                        setDragOverKey(null);
                        const projectId = e.dataTransfer.getData(JOB_DRAG_MIME);
                        if (projectId) onMoveJob?.(projectId, day.date);
                      }
                    : undefined
                }
                onClick={() => onOpenDay(day.date)}
                className={cn(
                  "relative flex aspect-square min-h-[30px] flex-col items-center justify-center gap-[2px] rounded text-[10px] transition-colors",
                  !day.inMonth && "text-muted-subtle/40",
                  day.inMonth && "text-foreground",
                  tintTone && TONE_TINT_CLASS[tintTone],
                  dragOverKey === day.key ? "ring-2 ring-inset ring-primary" : "hover:bg-muted/70",
                )}
              >
                {ready && (
                  <span
                    className={cn(
                      "absolute left-0.5 top-0.5 h-1.5 w-1.5 rounded-full",
                      ready.status === "ready" ? "bg-success" : ready.status === "open" ? "bg-warning-strong" : "bg-destructive",
                    )}
                    aria-label={`Pre-construction: ${ready.status}`}
                  />
                )}
                {wx &&
                  (wx.level === "none" ? (
                    <WeatherIcon condition={wx.condition} className="absolute right-0 top-0 h-2.5 w-2.5 text-muted-foreground" />
                  ) : (
                    <AlertTriangle
                      className={cn("absolute right-0 top-0 h-2.5 w-2.5", RISK_TEXT[wx.level])}
                      aria-label="Weather risk"
                    />
                  ))}
                {/* Job day → filled circle in the legend's status color.
                    Today is a ring (drawn over any fill) rather than its
                    old green fill, which would read as a Complete day. */}
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full leading-none",
                    dayStatus && cn(projectStatusSolidClass(dayStatus), "font-bold"),
                    day.isToday && "font-extrabold ring-2 ring-primary ring-offset-1 ring-offset-background",
                  )}
                >
                  {day.date.getDate()}
                </span>
                {dayJobs.length > 0 && (
                  <span className="flex h-1 items-center gap-[2px]">
                    {dayJobs.slice(0, MAX_VISIBLE_DOTS).map((j) => (
                      <span
                        key={j.projectId}
                        className={cn("h-1 w-1 rounded-full", projectStatusSolidClass(j.status).split(" ")[0])}
                      />
                    ))}
                    {dayJobs.length > MAX_VISIBLE_DOTS && (
                      <span className="text-[8px] font-bold leading-none text-muted-foreground">+</span>
                    )}
                  </span>
                )}
              </button>
            </DayTooltip>
          );
        })}
      </div>
    </section>
  );
}
