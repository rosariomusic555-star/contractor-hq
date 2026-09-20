import { useState } from "react";
import { cn, formatCurrencyWhole, pluralize } from "@/lib/utils";
import type { BacklogJob } from "@/lib/backlog";
import { TONE_SOLID_CLASS, TONE_TINT_CLASS, projectStatusMeta } from "@/lib/statusMeta";
import { monthGridDays, jobsOnDate, JOB_DRAG_MIME, MAX_VISIBLE_DOTS } from "@/lib/backlogSchedule";
import { DayTooltip } from "./DayTooltip";

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
}: {
  year: number;
  month: number;
  monthLabel: string;
  committedDollars: number;
  jobCount: number;
  jobs: BacklogJob[];
  today: Date;
  onOpenMonth: () => void;
  onOpenDay: (date: Date) => void;
  onMoveJob?: (projectId: string, date: Date) => void;
  /** Off for the read-only Dashboard card — scheduling only happens on the
   * full Backlog Schedule page. */
  enableDragDrop?: boolean;
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
          const statuses = new Set(dayJobs.map((j) => j.status));
          const tintTone = statuses.size === 1 ? projectStatusMeta(dayJobs[0].status).tone : null;

          return (
            <DayTooltip key={day.key} jobs={dayJobs}>
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
                  "flex aspect-square min-h-[30px] flex-col items-center justify-center gap-[2px] rounded text-[10px] transition-colors",
                  !day.inMonth && "text-muted-subtle/40",
                  day.inMonth && "text-foreground",
                  tintTone && TONE_TINT_CLASS[tintTone],
                  dayJobs.length > 0 && !tintTone && "bg-muted",
                  dragOverKey === day.key ? "ring-2 ring-inset ring-primary" : "hover:bg-muted/70",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full leading-none",
                    day.isToday && "bg-primary font-extrabold text-primary-foreground",
                  )}
                >
                  {day.date.getDate()}
                </span>
                {dayJobs.length > 0 && (
                  <span className="flex h-1 items-center gap-[2px]">
                    {dayJobs.slice(0, MAX_VISIBLE_DOTS).map((j) => (
                      <span
                        key={j.projectId}
                        className={cn("h-1 w-1 rounded-full", TONE_SOLID_CLASS[projectStatusMeta(j.status).tone].split(" ")[0])}
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
