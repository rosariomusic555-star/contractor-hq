import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { BleedBanner } from "@/components/common/BleedBanner";
import { greetingLabel } from "@/hooks/use-greeting";
import { useAuth } from "@/lib/auth";
import type { AssignedProject } from "@/lib/api";
import { elapsed, fmtClock } from "@/lib/timesheets";
import { cn } from "@/lib/utils";
import { useCrewClock } from "./useCrewClock";

const RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const BUTTON =
  "inline-flex h-11 items-center justify-center rounded-[0.625rem] bg-banner-control px-5 text-sm font-bold text-banner-control-foreground transition-colors hover:bg-white/90 disabled:opacity-60 " +
  RING;

/**
 * Crew home banner — the same full-bleed slate banner as the owner's
 * Dashboard, crew-only content: greeting, today's job(s) with address, and
 * Clock in / out. No money or business numbers.
 */
export function CrewBanner({ todayJobs }: { todayJobs: AssignedProject[] }) {
  // Crews: their own name (employees can't read the business profile).
  const greeting = greetingLabel();
  const { employee } = useAuth();
  const firstName = employee?.name?.trim().split(/\s+/)[0] ?? "";
  const { ts, now, quickJob, inMut, outMut } = useCrewClock(todayJobs);
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <BleedBanner label="Today">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold tracking-tight md:text-[28px] md:leading-9">{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
          <p className="mt-0.5 text-[13px] font-semibold md:text-sm">
            {dateLabel} · {todayJobs.length === 0 ? "No jobs scheduled today" : todayJobs.length === 1 ? "1 job today" : `${todayJobs.length} jobs today`}
          </p>
          {todayJobs.length > 0 && (
            <ul className="mt-2 space-y-1">
              {todayJobs.map((p) => (
                <li key={p.id}>
                  <Link to={`/employee/projects/${p.id}/work-order`} className={cn("block rounded-md text-sm font-bold hover:underline", RING)}>
                    {p.name}
                  </Link>
                  {p.address && (
                    <p className="flex items-center gap-1 text-[13px] font-semibold">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{p.address}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {ts && (
          <div className="flex flex-col gap-1 sm:items-end">
            {ts.running && (
              <p className="text-[13px] font-semibold tabular-nums">
                Clocked in · {ts.running.project} · {elapsed(ts.running.start_at, now)} since {fmtClock(ts.running.start_at)}
              </p>
            )}
            {ts.running ? (
              <button type="button" className={BUTTON} disabled={outMut.isPending} onClick={() => outMut.mutate()}>
                Clock out
              </button>
            ) : quickJob ? (
              <button type="button" className={BUTTON} disabled={inMut.isPending} onClick={() => inMut.mutate(quickJob.id)}>
                Clock in
              </button>
            ) : (
              <Link to="/employee/time" className={BUTTON}>
                Clock in
              </Link>
            )}
          </div>
        )}
      </div>
    </BleedBanner>
  );
}
