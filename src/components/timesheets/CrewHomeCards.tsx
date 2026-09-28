import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { clockIn, clockOut, getMyTimesheet, type AssignedProject } from "@/lib/api";
import { TIMESHEET_STATUS, elapsed, fmtClock, fmtHours, isoDay, periodTotals } from "@/lib/timesheets";
import { useProjectForecast } from "@/lib/forecast";
import { forecastWorkDays } from "@/lib/weatherRisk";
import { RISK_TEXT } from "@/components/weather/riskStyles";

/**
 * Crew home (dashboard refresh): clock in / out, this week's hours and
 * timesheet status, today's weather on a job. Only the crew's own data, via
 * the crew RPCs (my_timesheet / time_clock_*) — no rates, costs or prices.
 */
export function CrewClockCard({ todayJobs }: { todayJobs: AssignedProject[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = isoDay(new Date());
  const { data: ts } = useQuery({ queryKey: ["my-timesheet", today], queryFn: () => getMyTimesheet(today) });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!ts?.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ts?.running]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-timesheet"] });
  const onError = (e: Error) => toast({ title: e.message, variant: "destructive" });
  const inMut = useMutation({ mutationFn: (pid: string) => clockIn(pid, today), onSuccess: () => (refresh(), toast({ title: "Clocked in" })), onError });
  const outMut = useMutation({ mutationFn: () => clockOut(0, null), onSuccess: () => (refresh(), toast({ title: "Clocked out — add a break on My time if you took one" })), onError });
  if (!ts) return null;
  const totals = periodTotals(ts.entries);
  const st = TIMESHEET_STATUS[ts.status];
  const quickJob = todayJobs.length === 1 && ts.projects.some((p) => p.id === todayJobs[0].id) ? todayJobs[0] : null;
  return (
    <section className="card-surface overflow-hidden p-0">
      <div className={cn("flex items-center gap-3 px-4 py-3", ts.running && "bg-primary/10")}>
        <Clock className={cn("h-5 w-5 shrink-0", ts.running ? "text-primary" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          {ts.running ? (
            <>
              <p className="truncate text-sm font-bold text-foreground">Clocked in · {ts.running.project}</p>
              <p className="font-mono text-lg font-extrabold tabular-nums">
                {elapsed(ts.running.start_at, now)} <span className="text-xs font-normal text-muted-foreground">since {fmtClock(ts.running.start_at)}</span>
              </p>
            </>
          ) : (
            <p className="text-sm font-bold text-foreground">Not clocked in</p>
          )}
        </div>
        {ts.running ? (
          <Button className="h-11" disabled={outMut.isPending} onClick={() => outMut.mutate()}>
            Clock out
          </Button>
        ) : quickJob ? (
          <Button className="h-11" disabled={inMut.isPending} onClick={() => inMut.mutate(quickJob.id)}>
            Clock in
          </Button>
        ) : (
          <Button asChild variant="outline" className="h-11">
            <Link to="/employee/time">Clock in</Link>
          </Button>
        )}
      </div>
      <Link to="/employee/time" className="grid grid-cols-3 divide-x divide-hairline border-t border-hairline text-center hover:bg-muted/30">
        <div className="py-2">
          <p className="text-[11px] text-muted-foreground">This week</p>
          <p className="font-bold tabular-nums">{fmtHours(totals.total)} h</p>
        </div>
        <div className="py-2">
          <p className="text-[11px] text-muted-foreground">Overtime</p>
          <p className={cn("font-bold tabular-nums", totals.ot > 0 && "text-warning-strong")}>{fmtHours(totals.ot)} h</p>
        </div>
        <div className="flex flex-col items-center justify-center py-2">
          <p className="text-[11px] text-muted-foreground">Timesheet</p>
          <span className={cn("mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold", st.tone)}>{st.label}</span>
        </div>
      </Link>
    </section>
  );
}

/** Today's weather on one job (crew-visible forecast; empty until available). */
export function CrewJobWeather({ project }: { project: AssignedProject }) {
  const { data: batch } = useProjectForecast(project.id);
  const today = isoDay(new Date());
  const day = batch ? forecastWorkDays({ start: project.scheduled_start_date, end: project.scheduled_end_date }, batch.projects[project.id]?.forecast, batch.settings, today).find((d) => d.date === today) : null;
  if (!day) return null;
  return <p className={cn("mt-1 text-sm font-semibold", day.risk.level === "none" ? "opacity-90" : RISK_TEXT[day.risk.level])}>{day.risk.level === "none" ? `${day.weather.label} · ${day.weather.pop}% rain` : day.risk.summary}</p>;
}

/** Their assigned jobs starting in the next 14 days. */
export function CrewUpcoming({ projects }: { projects: AssignedProject[] }) {
  const today = isoDay(new Date());
  const until = isoDay(new Date(Date.now() + 14 * 86_400_000));
  const upcoming = projects
    .filter((p) => p.status !== "complete" && p.scheduled_start_date && p.scheduled_start_date > today && p.scheduled_start_date <= until)
    .sort((a, b) => a.scheduled_start_date!.localeCompare(b.scheduled_start_date!));
  if (!upcoming.length) return null;
  return (
    <section className="card-surface overflow-hidden p-0">
      <h3 className="flex min-h-[44px] items-center gap-2 border-b border-hairline px-4 text-sm font-bold text-foreground">
        <CalendarDays className="h-4 w-4 text-muted-foreground" /> Coming up
      </h3>
      <ul className="divide-y divide-hairline">
        {upcoming.map((p) => (
          <li key={p.id}>
            <Link to={`/employee/projects/${p.id}/work-order`} className="flex min-h-[48px] items-center gap-2 px-4 py-2 hover:bg-muted/40">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(`${p.scheduled_start_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
