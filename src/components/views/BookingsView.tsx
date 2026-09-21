import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight as ChevronRightIcon, Calendar as CalendarIcon } from "lucide-react";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { Button } from "@/components/ui/button";
import { formatCurrency, pluralize } from "@/lib/utils";
import {
  listProjects,
  listQuotes,
  listChangeOrders,
  listOpportunities,
  type ChangeOrder,
  type Opportunity,
  type Quote,
} from "@/lib/api";
import { seasonalBookings, type BookingJob } from "@/lib/bookings";
import { dateKey, jobsOnDate } from "@/lib/bookingsSchedule";
import { useRescheduleJob } from "@/hooks/use-reschedule-job";
import { MiniMonth } from "@/components/bookings/MiniMonth";
import { UnscheduledRail } from "@/components/bookings/UnscheduledRail";
import { BookingsLegend } from "@/components/bookings/BookingsLegend";
import { DaySidePanel } from "@/components/bookings/DaySidePanel";

function groupById<T extends { project_id: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.project_id) continue;
    const list = map.get(row.project_id);
    if (list) list.push(row);
    else map.set(row.project_id, [row]);
  }
  return map;
}

const parseMonthParam = (s: string | null): { year: number; key: string } | null => {
  if (!s || !/^\d{4}-\d{2}$/.test(s)) return null;
  return { year: Number(s.slice(0, 4)), key: s };
};

type PanelState =
  | { mode: "day"; date: Date }
  | { mode: "month"; monthIndex: number }
  | { mode: "job"; job: BookingJob }
  | null;

/**
 * Full Bookings page (/bookings) — a year-at-a-glance grid of 12 mini
 * months. Every dollar/count/job comes from the exact same seasonalBookings()
 * the Dashboard card calls (single source of truth); this only adds
 * calendar layout (bookingsSchedule.ts) and interaction (drag + the day/
 * month side panel via useRescheduleJob) on top of it. Previously a single
 * full-screen month with bars/lanes/resize handles; simplified to a denser
 * year view with status dots instead of bars (no room for bars at this
 * scale) — date edits now happen in the side panel instead of by resizing.
 */
export function BookingsView() {
  const [searchParams] = useSearchParams();
  const focusMonth = parseMonthParam(searchParams.get("month"));

  const [year, setYear] = useState(() => focusMonth?.year ?? new Date().getFullYear());
  const [panel, setPanel] = useState<PanelState>(null);
  const { reschedule } = useRescheduleJob();
  const today = new Date();

  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: quotes = [] } = useQuery({ queryKey: ["quotes"], queryFn: () => listQuotes() });
  const { data: changeOrders = [] } = useQuery({ queryKey: ["change-orders"], queryFn: () => listChangeOrders() });
  const { data: opportunities = [] } = useQuery({ queryKey: ["opportunities"], queryFn: () => listOpportunities() });

  const quotesByProject = groupById<Quote>(quotes);
  const changeOrdersByProject = groupById<ChangeOrder>(changeOrders);
  const opportunitiesByProjectId = new Map<string, Opportunity>();
  for (const o of opportunities) {
    if (o.project_id) opportunitiesByProjectId.set(o.project_id, o);
  }

  // Dec of the previous year through Jan of the next — one month of padding
  // on each side so a job that starts in late December still tints into
  // January's mini month's leading days, and vice versa.
  const { months: fetchedMonths, unscheduledJobs } = seasonalBookings(
    projects,
    quotesByProject,
    changeOrdersByProject,
    opportunitiesByProjectId,
    14,
    new Date(year - 1, 11, 1),
  );
  const displayMonths = fetchedMonths.slice(1, 13);
  const nearbyJobs = fetchedMonths.flatMap((m) => m.jobs);

  const jobsById = new Map<string, BookingJob>();
  for (const j of [...nearbyJobs, ...unscheduledJobs]) jobsById.set(j.projectId, j);

  const yearDollars = displayMonths.reduce((s, m) => s + m.committedDollars, 0);
  const yearJobs = displayMonths.reduce((s, m) => s + m.jobCount, 0);

  const goThisYear = () => setYear(new Date().getFullYear());
  const goPrev = () => setYear((y) => y - 1);
  const goNext = () => setYear((y) => y + 1);

  useEffect(() => {
    if (!focusMonth || isLoading) return;
    document.getElementById(`year-month-${focusMonth.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key.toLowerCase() === "t") goThisYear();
      else if (e.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleScheduleJob = (job: BookingJob, date: Date) => {
    reschedule(
      job.projectId,
      job.projectName,
      { scheduled_start_date: dateKey(date), scheduled_end_date: null },
      { scheduled_start_date: job.startDate, scheduled_end_date: job.endDate },
    );
  };

  const handleMoveJob = (projectId: string, date: Date) => {
    const job = jobsById.get(projectId);
    if (!job) return;
    const hadEnd = job.startDate && job.endDate && job.endDate !== job.startDate;
    let newEnd: string | null = null;
    if (hadEnd) {
      const durationDays = Math.round(
        (new Date(`${job.endDate}T00:00:00`).getTime() - new Date(`${job.startDate}T00:00:00`).getTime()) / 86_400_000,
      );
      newEnd = dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + durationDays));
    }
    reschedule(
      job.projectId,
      job.projectName,
      { scheduled_start_date: dateKey(date), scheduled_end_date: newEnd },
      { scheduled_start_date: job.startDate, scheduled_end_date: job.endDate },
    );
  };

  const handleDatesChange = (job: BookingJob, start: string | null, end: string | null) => {
    const newStart = start;
    let newEnd = end;
    if (newStart && newEnd && newEnd < newStart) newEnd = newStart;
    reschedule(
      job.projectId,
      job.projectName,
      { scheduled_start_date: newStart, scheduled_end_date: newEnd },
      { scheduled_start_date: job.startDate, scheduled_end_date: job.endDate },
    );
  };

  const handleUnschedule = (job: BookingJob) => {
    reschedule(
      job.projectId,
      job.projectName,
      { scheduled_start_date: null, scheduled_end_date: null },
      { scheduled_start_date: job.startDate, scheduled_end_date: job.endDate },
    );
  };

  const panelTitle =
    panel?.mode === "day"
      ? panel.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : panel?.mode === "month"
        ? (displayMonths[panel.monthIndex]?.label ?? "")
        : panel?.mode === "job"
          ? panel.job.projectName
          : "";
  const panelJobs =
    panel?.mode === "day"
      ? jobsOnDate(nearbyJobs, panel.date)
      : panel?.mode === "month"
        ? (displayMonths[panel.monthIndex]?.jobs ?? [])
        : panel?.mode === "job"
          ? [panel.job]
          : [];

  return (
    <div className="mx-auto w-full max-w-[1500px] animate-fade-in space-y-4">
      <MobilePageHeader title="Bookings" subtitle={String(year)} back={{ to: "/dashboard", label: "Dashboard" }} />

      <div className="hidden md:block">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">{year}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev} aria-label="Previous year">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-bold" onClick={goThisYear}>
              <CalendarIcon className="h-3.5 w-3.5" />
              This year
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext} aria-label="Next year">
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-right">
            <p className="text-xl font-extrabold tracking-tight tabular-nums text-foreground">
              {formatCurrency(yearDollars)}
            </p>
            <p className="text-xs font-semibold text-muted-foreground">
              {pluralize(yearJobs, "job")} booked in {year}
            </p>
          </div>
        </div>
      </div>

      <BookingsLegend />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col items-stretch gap-5 lg:flex-row">
          <UnscheduledRail jobs={unscheduledJobs} onOpen={(job) => setPanel({ mode: "job", job })} className="lg:w-[280px] lg:shrink-0" />
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayMonths.map((m, i) => {
              const monthDate = new Date(year, i, 1);
              return (
                <div key={m.key} id={`year-month-${m.key}`} className="scroll-mt-4">
                  <MiniMonth
                    year={year}
                    month={i}
                    monthLabel={monthDate.toLocaleDateString("en-US", { month: "long" })}
                    committedDollars={m.committedDollars}
                    jobCount={m.jobCount}
                    jobs={m.jobs}
                    today={today}
                    onOpenMonth={() => setPanel({ mode: "month", monthIndex: i })}
                    onOpenDay={(date) => setPanel({ mode: "day", date })}
                    onMoveJob={handleMoveJob}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <DaySidePanel
        open={!!panel}
        onOpenChange={(open) => !open && setPanel(null)}
        title={panelTitle}
        jobs={panelJobs}
        unscheduledJobs={panel?.mode === "day" ? unscheduledJobs : undefined}
        onScheduleJob={panel?.mode === "day" ? (job) => handleScheduleJob(job, panel.date) : undefined}
        onDatesChange={handleDatesChange}
        onUnschedule={handleUnschedule}
      />
    </div>
  );
}
