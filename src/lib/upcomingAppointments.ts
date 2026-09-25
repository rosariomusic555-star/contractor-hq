import type { Appointment, Opportunity, Project } from "./api";
import { appointmentTimeLabel, compareAppointments } from "./appointmentTime";

export interface UpcomingAppointmentRow {
  appointment: Appointment;
  /** "2026-09-23" (local) — also the key used to match against the Weather
   * Strip's own `DayForecast.date`. */
  dayKey: string;
  /** "Today" / "Tomorrow" / "Wed, Sep 23" */
  dayLabel: string;
  /** "9:00 AM", or null for date-only appointments (no time to show) */
  timeLabel: string | null;
  isToday: boolean;
  projectId: string | null;
  projectName: string | null;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Today" / "Tomorrow" / a short "Wed, Sep 23" date — same tiering as
 * material orders' deliveryDayLabel(), just a different (shorter, always-
 * dated) third tier since this card's window never exceeds a week. */
export function appointmentDayLabel(date: Date, from: Date = new Date()): string {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Scheduled appointments in the next `windowDays` (default 7), soonest
 * first — the Dashboard "Upcoming appointments" card's exact list. Project
 * linkage is indirect (appointment -> opportunity -> project), same lookup
 * shape OngoingJobsCard already uses for job size.
 */
export function upcomingAppointmentRows(
  appointments: Appointment[],
  opportunitiesById: Map<string, Opportunity>,
  projectsById: Map<string, Project>,
  windowDays = 7,
  from: Date = new Date(),
): UpcomingAppointmentRow[] {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  const rows: UpcomingAppointmentRow[] = [];
  for (const a of appointments) {
    if (a.status !== "scheduled") continue;
    const dt = new Date(a.date_time);
    const dayStart = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    if (dayStart < today || dayStart >= windowEnd) continue;

    const opportunity = a.opportunity_id ? opportunitiesById.get(a.opportunity_id) : null;
    const project = opportunity?.project_id ? projectsById.get(opportunity.project_id) : null;

    rows.push({
      appointment: a,
      dayKey: ymd(dt),
      dayLabel: appointmentDayLabel(dt, from),
      timeLabel: appointmentTimeLabel(a),
      isToday: dayStart.getTime() === today.getTime(),
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
    });
  }

  // By day, date-only items first within a day, then by time.
  return rows.sort((a, b) => compareAppointments(a.appointment, b.appointment));
}
