import type { ChangeOrder, Opportunity, Project, ProjectStatus, Quote } from "./api";
import { projectContractValue } from "./api";
import { jobSizeLabel } from "./jobSize";

/** A job counts as "committed" booked work once it's past Estimating
 * (migration 0073) — scheduled/in_progress/complete all mean a signed,
 * won contract, regardless of billing progress (see financials.ts's
 * separate billing badge for that). */
const COMMITTED_STATUSES: ProjectStatus[] = ["scheduled", "in_progress", "complete"];

/** One committed job, as it appears inside a BookingMonth or in
 * unscheduledJobs. Single source of truth for both the Dashboard card
 * (which only reads the month aggregates) and the full Bookings page
 * (/bookings, which renders these rows) — see seasonalBookings(). */
export interface BookingJob {
  projectId: string;
  projectName: string;
  clientName: string | null;
  status: ProjectStatus;
  /** Real contract value — projectContractValue() (headline quote +
   * approved change orders), same figure the month total sums. */
  contractDollars: number;
  /** "1 ea Paver Patio" — see jobSizeLabel(). Null falls back to just the
   * project name, same as the Ongoing Jobs card. */
  scopeLabel: string | null;
  /** Day-precision scheduling (0058) — the Bookings calendar's bar
   * span. startDate is always set for anything other than unscheduledJobs;
   * endDate may be null (renders as a single-day bar). */
  startDate: string | null;
  endDate: string | null;
}

export interface BookingMonth {
  /** "2026-10" */
  key: string;
  /** "Oct 2026" */
  label: string;
  committedDollars: number;
  jobCount: number;
  jobs: BookingJob[];
}

export interface SeasonalBookings {
  months: BookingMonth[];
  seasonTotalDollars: number;
  seasonTotalJobs: number;
  /** Committed jobs (see COMMITTED_STATUSES) with no scheduled_start_date
   * set — can't be placed on the calendar. Not scoped to monthsForward
   * (there's no month to fall in/out of range), always the full set. */
  unscheduledJobs: BookingJob[];
}

function toBookingJob(
  project: Project,
  quotesByProject: Map<string, Quote[]>,
  changeOrdersByProject: Map<string, ChangeOrder[]>,
  opportunitiesByProjectId: Map<string, Opportunity>,
): BookingJob {
  return {
    projectId: project.id,
    projectName: project.name,
    clientName: project.client?.name ?? null,
    status: project.status,
    contractDollars: projectContractValue(
      quotesByProject.get(project.id) ?? [],
      changeOrdersByProject.get(project.id) ?? [],
    ),
    scopeLabel: jobSizeLabel(project, opportunitiesByProjectId, quotesByProject),
    startDate: project.scheduled_start_date,
    endDate: project.scheduled_end_date,
  };
}

/**
 * Groups committed jobs (see COMMITTED_STATUSES) by the month their
 * scheduled_start_date falls in (0058 — a job spanning multiple months
 * counts fully toward its start month, never split/double-counted), across
 * the next `monthsForward` calendar months (default 6, starting this
 * month). Each project's dollar value is its real contract value
 * (projectContractValue — headline quote + approved change orders), keyed
 * off `quotesByProject`/`changeOrdersByProject` maps the caller builds from
 * listQuotes()/listChangeOrders(); scope labels come from jobSizeLabel(),
 * keyed off an `opportunitiesByProjectId` map the caller builds from
 * listOpportunities().
 *
 * Previously also computed a capacity/"Room for N" fullness figure per
 * month (against a Settings > Seasonal capacity page) — removed as not
 * useful, along with that page and its setting.
 */
export function seasonalBookings(
  projects: Project[],
  quotesByProject: Map<string, Quote[]>,
  changeOrdersByProject: Map<string, ChangeOrder[]>,
  opportunitiesByProjectId: Map<string, Opportunity>,
  monthsForward = 6,
  from: Date = new Date(),
): SeasonalBookings {
  const months: BookingMonth[] = [];
  for (let i = 0; i < monthsForward; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      committedDollars: 0,
      jobCount: 0,
      jobs: [],
    });
  }
  const byKey = new Map(months.map((m) => [m.key, m]));
  const unscheduledJobs: BookingJob[] = [];

  for (const p of projects) {
    if (!COMMITTED_STATUSES.includes(p.status)) continue;
    const job = toBookingJob(p, quotesByProject, changeOrdersByProject, opportunitiesByProjectId);

    if (!p.scheduled_start_date) {
      unscheduledJobs.push(job);
      continue;
    }
    const month = byKey.get(p.scheduled_start_date.slice(0, 7));
    if (!month) continue;
    month.committedDollars += job.contractDollars;
    month.jobCount += 1;
    month.jobs.push(job);
  }

  return {
    months,
    seasonTotalDollars: months.reduce((s, m) => s + m.committedDollars, 0),
    seasonTotalJobs: months.reduce((s, m) => s + m.jobCount, 0),
    unscheduledJobs,
  };
}
