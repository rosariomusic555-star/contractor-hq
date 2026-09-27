import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ClipboardList, CloudRain, MapPin, Truck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APPOINTMENT_TYPE_LABEL, listAppointments, listCrews, listEmployees, listMaterialOrders, listProjects, listRunningTimers, type Project } from "@/lib/api";
import { appointmentWeather, forecastWorkDays, isoDate } from "@/lib/weatherRisk";
import { useAppointmentForecasts, useScheduleForecasts } from "@/lib/forecast";
import { upcomingDeliveries } from "@/lib/materialOrders";
import { openSummary } from "@/lib/precon";
import { useRainDelay } from "@/components/schedule/rainDelayContext";
import { usePreconBundle } from "@/components/precon/usePrecon";
import { RISK_TEXT } from "@/components/weather/riskStyles";
import { Card, CardSkeleton } from "./CardShell";
import { TONE_PILL } from "./tones";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayName = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const isBooked = (p: Project) => p.status === "scheduled" || p.status === "in_progress";

/**
 * Today — the day's command center: each job on today's schedule (by crew)
 * with its address, today's weather + risk (Rain delay on a flagged day),
 * readiness when it starts today, who's clocked in, today's deliveries;
 * then today's appointments with their forecast. Everything from the
 * shared caches (projects, forecasts, material orders, running timers).
 */
export function TodayCard() {
  const today = isoDate(new Date());
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: crews = [] } = useQuery({ queryKey: ["crews"], queryFn: listCrews });
  const { data: orders = [] } = useQuery({ queryKey: ["material-orders"], queryFn: () => listMaterialOrders() });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments"], queryFn: listAppointments });
  const { data: timers = [] } = useQuery({ queryKey: ["running-timers"], queryFn: listRunningTimers, refetchInterval: 60_000 });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: listEmployees });
  const { batch } = useScheduleForecasts();
  const apptBatch = useAppointmentForecasts();

  const jobs = useMemo(
    () =>
      projects
        .filter((p) => isBooked(p) && p.scheduled_start_date && p.scheduled_start_date <= today && (p.scheduled_end_date ?? p.scheduled_start_date) >= today)
        .sort((a, b) => ((a as { crew_id?: string }).crew_id ?? "").localeCompare((b as { crew_id?: string }).crew_id ?? "")),
    [projects, today],
  );
  const deliveries = upcomingDeliveries(orders, new Map(projects.map((p) => [p.id, p])), 0);
  const appts = appointments
    .filter((a) => a.status === "scheduled" && isoDate(new Date(a.date_time)) === today)
    .sort((a, b) => a.date_time.localeCompare(b.date_time));
  const next = projects
    .filter((p) => isBooked(p) && p.scheduled_start_date && p.scheduled_start_date > today)
    .sort((a, b) => a.scheduled_start_date!.localeCompare(b.scheduled_start_date!))[0];

  if (isLoading)
    return (
      <Card title="Today">
        <CardSkeleton />
      </Card>
    );

  return (
    <Card title={`Today · ${dayName(today)}`} count={jobs.length ? `${jobs.length} job${jobs.length === 1 ? "" : "s"}` : null} viewAll={{ to: "/bookings", label: "Schedule" }}>
      {jobs.length === 0 && appts.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Nothing scheduled today.
          {next && (
            <>
              {" "}
              Next work day: <span className="font-semibold text-foreground">{dayName(next.scheduled_start_date!)}</span> ·{" "}
              <Link to={`/projects/${next.id}`} className="font-semibold text-primary">
                {next.name}
              </Link>
            </>
          )}
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {jobs.map((p) => (
            <TodayJob
              key={p.id}
              project={p}
              today={today}
              crewName={crews.find((c) => c.id === (p as { crew_id?: string }).crew_id)?.name ?? null}
              forecastDay={batch ? forecastWorkDays({ start: p.scheduled_start_date, end: p.scheduled_end_date }, batch.projects[p.id]?.forecast, batch.settings, today).find((d) => d.date === today) ?? null : null}
              clockedIn={timers.filter((t) => t.project_id === p.id).map((t) => ({ name: employees.find((e) => e.id === t.employee_id)?.name ?? t.worker_name ?? "Crew", since: t.start_at }))}
              deliveries={deliveries.filter((d) => d.projectId === p.id)}
            />
          ))}
          {appts.map((a) => {
            const f = apptBatch?.appointments[a.id]?.forecast;
            const w = apptBatch && f ? appointmentWeather(a, f, apptBatch.settings) : null;
            return (
              <li key={a.id}>
                <Link to={a.opportunity_id ? `/pipeline/${a.opportunity_id}` : "/appointments"} className="flex min-h-[44px] items-center gap-3 px-4 py-2 hover:bg-muted/40">
                  <CalendarClock className="h-4 w-4 shrink-0 text-info" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{APPOINTMENT_TYPE_LABEL[a.type]}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.all_day ? "All day" : time(a.date_time)}
                      {a.address ? ` · ${a.address}` : ""}
                    </span>
                  </span>
                  {w && <span className={cn("shrink-0 text-xs font-semibold", RISK_TEXT[w.risk.level])}>{w.risk.level === "none" ? `${w.weather.label}, ${w.weather.pop}%` : w.risk.summary}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TodayJob({
  project,
  today,
  crewName,
  forecastDay,
  clockedIn,
  deliveries,
}: {
  project: Project;
  today: string;
  crewName: string | null;
  forecastDay: ReturnType<typeof forecastWorkDays>[number] | null;
  clockedIn: { name: string; since: string }[];
  deliveries: ReturnType<typeof upcomingDeliveries>;
}) {
  const openDelay = useRainDelay();
  const startsToday = project.scheduled_start_date === today;
  const { data: bundle } = usePreconBundle(project.id, startsToday);
  const r = bundle?.readiness;
  const readiness = !startsToday || !r ? null : r.status === "ready" ? { tone: "green" as const, label: "Ready" } : { tone: r.status === "blocked" ? ("red" as const) : ("amber" as const), label: `${r.openRequired.length} open` };
  const risky = forecastDay && forecastDay.risk.level !== "none";
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-2">
        <Link to={`/projects/${project.id}`} className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">
            {crewName && <span className="font-semibold text-muted-foreground">{crewName} · </span>}
            {project.name}
            {startsToday && <span className="ml-1.5 rounded bg-info/10 px-1 text-[10px] font-bold text-info">STARTS</span>}
          </span>
          {project.address && (
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" /> {project.address}
            </span>
          )}
        </Link>
        {forecastDay && (
          <span className={cn("shrink-0 text-right text-xs font-semibold", RISK_TEXT[forecastDay.risk.level])}>
            {risky ? forecastDay.risk.summary : `${forecastDay.weather.label} · ${forecastDay.weather.pop}%`}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        {readiness && (
          <span className={cn("rounded-full px-2 py-0.5 font-bold", TONE_PILL[readiness.tone])} title={r ? openSummary(r.openRequired) : undefined}>
            {readiness.label}
          </span>
        )}
        {clockedIn.length > 0 ? (
          <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 font-semibold text-success">
            <UserRound className="h-3 w-3" /> {clockedIn.map((c) => c.name.split(" ")[0]).join(", ")} clocked in
          </span>
        ) : null}
        {deliveries.map((d) => (
          <span key={d.itemId} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            <Truck className="h-3 w-3" /> {d.description}
          </span>
        ))}
        <Link to={`/projects/${project.id}/work-order`} className="flex min-h-[32px] items-center gap-1 rounded-full px-2 font-semibold text-primary">
          <ClipboardList className="h-3 w-3" /> Work order
        </Link>
        {risky && openDelay && (
          <Button size="sm" variant="outline" className="ml-auto h-8 px-2.5 text-xs font-bold" onClick={() => openDelay({ projectId: project.id, date: today })}>
            <CloudRain className="mr-1 h-3.5 w-3.5" /> Rain delay
          </Button>
        )}
      </div>
    </li>
  );
}
