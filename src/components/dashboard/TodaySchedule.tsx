import { cn } from "@/lib/utils";
import { DEMO_TODAY_SCHEDULE } from "@/lib/demoData";
import { VISUAL_STATUS_META } from "@/lib/statusMeta";

/**
 * "Today · N jobs" — crew schedule. Presentation-only (no scheduling data in
 * the schema yet); driven entirely by demoData.
 */
export function TodaySchedule({ className }: { className?: string }) {
  return (
    <section className={cn("card-surface p-5", className)}>
      <header className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          Today <span className="text-muted-foreground">· {DEMO_TODAY_SCHEDULE.length} jobs</span>
        </h3>
        <span className="text-[13px] font-semibold text-primary">Schedule</span>
      </header>

      <ul className="mt-3 divide-y divide-hairline">
        {DEMO_TODAY_SCHEDULE.map((job) => {
          const meta = VISUAL_STATUS_META[job.status];
          return (
            <li key={job.title} className="flex gap-3 py-3 first:pt-1">
              <span className="w-12 shrink-0 text-[13px] font-bold tabular-nums text-foreground">
                {job.time}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{job.title}</p>
                <p className="truncate text-xs text-muted-foreground">{job.subtitle}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={meta.badge}>{meta.label}</span>
                <span className="text-[11px] font-semibold text-muted-subtle">{job.crew}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
