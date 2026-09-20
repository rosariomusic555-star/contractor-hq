import type { Project } from "./api";

const parseLocal = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

const todayISO = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** Inclusive count of Mon–Fri days in [start, end]. 0 if end < start — a job
 * idle over a weekend shouldn't read as behind, since weekends never add to
 * the count either way. */
export function countWorkingDays(startISO: string, endISO: string): number {
  const start = parseLocal(startISO);
  const end = parseLocal(endISO);
  if (end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export type ProjectDurationStatus =
  | { state: "empty" }
  | { state: "not_started"; estimateDays: number }
  | { state: "in_progress"; estimateDays: number; elapsedDays: number; overDays: number }
  | { state: "complete"; estimateDays: number; totalDays: number; diffDays: number };

/** Derives the Estimated duration card's status. Elapsed/total days count
 * working days from the *actual* start date, never the scheduled one — the
 * estimate is measured against real progress, not the plan. */
export function projectDurationStatus(
  project: Pick<Project, "estimated_duration_days" | "actual_start_date" | "actual_end_date">,
  now: Date = new Date(),
): ProjectDurationStatus {
  const estimateDays = project.estimated_duration_days;
  if (!estimateDays) return { state: "empty" };
  if (!project.actual_start_date) return { state: "not_started", estimateDays };

  if (project.actual_end_date) {
    const totalDays = countWorkingDays(project.actual_start_date, project.actual_end_date);
    return { state: "complete", estimateDays, totalDays, diffDays: totalDays - estimateDays };
  }

  const elapsedDays = countWorkingDays(project.actual_start_date, todayISO(now));
  return { state: "in_progress", estimateDays, elapsedDays, overDays: Math.max(0, elapsedDays - estimateDays) };
}

/** Working days available in the *planned* crew window (the Schedule
 * card's own dates) — null if either scheduled date is missing. */
export function scheduledWindowWorkingDays(
  project: Pick<Project, "scheduled_start_date" | "scheduled_end_date">,
): number | null {
  if (!project.scheduled_start_date || !project.scheduled_end_date) return null;
  return countWorkingDays(project.scheduled_start_date, project.scheduled_end_date);
}
